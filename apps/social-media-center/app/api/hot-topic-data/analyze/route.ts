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
  const [row, posts] = await Promise.all([
    d1.prepare(`SELECT id, platform, rank, topic_title, heat_value, keyword, url, publish_time, category
      FROM HOT_TOPIC_DATA WHERE id = ?`).bind(id).first<Row>(),
    d1.prepare(`SELECT title, hashtags FROM social_posts ORDER BY publish_time DESC, id DESC LIMIT 300`)
      .all<{ title: string; hashtags: string | null }>(),
  ]);
  if (!row) return Response.json({ error: "热点不存在" }, { status: 404 });
  const ai = analyzeWorkBuddyTopic({
    rowNumber: 1, platform: row.platform, rank: row.rank, topicTitle: row.topic_title,
    heatValue: row.heat_value, keyword: row.keyword, url: row.url,
    publishTime: row.publish_time, category: row.category, sourceAgent: "WorkBuddy热点监测Agent",
  }, posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`).join(" "));
  await d1.prepare(`UPDATE HOT_TOPIC_DATA SET ai_relevance_score = ?, ai_analysis = ?, ai_recommendation = ? WHERE id = ?`)
    .bind(ai.relevanceScore,
      JSON.stringify({ worthFollowing: ai.worthFollowing, worthFollowingLabel: ai.worthFollowingLabel, analysis: ai.analysis }),
      JSON.stringify({ shootingDirection: ai.shootingDirection, shortVideoTitle: ai.shortVideoTitle, liveTheme: ai.liveTheme }), id).run();
  return Response.json({ id, ai });
}

