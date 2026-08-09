import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { buildDouyinHotTopicPreview } from "@/lib/douyin-hot-topic-preview";

export async function GET() {
  await ensureDatabase();
  const posts = await getD1().prepare(`
    SELECT title, hashtags FROM social_posts
    WHERE platform = 'douyin'
    ORDER BY publish_time DESC, id DESC LIMIT 200
  `).all<{ title: string; hashtags: string }>();
  const historicalText = posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`).join(" ");
  return Response.json(buildDouyinHotTopicPreview(historicalText), {
    headers: { "cache-control": "no-store" },
  });
}
