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
  await d1.prepare(`UPDATE hot_topics SET hot_score = ?, related_degree = ?, ai_suggestion = ?,
      video_direction = ?, recommended_topic = ?, publish_time_suggestion = ? WHERE id = ?`)
    .bind(ai.relevanceScore, ai.relevanceScore / 100,
      JSON.stringify({ worthFollowing: ai.worthFollowing, worthFollowingLabel: ai.worthFollowingLabel, analysis: ai.analysis }),
      ai.shootingDirection, ai.shortVideoTitle, ai.liveTheme, id).run();
  return Response.json({ id, ai });
}
