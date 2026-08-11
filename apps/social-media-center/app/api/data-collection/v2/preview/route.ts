import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  collectionApiAuthorized,
  collectionApiHeaders,
  collectionApiJson,
  parseJsonArray,
  parseJsonObject,
  parsePositiveId,
} from "@/lib/data-collection-api-v2";

type StagingRow = {
  id: number;
  record_index: number;
  data_type: string;
  platform: string | null;
  source: string;
  normalized_payload: string | null;
  raw_payload: string;
  validation_status: string;
  validation_errors: string;
  confirmed_at: string | null;
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: collectionApiHeaders() });
}

export async function GET(request: Request) {
  if (!collectionApiAuthorized(request)) return collectionApiJson({ error: "采集接口密钥无效" }, { status: 401 });
  const url = new URL(request.url);
  const id = parsePositiveId(url.searchParams.get("id"));
  if (!id) return collectionApiJson({ error: "批次id无效" }, { status: 400 });
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size")) || 50));

  await ensureDatabase();
  const d1 = getD1();
  const [log, records] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, source_type, source_name, entity_type, status,
        total_count, success_count, error_count, comment_count, error_message,
        collected_at, created_at, updated_at
      FROM collection_logs WHERE id = ? AND source_type = 'api'
    `).bind(id).first<Record<string, unknown>>(),
    d1.prepare(`
      SELECT id, record_index, data_type, platform, source, normalized_payload,
        raw_payload, validation_status, validation_errors, confirmed_at
      FROM collection_staging_records
      WHERE collection_log_id = ?
      ORDER BY record_index
      LIMIT ? OFFSET ?
    `).bind(id, pageSize, (page - 1) * pageSize).all<StagingRow>(),
  ]);

  if (!log) return collectionApiJson({ error: "采集批次不存在" }, { status: 404 });
  return collectionApiJson({
    batch: log,
    page,
    pageSize,
    totalCount: Number(log.total_count ?? 0),
    records: records.results.map((row: StagingRow) => ({
      id: row.id,
      index: row.record_index,
      dataType: row.data_type,
      platform: row.platform,
      source: row.source,
      normalized: parseJsonObject<Record<string, unknown>>(row.normalized_payload),
      raw: parseJsonObject<Record<string, unknown>>(row.raw_payload),
      validationStatus: row.validation_status,
      errors: parseJsonArray<string>(row.validation_errors),
      confirmedAt: row.confirmed_at,
    })),
    databaseWritten: log.status === "completed",
  });
}
