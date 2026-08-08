import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  normalizeCommentCollectionPayload,
  validateCommentCollectionPayload,
} from "@/lib/comment-collections";

type CommentLog = { id: number; platform: string; source_type: string; entity_type: string; status: string };
type PostMatch = { id: number; video_url: string };
type ExistingComment = { post_id: number; username: string; comment_text: string; comment_time: string };

async function markFailed(id: number, errorCount: number, message: string) {
  await getD1()
    .prepare(`UPDATE collection_logs SET status = 'failed', error_count = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(Math.max(1, errorCount), message.slice(0, 4000), id)
    .run();
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = (await request.json()) as { logId?: number; payload?: unknown };
  const logId = Number(body.logId);
  const payload = normalizeCommentCollectionPayload(body.payload);
  if (!Number.isInteger(logId) || logId <= 0 || !payload) {
    return Response.json({ error: "评论确认参数无效" }, { status: 400 });
  }

  const d1 = getD1();
  const log = await d1
    .prepare("SELECT id, platform, source_type, entity_type, status FROM collection_logs WHERE id = ?")
    .bind(logId)
    .first<CommentLog>();
  if (!log || log.platform !== "douyin" || log.source_type !== "chrome" || log.entity_type !== "comment") {
    return Response.json({ error: "评论采集日志与数据来源不一致" }, { status: 409 });
  }
  if (log.status !== "pending") return Response.json({ error: "该评论采集批次不是待确认状态" }, { status: 409 });

  const errors = validateCommentCollectionPayload(payload);
  if (errors.length) {
    await markFailed(logId, errors.length, JSON.stringify(errors.slice(0, 100)));
    return Response.json({ error: "评论数据复核失败，未写入任何评论", errors }, { status: 422 });
  }

  const urls = [...new Set(payload.rows.map((row) => row.postUrl))];
  const marks = urls.map(() => "?").join(",");
  const posts = await d1
    .prepare(`SELECT id, video_url FROM social_posts WHERE platform = 'douyin' AND video_url IN (${marks})`)
    .bind(...urls)
    .all<PostMatch>();
  const postIds = new Map(posts.results.map((post) => [post.video_url, post.id]));
  const missingUrls = urls.filter((url) => !postIds.has(url));
  if (missingUrls.length) {
    await markFailed(logId, missingUrls.length, `未找到对应作品：${missingUrls.join(", ")}`);
    return Response.json({ error: "部分评论对应的作品尚未写入 social_posts，未写入任何评论", missingUrls }, { status: 409 });
  }

  const ids = [...postIds.values()];
  const existing = await d1
    .prepare(`SELECT post_id, username, comment_text, comment_time FROM social_comments WHERE post_id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<ExistingComment>();
  const fingerprints = new Set(existing.results.map((item) => `${item.post_id}\n${item.username}\n${item.comment_text}\n${item.comment_time}`));
  const duplicates = payload.rows.filter((row) => fingerprints.has(`${postIds.get(row.postUrl)}\n${row.username}\n${row.commentText}\n${new Date(row.commentTime).toISOString()}`));
  if (duplicates.length) {
    await markFailed(logId, duplicates.length, `发现 ${duplicates.length} 条重复评论`);
    return Response.json({ error: "发现重复评论，未写入任何数据", errors: duplicates.map((row) => ({ rowNumber: row.rowNumber, field: "commentText", message: "评论已存在" })) }, { status: 409 });
  }

  const inserts = payload.rows.map((row) => d1
    .prepare(`
      INSERT INTO social_comments
        (post_id, platform, username, comment_text, comment_time, likes,
         sentiment, collection_log_id)
      VALUES (?, 'douyin', ?, ?, ?, ?, 'unknown', ?)
    `)
    .bind(postIds.get(row.postUrl), row.username, row.commentText, new Date(row.commentTime).toISOString(), row.likes, logId));

  try {
    await d1.batch([
      ...inserts,
      d1.prepare(`
        UPDATE collection_logs
        SET status = 'completed', success_count = ?, comment_count = ?,
          error_count = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(payload.rows.length, payload.rows.length, logId),
    ]);
  } catch {
    await markFailed(logId, payload.rows.length, "评论数据库写入失败");
    return Response.json({ error: "评论数据库写入失败，事务已回滚" }, { status: 500 });
  }

  return Response.json({ successCount: payload.rows.length, message: `${payload.rows.length} 条抖音评论已写入 social_comments` });
}
