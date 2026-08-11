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
  analysis_id: number | null;
  recommend_follow: number | null;
  recommendation_reason: string | null;
  analysis_source: string | null;
};

export async function GET(request: Request) {
  await ensureDatabase();
  const requestedPlatform = new URL(request.url).searchParams.get("platform") ?? "all";
  const params = new URL(request.url).searchParams;
  const platform = platforms.has(requestedPlatform) ? requestedPlatform : "all";
  const from = params.get("from");
  const to = params.get("to");
  const hasDateRange = Boolean(from && to && datePattern.test(from) && datePattern.test(to) && from <= to);
  const conditions = ["h.status = 'active'"];
  const bindings: string[] = [];
  if (platform !== "all") {
    conditions.push("h.platform = ?");
    bindings.push(platform);
  }
  if (hasDateRange) {
    conditions.push("COALESCE(h.collection_date, date(datetime(COALESCE(h.collect_time, h.created_at), '+8 hours'))) BETWEEN ? AND ?");
    bindings.push(from as string, to as string);
  }
  const statement = getD1().prepare(`
    SELECT h.id, h.platform, h.ranking AS rank, h.topic_name AS topic_title, h.heat_value, h.keyword,
      h.source_url AS url, h.collect_time AS publish_time, h.collect_time,
      COALESCE(h.collection_date, date(datetime(COALESCE(h.collect_time, h.created_at), '+8 hours'))) AS collection_date,
      h.category, COALESCE(NULLIF(h.source_agent, ''), NULLIF(h.source, ''), 'WorkBuddy热点监测Agent') AS source_agent,
      COALESCE(a.relevance_score, h.hot_score) AS ai_relevance_score,
      CASE WHEN a.id IS NULL THEN h.ai_suggestion ELSE NULL END AS ai_analysis,
      COALESCE(a.recommended_title, h.recommended_topic) AS recommended_topic,
      COALESCE(a.shooting_direction, h.video_direction) AS video_direction,
      COALESCE(a.live_theme, h.publish_time_suggestion) AS publish_time_suggestion,
      a.id AS analysis_id, a.recommend_follow, a.recommendation_reason, a.analysis_source
    FROM hot_topics h
    LEFT JOIN hot_topic_analysis a ON a.id = (
      SELECT candidate.id FROM hot_topic_analysis candidate
      WHERE candidate.hot_topic_id = h.id
      ORDER BY CASE WHEN candidate.analysis_source = 'WorkBuddy热点监测报告' THEN 0 ELSE 1 END,
        candidate.created_at DESC, candidate.id DESC
      LIMIT 1
    )
    WHERE ${conditions.join(" AND ")}
    ORDER BY CASE WHEN h.ranking IS NULL THEN 1 ELSE 0 END, h.ranking ASC, h.id DESC
    LIMIT 500
  `);
  const result = await (bindings.length ? statement.bind(...bindings) : statement).all<HotTopicRow>();
  const topics = result.results.map((topic) => ({
    ...topic,
    rank: topic.rank ?? 999,
    heat_value: String(topic.heat_value),
    ai_analysis: topic.analysis_id === null ? topic.ai_analysis : JSON.stringify({
      worthFollowing: Boolean(topic.recommend_follow),
      worthFollowingLabel: topic.recommend_follow ? "建议跟进" : "暂不直接跟进",
      analysis: topic.recommendation_reason,
    }),
    ai_recommendation: topic.ai_relevance_score === null ? null : JSON.stringify({
      shootingDirection: topic.video_direction ?? "等待补充拍摄方向。",
      shortVideoTitle: topic.recommended_topic ?? `独山子大峡谷 × ${topic.keyword}`,
      liveTheme: topic.publish_time_suggestion ?? "等待补充直播主题。",
    }),
  }));
  return Response.json({ topics, sourceAgent: "WorkBuddy热点监测Agent" });
}
