import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { collectionApiAuthorized, collectionApiHeaders, collectionApiJson } from "@/lib/data-collection-api-v2";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: collectionApiHeaders() });
}

export async function GET(request: Request) {
  if (!collectionApiAuthorized(request)) return collectionApiJson({ error: "采集接口密钥无效" }, { status: 401 });
  const url = new URL(request.url);
  const source = url.searchParams.get("source")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const dataType = url.searchParams.get("data_type")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size")) || 50));
  const conditions = ["source_type = 'api'"];
  const bindings: Array<string | number> = [];
  if (source) { conditions.push("source_name = ?"); bindings.push(source); }
  if (status) { conditions.push("status = ?"); bindings.push(status); }
  if (dataType) { conditions.push("entity_type = ?"); bindings.push(dataType); }

  await ensureDatabase();
  const d1 = getD1();
  const where = conditions.join(" AND ");
  const [records, count] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, source_name AS source, entity_type AS data_type, status,
        total_count, success_count, error_count, comment_count, error_message,
        collected_at, created_at, updated_at
      FROM collection_logs WHERE ${where}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).bind(...bindings, pageSize, (page - 1) * pageSize).all(),
    d1.prepare(`SELECT COUNT(*) AS total FROM collection_logs WHERE ${where}`)
      .bind(...bindings).first<{ total: number }>(),
  ]);
  return collectionApiJson({
    page,
    pageSize,
    total: Number(count?.total ?? 0),
    records: records.results,
  });
}
