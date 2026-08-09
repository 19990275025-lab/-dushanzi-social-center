import { ensureDatabase } from "@/db/bootstrap";
import { getD1, getUploads } from "@/db";
import { isSupportedPlatform } from "@/lib/imports";

const excelExtensions = new Set(["xlsx", "xls"]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function objectKey(id: number, fileName: string) {
  return `imports/${id}/${encodeURIComponent(fileName)}`;
}

export async function GET() {
  await ensureDatabase();
  const result = await getD1()
    .prepare(`
      SELECT id, platform, file_name, import_type, status,
        success_count, error_count, created_at
      FROM data_import_logs
      WHERE platform IN ('douyin', 'kuaishou', 'weibo')
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `)
    .all();

  return Response.json({ logs: result.results });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const form = await request.formData();
  const platform = String(form.get("platform") ?? "");
  const importType = String(form.get("importType") ?? "");
  const file = form.get("file");

  if (!isSupportedPlatform(platform)) {
    return Response.json({ error: "请选择有效平台" }, { status: 400 });
  }
  if (!(file instanceof File) || !file.name) {
    return Response.json({ error: "请选择上传文件" }, { status: 400 });
  }
  if (!['excel', 'image'].includes(importType)) {
    return Response.json({ error: "导入方式无效" }, { status: 400 });
  }

  const extension = extensionOf(file.name);
  if (importType === "excel" && (!excelExtensions.has(extension) || file.size > 5 * 1024 * 1024)) {
    return Response.json({ error: "仅支持 5MB 以内的 XLSX/XLS 文件" }, { status: 400 });
  }
  if (
    importType === "image" &&
    (!imageExtensions.has(extension) || !imageMimeTypes.has(file.type) || file.size > 8 * 1024 * 1024)
  ) {
    return Response.json({ error: "仅支持 8MB 以内的 PNG、JPG 或 WEBP 图片" }, { status: 400 });
  }

  const d1 = getD1();
  const log = await d1
    .prepare(`
      INSERT INTO data_import_logs
        (platform, file_name, import_type, status, success_count, error_count)
      VALUES (?, ?, ?, 'pending', 0, 0)
      RETURNING id, platform, file_name, import_type, status,
        success_count, error_count, created_at
    `)
    .bind(platform, file.name.slice(0, 255), importType)
    .first<{ id: number; file_name: string } & Record<string, unknown>>();

  if (!log) return Response.json({ error: "无法创建导入记录" }, { status: 500 });

  try {
    await getUploads().put(objectKey(log.id, log.file_name), file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { platform, importType },
    });
  } catch {
    await d1
      .prepare("UPDATE data_import_logs SET status = 'failed', error_count = 1 WHERE id = ?")
      .bind(log.id)
      .run();
    return Response.json({ error: "文件保存失败，数据库未写入作品数据", logId: log.id }, { status: 500 });
  }

  return Response.json({ log }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as Record<string, unknown>;
  const id = Number(payload.id);
  const status = String(payload.status ?? "");
  const errorCount = Number(payload.errorCount ?? 0);

  if (!Number.isInteger(id) || id <= 0 || !["pending", "failed"].includes(status)) {
    return Response.json({ error: "导入记录更新参数无效" }, { status: 400 });
  }

  await getD1()
    .prepare("UPDATE data_import_logs SET status = ?, error_count = ? WHERE id = ?")
    .bind(status, Math.max(0, Math.trunc(errorCount)), id)
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  await ensureDatabase();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "导入记录无效" }, { status: 400 });
  }

  const d1 = getD1();
  const log = await d1
    .prepare("SELECT id, file_name FROM data_import_logs WHERE id = ?")
    .bind(id)
    .first<{ id: number; file_name: string }>();
  if (!log) return Response.json({ error: "导入记录不存在" }, { status: 404 });

  await d1.batch([
    d1.prepare("DELETE FROM social_posts WHERE import_log_id = ?").bind(id),
    d1
      .prepare(
        "UPDATE data_import_logs SET status = 'deleted', success_count = 0 WHERE id = ?",
      )
      .bind(id),
  ]);

  try {
    await getUploads().delete(objectKey(id, log.file_name));
  } catch {
    // 数据回滚优先；对象存储清理由后续运维重试，不影响数据库一致性。
  }

  return Response.json({ ok: true });
}
