import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { analyzeWorkBuddyTopic, type WorkBuddyHotTopic } from "@/lib/workbuddy-hot-topic";

type Row = {
  id: number; platform: WorkBuddyHotTopic["platform"]; rank: number; topic_title: string;
  heat_value: string; keyword: string; url: string | null; publish_time: string | null;
  category: string | null;
};

export async function POST(request: Request) {
  const payload = await request.json() as { id?: number };
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "热点编号无效" }, { status: 400 });
  await ensureDatabase();
  const d1 = getD1();
  const [row, posts, hotTopics] = await Promise.all([
    d1.prepare(`SELECT id, platform, ranking AS rank, topic_name AS topic_title,
      CAST(heat_value AS TEXT) AS heat_value, keyword, source_url AS url,
      collect_time AS publish_time, category
      FROM hot_topics WHERE id = ? AND status = 'active'`).bind(id).first<Row>(),
    d1.prepare(`SELECT title, hashtags FROM social_posts ORDER BY publish_time DESC, id DESC LIMIT 300`)
      .all<{ title: string; hashtags: string | null }>(),
    d1.prepare(`SELECT topic_name AS topic_title, keyword, category FROM hot_topics
      WHERE status = 'active' ORDER BY ranking ASC, id DESC LIMIT 500`)
      .all<{ topic_title: string; keyword: string; category: string | null }>(),
  ]);
  if (!row) return Response.json({ error: "热点不存在" }, { status: 404 });
  const historicalContext = [
    ...posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`),
    ...hotTopics.results.map((topic) => `${topic.topic_title} ${topic.keyword} ${topic.category ?? ""}`),
  ].join(" ");
  const ai = analyzeWorkBuddyTopic({
    rowNumber: 1, platform: row.platform, rank: row.rank, topicTitle: row.topic_title,
    heatValue: row.heat_value, keyword: row.keyword, url: row.url,
    publishTime: row.publish_time, category: row.category, sourceAgent: "WorkBuddy热点监测Agent",
  }, historicalContext);
  await d1.prepare(`
    INSERT INTO hot_topic_analysis
      (hot_topic_id, relevance_score, recommend_follow, recommendation_reason,
       recommended_title, shooting_direction, live_theme, analysis_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, '系统规则分析V1.0')
    ON CONFLICT(hot_topic_id, analysis_source) DO UPDATE SET
      relevance_score = excluded.relevance_score,
      recommend_follow = excluded.recommend_follow,
      recommendation_reason = excluded.recommendation_reason,
      recommended_title = excluded.recommended_title,
      shooting_direction = excluded.shooting_direction,
      live_theme = excluded.live_theme,
      created_at = CURRENT_TIMESTAMP
  `).bind(
    id, ai.relevanceScore, ai.worthFollowing ? 1 : 0, ai.analysis,
    ai.shortVideoTitle, ai.shootingDirection, ai.liveTheme,
  ).run();
  return Response.json({ id, ai });
}
