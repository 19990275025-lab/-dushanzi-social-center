import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

const platforms = new Set(["douyin", "kuaishou", "weibo", "web"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type HotTopicRow = {
  id: number;
  platform: string;
  rank: number;
  topic_title: string;
  heat_value: number;
  keyword: string;
  url: string | null;
  publish_time: string | null;
  collect_time: string;
  collection_date: string;
  category: string | null;
  source_agent: string;
  ai_relevance_score: number | null;
  ai_analysis: string | null;
  recommended_topic: string | null;
  video_direction: string | null;
  publish_time_suggestion: string | null;
};

export async function GET(request: Request) {
  await ensureDatabase();
  const requestedPlatform = new URL(request.url).searchParams.get("platform") ?? "all";
  const params = new URL(request.url).searchParams;
  const platform = platforms.has(requestedPlatform) ? requestedPlatform : "all";
  const from = params.get("from");
  const to = params.get("to");
  const hasDateRange = Boolean(from && to && datePattern.test(from) && datePattern.test(to) && from <= to);
  const conditions = ["status = 'active'"];
  const bindings: string[] = [];
  if (platform !== "all") {
    conditions.push("platform = ?");
    bindings.push(platform);
  }
  if (hasDateRange) {
    conditions.push("COALESCE(collection_date, date(datetime(COALESCE(collect_time, created_at), '+8 hours'))) BETWEEN ? AND ?");
    bindings.push(from as string, to as string);
  }
  const statement = getD1().prepare(`
    SELECT id, platform, ranking AS rank, topic_name AS topic_title, heat_value, keyword,
      source_url AS url, collect_time AS publish_time, collect_time,
      COALESCE(collection_date, date(datetime(COALESCE(collect_time, created_at), '+8 hours'))) AS collection_date,
      category, COALESCE(NULLIF(source_agent, ''), NULLIF(source, ''), 'WorkBuddy热点监测Agent') AS source_agent,
      hot_score AS ai_relevance_score, ai_suggestion AS ai_analysis,
      recommended_topic, video_direction, publish_time_suggestion
    FROM hot_topics
    WHERE ${conditions.join(" AND ")}
    ORDER BY CASE WHEN ranking IS NULL THEN 1 ELSE 0 END, ranking ASC, id DESC
    LIMIT 500
  `);
  const result = await (bindings.length ? statement.bind(...bindings) : statement).all<HotTopicRow>();
  const topics = result.results.map((topic) => ({
    ...topic,
    rank: topic.rank ?? 999,
    heat_value: String(topic.heat_value),
    ai_recommendation: topic.ai_relevance_score === null ? null : JSON.stringify({
      shootingDirection: topic.video_direction ?? "等待补充拍摄方向。",
      shortVideoTitle: topic.recommended_topic ?? `独山子大峡谷 × ${topic.keyword}`,
      liveTheme: topic.publish_time_suggestion ?? "等待补充直播主题。",
    }),
  }));
  return Response.json({ topics, sourceAgent: "WorkBuddy热点监测Agent" });
}
