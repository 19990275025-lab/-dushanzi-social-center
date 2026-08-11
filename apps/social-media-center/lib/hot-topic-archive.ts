import * as XLSX from "xlsx";
import { calculateHotTopicActionScore, topicContentDirection } from "@/lib/hot-topic-action-score";

export type HotTopicArchiveRow = {
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
  ai_summary: string | null;
  generated_at: string;
};

type SourceRow = {
  hot_topic_id: number;
  topic_name: string;
  platform: string;
  topic_type: string;
  heat_value: number;
  ranking: number | null;
  category: string | null;
  collect_time: string;
  source_agent: string | null;
  ai_score: number | null;
  recommend_follow: number | null;
  recommendation_reason: string | null;
  recommended_title: string | null;
  shooting_direction: string | null;
  live_theme: string | null;
  related_post_id: number | null;
  related_post_title: string | null;
  effect_score: number | null;
  ai_summary: string | null;
};

export function beijingDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function archiveFileName(date: string) {
  return `${date}_新媒体热点分析报告.xlsx`;
}

export function archiveObjectKey(date: string) {
  return `hot-topic-archive/${archiveFileName(date)}`;
}

export async function archiveDailyHotTopics(d1: D1Database, date: string) {
  const result = await d1.prepare(`
    SELECT h.id AS hot_topic_id, h.topic_name, h.platform, h.topic_type, h.heat_value,
      h.ranking, h.category, h.collect_time, h.source_agent,
      COALESCE(a.relevance_score, h.hot_score) AS ai_score,
      a.recommend_follow, a.recommendation_reason,
      COALESCE(a.recommended_title, h.recommended_topic) AS recommended_title,
      COALESCE(a.shooting_direction, h.video_direction) AS shooting_direction,
      COALESCE(a.live_theme, h.publish_time_suggestion) AS live_theme,
      f.related_post_id, p.title AS related_post_title, f.effect_score, f.ai_summary
    FROM hot_topics h
    LEFT JOIN hot_topic_analysis a ON a.id = (
      SELECT candidate.id FROM hot_topic_analysis candidate
      WHERE candidate.hot_topic_id = h.id
      ORDER BY CASE WHEN candidate.analysis_source = 'WorkBuddy热点监测报告' THEN 0 ELSE 1 END,
        candidate.created_at DESC, candidate.id DESC LIMIT 1
    )
    LEFT JOIN hot_topic_feedback f ON f.id = (
      SELECT candidate.id FROM hot_topic_feedback candidate
      WHERE candidate.hot_topic_id = h.id
      ORDER BY CASE WHEN candidate.related_post_id IS NULL THEN 1 ELSE 0 END,
        candidate.recommended_at DESC, candidate.id DESC LIMIT 1
    )
    LEFT JOIN social_posts p ON p.id = f.related_post_id
    WHERE COALESCE(h.collection_date, date(datetime(COALESCE(h.collect_time, h.created_at), '+8 hours'))) = ?
      AND h.status = 'active'
    ORDER BY CASE WHEN h.ranking IS NULL THEN 1 ELSE 0 END, h.ranking, h.id
  `).bind(date).all<SourceRow>();
  const rows = result.results ?? [];
  if (!rows.length) return { archiveDate: date, archivedCount: 0 };
  await d1.batch(rows.map((row) => {
    const score = calculateHotTopicActionScore({
      heatValue: row.heat_value,
      relevanceScore: Number(row.ai_score ?? 0),
      recommendFollow: Boolean(row.recommend_follow),
      recommendationReason: row.recommendation_reason,
      topicName: row.topic_name,
      keyword: row.topic_name,
      category: row.category,
      recommendedTitle: row.recommended_title,
      shootingDirection: row.shooting_direction,
      liveTheme: row.live_theme,
    });
    return d1.prepare(`
      INSERT INTO hot_topic_archive (
        archive_date, hot_topic_id, topic_name, platform, topic_type, heat_value,
        ai_score, recommendation_level, recommended_title, content_direction,
        related_post_id, effect_score, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(archive_date, hot_topic_id) DO UPDATE SET
        topic_name = excluded.topic_name, platform = excluded.platform,
        topic_type = excluded.topic_type, heat_value = excluded.heat_value,
        ai_score = excluded.ai_score, recommendation_level = excluded.recommendation_level,
        recommended_title = excluded.recommended_title, content_direction = excluded.content_direction,
        related_post_id = excluded.related_post_id, effect_score = excluded.effect_score,
        generated_at = CURRENT_TIMESTAMP
    `).bind(date, row.hot_topic_id, row.topic_name, row.platform, row.topic_type, row.heat_value,
      row.ai_score, score.level, row.recommended_title, topicContentDirection(row.category, row.platform),
      row.related_post_id, row.effect_score);
  }));
  return { archiveDate: date, archivedCount: rows.length };
}

