import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  normalizeWorkBuddyPostsV2,
  summarizeWorkBuddyPostsV2,
  validateWorkBuddyPostsV2,
} from "@/lib/workbuddy-posts-v2";

export async function POST(request: Request) {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return Response.json({ error: "WorkBuddy 作品文件不是有效 JSON" }, { status: 400 });
  }

  const sourceFile = request.headers.get("x-source-file") ?? "douyin_posts_unknown.json";
  const payload = normalizeWorkBuddyPostsV2(rawPayload, sourceFile);
  if (!payload) return Response.json({ error: "WorkBuddy 作品文件结构无效" }, { status: 400 });
  const errors = validateWorkBuddyPostsV2(payload);
  if (errors.length) return Response.json({ error: "作品数据校验失败，未写入数据库", errors }, { status: 422 });

  await ensureDatabase();
  const d1 = getD1();
  const ids = payload.posts.map((post) => post.platformPostId);
  const urls = payload.posts.map((post) => post.postUrl);
  const titles = payload.posts.map((post) => post.title);
  const marks = payload.posts.map(() => "?").join(",");
  const existing = await d1.prepare(`
    SELECT DISTINCT id
    FROM social_posts
    WHERE platform = 'douyin'
      AND (platform_post_id IN (${marks}) OR video_url IN (${marks}) OR post_url IN (${marks}) OR title IN (${marks}))
  `).bind(...ids, ...urls, ...urls, ...titles).all<{ id: number }>();
  const completedBatch = await d1.prepare(`
    SELECT id, status, source_file, collected_at
    FROM collection_logs WHERE batch_key = ? LIMIT 1
  `).bind(payload.batchKey).first();
  const summary = summarizeWorkBuddyPostsV2(payload, existing.results.length);

  return Response.json({
    payload,
    summary,
    completedBatch,
    message: completedBatch
      ? "该 WorkBuddy 采集批次已处理，禁止重复入库。"
      : "作品 V2.0 无落库预览已生成，等待人工确认。",
  });
}
