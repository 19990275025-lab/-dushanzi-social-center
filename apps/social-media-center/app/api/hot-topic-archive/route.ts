import { ensureDatabase } from "@/db/bootstrap";
import { getD1, getUploads } from "@/db";
import { beijingDate, generateAndStoreDailyArchive } from "@/lib/hot-topic-archive";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const platforms = new Set(["all", "douyin", "kuaishou", "weibo", "web"]);

type ArchiveRow = {
  id: number;
  archive_date: string;
  hot_topic_id: number;
  topic_name: string;
  platform: string;
  topic_type: string;
  heat_value: number;
  ai_score: number | null;
  recommendation_level: "A" | "B" | "C";
  recommended_title: string | null;
  content_direction: string | null;
  related_post_id: number | null;
  related_post_title: string | null;
  effect_score: number | null;
  generated_at: string;
};

export async function GET(request: Request) {
  await ensureDatabase();
  const params = new URL(request.url).searchParams;
  const date = datePattern.test(params.get("date") ?? "") ? params.get("date") as string : beijingDate();
  const requestedPlatform = params.get("platform") ?? "all";
  const platform = platforms.has(requestedPlatform) ? requestedPlatform : "all";
  const topicType = params.get("topicType")?.trim() ?? "all";
  const d1 = getD1();
  const existing = await d1.prepare("SELECT COUNT(*) AS count FROM hot_topic_archive WHERE archive_date = ?")
    .bind(date).first<{ count: number }>();
  if (date === beijingDate() && Number(existing?.count ?? 0) === 0) {
    await generateAndStoreDailyArchive(d1, getUploads(), date);
  }
  const conditions = ["a.archive_date = ?"];
  const bindings: Array<string> = [date];
  if (platform !== "all") {
    conditions.push("a.platform = ?");
    bindings.push(platform);
  }
  if (topicType !== "all") {
    conditions.push("a.topic_type = ?");
    bindings.push(topicType);
  }
  const [rowsResult, datesResult, typesResult] = await Promise.all([
    d1.prepare(`
      SELECT a.id, a.archive_date, a.hot_topic_id, a.topic_name, a.platform, a.topic_type,
        a.heat_value, a.ai_score, a.recommendation_level, a.recommended_title,
        a.content_direction, a.related_post_id, p.title AS related_post_title,
        a.effect_score, a.generated_at
      FROM hot_topic_archive a
      LEFT JOIN social_posts p ON p.id = a.related_post_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY CASE a.recommendation_level WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END,
        COALESCE(a.ai_score, 0) DESC, a.id
      LIMIT 500
    `).bind(...bindings).all<ArchiveRow>(),
    d1.prepare("SELECT archive_date, COUNT(*) AS count FROM hot_topic_archive GROUP BY archive_date ORDER BY archive_date DESC LIMIT 90")
      .all<{ archive_date: string; count: number }>(),
    d1.prepare("SELECT DISTINCT topic_type FROM hot_topic_archive ORDER BY topic_type")
      .all<{ topic_type: string }>(),
  ]);
  const rows = rowsResult.results ?? [];
  const scored = rows.filter((row) => row.effect_score !== null);
  return Response.json({
    archiveDate: date,
    rows,
    availableDates: datesResult.results ?? [],
    topicTypes: (typesResult.results ?? []).map((row) => row.topic_type),
    summary: {
      total: rows.length,
      aLevel: rows.filter((row) => row.recommendation_level === "A").length,
      linked: rows.filter((row) => row.related_post_id !== null).length,
      averageAiScore: rows.some((row) => row.ai_score !== null)
        ? Math.round(rows.reduce((sum, row) => sum + Number(row.ai_score ?? 0), 0) / rows.filter((row) => row.ai_score !== null).length * 10) / 10
        : 0,
      averageEffectScore: scored.length
        ? Math.round(scored.reduce((sum, row) => sum + Number(row.effect_score), 0) / scored.length * 10) / 10
        : 0,
    },
    reportFileName: `${date}_新媒体热点分析报告.xlsx`,
  });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await request.json().catch(() => ({})) as { date?: string };
  const date = datePattern.test(payload.date ?? "") ? payload.date as string : beijingDate();
  const result = await generateAndStoreDailyArchive(getD1(), getUploads(), date);
  return Response.json({
    archiveDate: date,
    archivedCount: result.archivedCount,
    fileName: result.fileName,
    downloadUrl: `/api/hot-topic-archive/download?date=${date}`,
  });
}
