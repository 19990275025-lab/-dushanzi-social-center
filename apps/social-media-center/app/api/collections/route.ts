import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { normalizeCollectionPayload, validateCollectionPayload } from "@/lib/collections";

export async function GET() {
  await ensureDatabase();
  const d1 = getD1();
  const [logs, summary] = await Promise.all([
    d1
      .prepare(`
        SELECT id, platform, source_type, source_name, source_url, entity_type, status,
          total_count, success_count, error_count, comment_count, error_message,
          collected_at, created_at, updated_at
        FROM collection_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 50
      `)
      .all(),
    d1
      .prepare(`
        SELECT
          COUNT(*) AS total_logs,
          COALESCE(SUM(CASE WHEN entity_type = 'post' THEN success_count ELSE 0 END), 0) AS imported_posts,
          COALESCE(SUM(comment_count), 0) AS imported_comments,
          COALESCE(SUM(error_count), 0) AS validation_errors,
          MAX(created_at) AS latest_collection
        FROM collection_logs
      `)
      .first(),
  ]);

  return Response.json({ logs: logs.results, summary });
}

export async function POST(request: Request) {
  await ensureDatabase();
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return Response.json({ error: "采集文件不是有效的 JSON" }, { status: 400 });
  }

  const payload = normalizeCollectionPayload(rawPayload);
  if (!payload) {
    return Response.json({ error: "采集文件结构无效" }, { status: 400 });
  }

  const errors = validateCollectionPayload(payload);
  const status = errors.length ? "failed" : "pending";
  const acquisitionFailures = payload.failures ?? [];
  const errorMessage = errors.length
    ? JSON.stringify(errors.slice(0, 100))
    : acquisitionFailures.length
      ? JSON.stringify(acquisitionFailures)
      : null;
  const sourceName = `douyin-chrome-${payload.collectedAt.slice(0, 19).replaceAll(":", "-") || "unknown"}.json`;
  const log = await getD1()
    .prepare(`
      INSERT INTO collection_logs
        (platform, source_type, source_name, source_url, status, total_count,
         success_count, error_count, error_message, collected_at, updated_at)
      VALUES (?, 'chrome', ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING id, platform, source_type, source_name, source_url, status,
        total_count, success_count, error_count, collected_at, created_at
    `)
    .bind(
      payload.platform,
      sourceName,
      payload.pageUrl.slice(0, 2000),
      status,
      payload.rows.length,
      errors.length || acquisitionFailures.length,
      errorMessage,
      payload.collectedAt,
    )
    .first();

  if (!log) return Response.json({ error: "无法创建采集日志" }, { status: 500 });
  if (errors.length) {
    return Response.json(
      { error: "采集数据校验失败，未写入作品数据", errors, log },
      { status: 422 },
    );
  }

  return Response.json({ log, payload }, { status: 201 });
}

export async function DELETE(request: Request) {
  await ensureDatabase();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "采集日志无效" }, { status: 400 });
  }

  const d1 = getD1();
  const log = await d1
    .prepare("SELECT id, status, entity_type FROM collection_logs WHERE id = ?")
    .bind(id)
    .first<{ id: number; status: string; entity_type: string }>();
  if (!log) return Response.json({ error: "采集日志不存在" }, { status: 404 });
  if (log.status === "deleted") {
    return Response.json({ error: "该采集批次已经回滚" }, { status: 409 });
  }

  const deleteRows = log.entity_type === "comment"
    ? d1.prepare("DELETE FROM social_comments WHERE collection_log_id = ?").bind(id)
    : d1.prepare("DELETE FROM social_posts WHERE collection_log_id = ?").bind(id);
  await d1.batch([
    deleteRows,
    d1
      .prepare(`
        UPDATE collection_logs
        SET status = 'deleted', success_count = 0, comment_count = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(id),
  ]);

  return Response.json({ ok: true });
}
