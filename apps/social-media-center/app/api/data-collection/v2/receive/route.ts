import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  DATA_COLLECTION_V2_MAX_BYTES,
  collectionApiAuthorized,
  collectionApiHeaders,
  collectionApiJson,
} from "@/lib/data-collection-api-v2";
import {
  batchPlatform,
  normalizeCollectionRecords,
  parseCollectionEnvelope,
} from "@/lib/data-collection-v2";
import type { CommentRecord, ContentRecord, HotTopicRecord } from "@/lib/data-collection-v2";

function collectionDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: collectionApiHeaders() });
}

export async function GET(request: Request) {
  if (!collectionApiAuthorized(request)) return collectionApiJson({ error: "采集接口密钥无效" }, { status: 401 });
  return collectionApiJson({
    service: "数据采集标准化接口 V2.1",
    endpoint: "/api/data-collection/v2/receive",
    method: "POST",
    contentType: "application/json",
    dataTypes: ["hot_topic", "content", "comment"],
    platforms: ["douyin", "kuaishou", "weibo"],
    standardFields: {
      hot_topic: ["platform", "source", "topic_type", "topic_name", "ranking", "heat_value", "trend", "keyword", "collect_time"],
      content: ["platform", "source", "title", "publish_time", "views", "likes", "comments", "favorites", "shares"],
      comment: ["platform", "source", "username", "comment_text", "comment_time"],
    },
    linkageFields: {
      content: "account_id（可在批次或记录中提供；平台只有一个启用账号时自动关联）",
      comment: "post_id（可在批次或记录中提供，必须关联现有作品）",
    },
    workflow: ["API接收", "标准化", "数据预览", "人工确认", "数据库"],
    maxRecords: 500,
    actualCollection: false,
  });
}

export async function POST(request: Request) {
  if (!collectionApiAuthorized(request)) return collectionApiJson({ error: "采集接口密钥无效" }, { status: 401 });
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return collectionApiJson({ error: "Content-Type必须是application/json" }, { status: 415 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > DATA_COLLECTION_V2_MAX_BYTES) {
    return collectionApiJson({ error: "请求体不能超过2MB" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return collectionApiJson({ error: "请求体不是有效JSON" }, { status: 400 });
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > DATA_COLLECTION_V2_MAX_BYTES) {
    return collectionApiJson({ error: "请求体不能超过2MB" }, { status: 413 });
  }

  const parsed = parseCollectionEnvelope(payload);
  if (!parsed.envelope) {
    return collectionApiJson({ error: "采集批次格式无效", errors: parsed.errors }, { status: 400 });
  }
  const envelope = parsed.envelope;
  const results = normalizeCollectionRecords(envelope);
  const platform = batchPlatform(envelope, results);
  if (!platform) {
    return collectionApiJson({ error: "一个批次只能包含同一个有效平台" }, { status: 400 });
  }

  await ensureDatabase();
  const d1 = getD1();

  if (envelope.dataType === "content") {
    const accounts = await d1.prepare("SELECT id FROM social_accounts WHERE platform = ? AND status = 'active'")
      .bind(platform).all<{ id: number }>();
    const accountIds = new Set(accounts.results.map((row: { id: number }) => row.id));
    for (const result of results) {
      const record = result.normalized as ContentRecord;
      if (record.account_id === null) {
        if (accounts.results.length === 1) record.account_id = accounts.results[0].id;
        else result.errors.push(accounts.results.length ? "该平台存在多个账号，请提供account_id" : "该平台没有可关联的启用账号");
      } else if (!accountIds.has(record.account_id)) {
        result.errors.push("account_id与当前平台的启用账号不匹配");
      }
    }
  }

  if (envelope.dataType === "comment") {
    const posts = await d1.prepare("SELECT id FROM social_posts WHERE platform = ?")
      .bind(platform).all<{ id: number }>();
    const postIds = new Set(posts.results.map((row: { id: number }) => row.id));
    for (const result of results) {
      const record = result.normalized as CommentRecord;
      if (record.post_id === null) result.errors.push("评论数据必须提供post_id以关联作品");
      else if (!postIds.has(record.post_id)) result.errors.push("post_id对应的作品不存在或平台不匹配");
    }
  }

  let sameDayExistingCount = 0;
  let sameDayDates: string[] = [];
  if (envelope.dataType === "hot_topic") {
    sameDayDates = [...new Set(results
      .filter((result) => !result.errors.length && result.normalized)
      .map((result) => collectionDate((result.normalized as HotTopicRecord).collect_time)))];
    for (const date of sameDayDates) {
      const existing = await d1.prepare(`
        SELECT count(*) AS count FROM hot_topics
        WHERE platform = ? AND source = ? AND collection_date = ?
      `).bind(platform, envelope.source, date).first<{ count: number }>();
      sameDayExistingCount += Number(existing?.count ?? 0);
    }
  }

  const invalidCount = results.filter((result) => result.errors.length).length;
  const status = invalidCount ? "validation_failed" : "pending_confirmation";
  const errorSummary = invalidCount
    ? JSON.stringify(results.filter((result) => result.errors.length).slice(0, 100).map((result) => ({ index: result.index, errors: result.errors })))
    : null;

  const log = await d1.prepare(`
    INSERT INTO collection_logs
      (platform, source_type, source_name, source_url, entity_type, status, total_count,
       success_count, error_count, comment_count, error_message, collected_at, updated_at)
    VALUES (?, 'api', ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, CURRENT_TIMESTAMP)
    RETURNING id, platform, source_type, source_name, entity_type, status,
      total_count, success_count, error_count, collected_at, created_at
  `).bind(
    platform,
    envelope.source,
    envelope.sourceFile,
    envelope.dataType,
    status,
    results.length,
    invalidCount,
    errorSummary,
    envelope.collectedAt,
  ).first<Record<string, unknown>>();

  if (!log?.id) return collectionApiJson({ error: "无法创建采集批次" }, { status: 500 });
  const logId = Number(log.id);
  try {
    await d1.batch(results.map((result) => d1.prepare(`
      INSERT INTO collection_staging_records
        (collection_log_id, record_index, data_type, platform, source,
         normalized_payload, raw_payload, validation_status, validation_errors)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      logId,
      result.index,
      result.dataType,
      result.platform,
      result.source,
      JSON.stringify(result.normalized),
      JSON.stringify(result.raw),
      result.errors.length ? "invalid" : "valid",
      JSON.stringify(result.errors),
    )));
  } catch (error) {
    console.error("V2.1 collection staging failed", error);
    await d1.prepare(`UPDATE collection_logs SET status = 'failed', error_count = total_count,
      error_message = '暂存数据写入失败', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(logId).run();
    return collectionApiJson({ error: "采集批次暂存失败，未写入业务数据", batchId: logId }, { status: 500 });
  }

  return collectionApiJson({
    batchId: logId,
    status,
    dataType: envelope.dataType,
    platform,
    source: envelope.source,
    totalCount: results.length,
    validCount: results.length - invalidCount,
    errorCount: invalidCount,
    preview: results.slice(0, 20).map((result) => ({
      index: result.index,
      normalized: result.normalized,
      validationStatus: result.errors.length ? "invalid" : "valid",
      errors: result.errors,
    })),
    previewUrl: `/api/data-collection/v2/preview?id=${logId}`,
    confirmUrl: `/api/data-collection/v2/confirm?id=${logId}`,
    databaseWritten: false,
    sameDayDates,
    sameDayExistingCount,
    requiresDuplicateDecision: sameDayExistingCount > 0,
  }, { status: 201 });
}
