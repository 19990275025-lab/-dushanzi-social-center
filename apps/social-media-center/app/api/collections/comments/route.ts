import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  normalizeCommentCollectionPayload,
  validateCommentCollectionPayload,
} from "@/lib/comment-collections";

export async function POST(request: Request) {
  await ensureDatabase();
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return Response.json({ error: "评论采集文件不是有效的 JSON" }, { status: 400 });
  }

  const payload = normalizeCommentCollectionPayload(rawPayload);
  if (!payload) return Response.json({ error: "评论采集文件结构无效" }, { status: 400 });

  const errors = validateCommentCollectionPayload(payload);
  const status = errors.length ? "failed" : "pending";
  const errorMessage = errors.length ? JSON.stringify(errors.slice(0, 100)) : null;
  const sourceName = `douyin-comments-${payload.collectedAt.slice(0, 19).replaceAll(":", "-") || "unknown"}.json`;
  const log = await getD1()
    .prepare(`
      INSERT INTO collection_logs
        (platform, source_type, source_name, source_url, entity_type, status,
         total_count, success_count, error_count, comment_count, error_message,
         collected_at, updated_at)
      VALUES ('douyin', 'chrome', ?, ?, 'comment', ?, ?, 0, ?, 0, ?, ?, CURRENT_TIMESTAMP)
      RETURNING id, platform, source_type, source_name, source_url, entity_type,
        status, total_count, success_count, error_count, comment_count,
        collected_at, created_at
    `)
    .bind(
      sourceName,
      payload.pageUrl.slice(0, 2000),
      status,
      payload.rows.length,
      errors.length,
      errorMessage,
      payload.collectedAt,
    )
    .first();

  if (!log) return Response.json({ error: "无法创建评论采集日志" }, { status: 500 });
  if (errors.length) {
    return Response.json({ error: "评论数据校验失败，未写入评论表", errors, log }, { status: 422 });
  }
  return Response.json({ log, payload }, { status: 201 });
}