export async function readArchiveRows(d1: D1Database, date: string) {
  const result = await d1.prepare(`
    SELECT a.id, a.archive_date, a.hot_topic_id, a.topic_name, a.platform, a.topic_type,
      a.heat_value, a.ai_score, a.recommendation_level, a.recommended_title,
      a.content_direction, a.related_post_id, p.title AS related_post_title,
      a.effect_score, f.ai_summary, a.generated_at
    FROM hot_topic_archive a
    LEFT JOIN social_posts p ON p.id = a.related_post_id
    LEFT JOIN hot_topic_feedback f ON f.id = (
      SELECT candidate.id FROM hot_topic_feedback candidate
      WHERE candidate.hot_topic_id = a.hot_topic_id
        AND candidate.related_post_id = a.related_post_id
      ORDER BY candidate.evaluated_at DESC, candidate.id DESC LIMIT 1
    )
    WHERE a.archive_date = ?
    ORDER BY CASE a.recommendation_level WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END,
      COALESCE(a.ai_score, 0) DESC, a.id
  `).bind(date).all<HotTopicArchiveRow>();
  return result.results ?? [];
}

function addSheet(workbook: XLSX.WorkBook, name: string, rows: Record<string, unknown>[], widths: number[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  if (rows.length) worksheet["!autofilter"] = { ref: worksheet["!ref"] ?? "A1:A1" };
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

export function buildHotTopicArchiveWorkbook(rows: HotTopicArchiveRow[], date: string) {
  const workbook = XLSX.utils.book_new();
  const scored = rows.filter((row) => row.effect_score !== null);
  const summary = XLSX.utils.aoa_to_sheet([
    ["独山子大峡谷AI营销中台 · 新媒体热点分析报告"],
    ["报告日期", date],
    ["热点总数", rows.length],
    ["A级推荐", rows.filter((row) => row.recommendation_level === "A").length],
    ["B级推荐", rows.filter((row) => row.recommendation_level === "B").length],
    ["C级推荐", rows.filter((row) => row.recommendation_level === "C").length],
    ["已关联作品", rows.filter((row) => row.related_post_id !== null).length],
    ["平均效果评分", scored.length ? Math.round(scored.reduce((sum, row) => sum + Number(row.effect_score), 0) / scored.length * 10) / 10 : "暂无样本"],
    ["数据来源", "hot_topics + hot_topic_analysis + hot_topic_feedback"],
  ]);
  summary["!cols"] = [{ wch: 20 }, { wch: 68 }];
  XLSX.utils.book_append_sheet(workbook, summary, "报告总览");
  addSheet(workbook, "原始热点", rows.map((row) => ({
    日期: row.archive_date, 平台: row.platform, 热点类型: row.topic_type,
    热点名称: row.topic_name, 热度: row.heat_value,
  })), [14, 12, 18, 58, 14]);
  addSheet(workbook, "AI分析", rows.map((row) => ({
    热点名称: row.topic_name, 平台: row.platform, AI评分: row.ai_score ?? "待分析",
    推荐等级: row.recommendation_level,
  })), [58, 12, 14, 14]);
  addSheet(workbook, "推荐建议", rows.map((row) => ({
    热点名称: row.topic_name, 推荐等级: row.recommendation_level,
    推荐标题: row.recommended_title ?? "待生成", 内容方向: row.content_direction ?? "待生成",
  })), [52, 14, 58, 38]);
  addSheet(workbook, "效果复盘", rows.map((row) => ({
    热点名称: row.topic_name, 关联作品: row.related_post_title ?? "未关联",
    效果评分: row.effect_score ?? "待评估", AI总结: row.ai_summary ?? "待关联作品后生成",
  })), [52, 58, 14, 68]);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
}

export async function generateAndStoreDailyArchive(d1: D1Database, uploads: R2Bucket, date: string) {
  const result = await archiveDailyHotTopics(d1, date);
  const rows = await readArchiveRows(d1, date);
  const buffer = buildHotTopicArchiveWorkbook(rows, date);
  const fileName = archiveFileName(date);
  await uploads.put(archiveObjectKey(date), buffer, {
    httpMetadata: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    customMetadata: { archiveDate: date, recordCount: String(rows.length), source: "热点档案库V4.0" },
  });
  return { ...result, fileName, rows };
}
