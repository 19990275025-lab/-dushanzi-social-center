import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  BASELINE_BACKUP_KEY?: string;
};

type SchemaRow = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};

function runtime() {
  return env as unknown as RuntimeEnv;
}

function authorized(request: Request) {
  const expected = runtime().BASELINE_BACKUP_KEY?.trim();
  const supplied = request.headers.get("x-baseline-backup-key")?.trim();
  return Boolean(expected && supplied && expected === supplied);
}

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { "cache-control": "no-store", ...init?.headers },
  });
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`数据库标识符不安全：${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "not_found" }, { status: 404 });
  try {
    const { DB, UPLOADS } = runtime();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "init");
    if (action === "init") {
      const schema = await DB.prepare(`
        SELECT type, name, tbl_name, sql
        FROM sqlite_schema
        WHERE type IN ('table','index','trigger','view')
          AND name NOT LIKE 'sqlite_%'
          AND substr(name, 1, 4) != '_cf_'
          AND name != 'd1_migrations'
        ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name
      `).all<SchemaRow>();
      const createdAt = new Date().toISOString();
      const backupId = createdAt.replaceAll(":", "-");
      const prefix = `database-backups/kuaishou-adapter-v1/${backupId}`;
      const tableNames = schema.results.filter((row) => row.type === "table").map((row) => row.name);
      const manifest = {
        format: "dushanzi-sites-d1-logical-backup-v1",
        project: "dushanzi-social-center",
        binding: "DB",
        status: "creating",
        backupId,
        createdAt,
        schema: schema.results,
        tableNames,
        tables: {},
      };
      const key = `${prefix}/manifest.json`;
      await UPLOADS.put(key, JSON.stringify(manifest), { httpMetadata: { contentType: "application/json" } });
      return json({ ok: true, action, backupId, key, createdAt, tableCount: tableNames.length, tableNames });
    }

    const backupId = String(body.backupId ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}T[\d.-]+Z$/.test(backupId)) return json({ error: "invalid_backup_id" }, { status: 400 });
    const prefix = `database-backups/kuaishou-adapter-v1/${backupId}`;
    const key = `${prefix}/manifest.json`;
    const manifestObject = await UPLOADS.get(key);
    if (!manifestObject) return json({ error: "backup_not_found" }, { status: 404 });
    const manifest = JSON.parse(await manifestObject.text()) as {
      format: string;
      project: string;
      binding: string;
      status: string;
      backupId: string;
      createdAt: string;
      schema: SchemaRow[];
      tableNames: string[];
      tables: Record<string, {
        columns: string[];
        rowCount: number;
        complete: boolean;
        chunks: Array<{ offset: number; rowCount: number; key: string; checksum: string; sizeBytes: number }>;
      }>;
      completedAt?: string;
    };

    if (action === "table") {
      const tableName = String(body.tableName ?? "").trim();
      if (!manifest.tableNames.includes(tableName)) return json({ error: "invalid_table" }, { status: 400 });
      const offset = Number(body.offset ?? 0);
      if (!Number.isInteger(offset) || offset < 0) return json({ error: "invalid_offset" }, { status: 400 });
      const pageSize = 100;
      const result = await DB.prepare(`SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY rowid LIMIT ? OFFSET ?`)
        .bind(pageSize, offset).all<Record<string, unknown>>();
      const rows = result.results;
      const columns = rows.length ? Object.keys(rows[0]) : (
        await DB.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all<{ name: string }>()
      ).results.map((column) => column.name);
      const tablePayload = JSON.stringify({ tableName, offset, rowCount: rows.length, rows });
      const tableChecksum = await sha256(tablePayload);
      const tableSizeBytes = new TextEncoder().encode(tablePayload).byteLength;
      const tableKey = `${prefix}/tables/${tableName}/${String(offset).padStart(9, "0")}.json`;
      await UPLOADS.put(tableKey, tablePayload, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { checksum: tableChecksum, createdAt: manifest.createdAt, tableName, offset: String(offset), rowCount: String(rows.length) },
      });
      const previous = manifest.tables[tableName] ?? { columns, rowCount: 0, complete: false, chunks: [] };
      const chunks = previous.chunks.filter((chunk) => chunk.offset !== offset);
      chunks.push({ offset, rowCount: rows.length, key: tableKey, checksum: tableChecksum, sizeBytes: tableSizeBytes });
      chunks.sort((left, right) => left.offset - right.offset);
      manifest.tables[tableName] = {
        columns: previous.columns.length ? previous.columns : columns,
        rowCount: Math.max(previous.rowCount, offset + rows.length),
        complete: rows.length < pageSize,
        chunks,
      };
      await UPLOADS.put(key, JSON.stringify(manifest), { httpMetadata: { contentType: "application/json" } });
      return json({
        ok: true, action, backupId, tableName, offset, rowCount: rows.length,
        totalRows: manifest.tables[tableName].rowCount,
        nextOffset: rows.length < pageSize ? null : offset + pageSize,
        complete: rows.length < pageSize,
        checksum: tableChecksum, sizeBytes: tableSizeBytes,
      });
    }

    if (action !== "finalize") return json({ error: "invalid_action" }, { status: 400 });
    const missingTables = manifest.tableNames.filter((name) => !manifest.tables[name]?.complete);
    if (missingTables.length) return json({ error: "incomplete_backup", missingTables }, { status: 409 });
    manifest.status = "completed";
    manifest.completedAt = new Date().toISOString();
    const payload = JSON.stringify(manifest);
    const checksum = await sha256(payload);
    await UPLOADS.put(key, payload, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { checksum, createdAt: manifest.createdAt, tableCount: String(manifest.tableNames.length) },
    });
    return json({
      ok: true,
      action,
      backupId,
      key,
      createdAt: manifest.createdAt,
      completedAt: manifest.completedAt,
      checksum,
      sizeBytes: Object.values(manifest.tables).reduce((sum, table) => sum + table.chunks.reduce((chunkSum, chunk) => chunkSum + chunk.sizeBytes, 0), 0) + new TextEncoder().encode(payload).byteLength,
      schemaObjectCount: manifest.schema.length,
      tableCount: manifest.tableNames.length,
      rowCounts: Object.fromEntries(manifest.tableNames.map((name) => [name, manifest.tables[name].rowCount])),
    });
  } catch (error) {
    console.error("baseline D1 backup failed", error);
    return json({ error: error instanceof Error ? error.message : "baseline backup failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "not_found" }, { status: 404 });
  const key = new URL(request.url).searchParams.get("key")?.trim();
  if (!key?.startsWith("database-backups/kuaishou-adapter-v1/") || !key.endsWith("/manifest.json")) {
    return json({ error: "invalid_key" }, { status: 400 });
  }
  const object = await runtime().UPLOADS.get(key);
  if (!object) return json({ error: "backup_not_found" }, { status: 404 });
  const payload = await object.text();
  const checksum = await sha256(payload);
  const parsed = JSON.parse(payload) as {
    format: string;
    createdAt: string;
    schema: SchemaRow[];
    tables: Record<string, {
      columns: string[];
      rowCount: number;
      complete: boolean;
      chunks: Array<{ offset: number; rowCount: number; key: string; checksum: string; sizeBytes: number }>;
    }>;
  };
  if (new URL(request.url).searchParams.get("schema") === "1") {
    return json({
      ok: checksum === object.customMetadata?.checksum,
      key,
      checksum,
      schema: parsed.schema,
      tableMetadata: parsed.tables,
    });
  }
  const requestedTable = new URL(request.url).searchParams.get("table")?.trim();
  if (!requestedTable) {
    const complete = Object.values(parsed.tables).every((table) => table.complete);
    return json({
      ok: checksum === object.customMetadata?.checksum && complete,
      key,
      format: parsed.format,
      createdAt: parsed.createdAt,
      checksum,
      expectedChecksum: object.customMetadata?.checksum ?? null,
      schemaObjectCount: parsed.schema.length,
      tableCount: Object.keys(parsed.tables).length,
      complete,
    });
  }
  const requested = parsed.tables[requestedTable];
  if (!requested) return json({ error: "invalid_table" }, { status: 400 });
  const chunkOffset = Number(new URL(request.url).searchParams.get("chunk_offset") ?? 0);
  if (!Number.isInteger(chunkOffset) || chunkOffset < 0) return json({ error: "invalid_chunk_offset" }, { status: 400 });
  const selectedChunks = requested.chunks.slice(chunkOffset, chunkOffset + 40);
  if (new URL(request.url).searchParams.get("verify_live") === "1") {
    const failures: string[] = [];
    let verifiedRows = 0;
    if (!requested.columns.includes("id")) return json({ error: "id_required_for_row_audit" }, { status: 400 });
    for (const chunk of selectedChunks) {
      const chunkObject = await runtime().UPLOADS.get(chunk.key);
      if (!chunkObject) return json({ error: "backup_chunk_missing" }, { status: 409 });
      const chunkText = await chunkObject.text();
      if (await sha256(chunkText) !== chunk.checksum) return json({ error: "backup_checksum_mismatch" }, { status: 409 });
      const rows = (JSON.parse(chunkText) as { rows: Array<Record<string, unknown>> }).rows;
      if (!rows.length) continue;
      const current = await runtime().DB.prepare(`SELECT ${requested.columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(requestedTable)} WHERE id IN (${rows.map(() => "?").join(",")})`)
        .bind(...rows.map(row => row.id)).all<Record<string, unknown>>();
      const byId = new Map(current.results.map(row => [row.id, row]));
      for (const row of rows) {
        const found = byId.get(row.id);
        if (!found) failures.push(`${requestedTable}:${row.id}:missing`);
        else if (requested.columns.some(column => JSON.stringify(row[column]) !== JSON.stringify(found[column]))) failures.push(`${requestedTable}:${row.id}:changed`);
        verifiedRows += 1;
      }
    }
    const currentCount = await runtime().DB.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(requestedTable)}`).first<{ n: number }>();
    return json({ ok: failures.length === 0, table: requestedTable, verifiedRows, backupRows: requested.rowCount,
      currentRows: currentCount?.n, failures, nextChunkOffset: chunkOffset + selectedChunks.length < requested.chunks.length ? chunkOffset + selectedChunks.length : null });
  }
  const rowCounts: Record<string, number> = {};
  const failures: string[] = [];
  let totalSizeBytes = new TextEncoder().encode(payload).byteLength;
  let verifiedRows = 0;
  for (const chunk of selectedChunks) {
    const tableObject = await runtime().UPLOADS.get(chunk.key);
    if (!tableObject) {
      failures.push(`${requestedTable}:${chunk.offset}:missing`);
      continue;
    }
    const tablePayload = await tableObject.text();
    const tableChecksum = await sha256(tablePayload);
    const tableData = JSON.parse(tablePayload) as { tableName: string; offset: number; rowCount: number; rows: unknown[] };
    verifiedRows += tableData.rows.length;
    totalSizeBytes += new TextEncoder().encode(tablePayload).byteLength;
    if (tableChecksum !== chunk.checksum || tableChecksum !== tableObject.customMetadata?.checksum) failures.push(`${requestedTable}:${chunk.offset}:checksum`);
    if (tableData.tableName !== requestedTable || tableData.offset !== chunk.offset || tableData.rowCount !== chunk.rowCount || tableData.rows.length !== chunk.rowCount) failures.push(`${requestedTable}:${chunk.offset}:rows`);
  }
  rowCounts[requestedTable] = verifiedRows;
  const expectedRows = selectedChunks.reduce((sum, chunk) => sum + chunk.rowCount, 0);
  const rowCountsValid = failures.length === 0 && verifiedRows === expectedRows;
  const nextChunkOffset = chunkOffset + selectedChunks.length < requested.chunks.length
    ? chunkOffset + selectedChunks.length
    : null;
  return json({
    ok: checksum === object.customMetadata?.checksum && rowCountsValid,
    key,
    format: parsed.format,
    createdAt: parsed.createdAt,
    checksum,
    expectedChecksum: object.customMetadata?.checksum ?? null,
    sizeBytes: totalSizeBytes,
    schemaObjectCount: parsed.schema.length,
    tableCount: 1,
    rowCounts,
    rowCountsValid,
    chunkOffset,
    checkedChunks: selectedChunks.length,
    nextChunkOffset,
    tableComplete: requested.complete && nextChunkOffset === null,
    failures,
  });
}
