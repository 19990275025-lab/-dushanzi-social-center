import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  type ImportPostRow,
  isSupportedPlatform,
  validateImportRows,
} from "@/lib/imports";

type ImportLog = {
  id: number;
  platform: string;
  import_type: string;
  status: string;
};

async function markFailed(id: number, errorCount: number) {
  await getD1()
    .prepare(
      "UPDATE data_import_logs SET status = 'failed', error_count = ? WHERE id = ?",
    )
    .bind(Math.max(1, errorCount), id)
    .run();
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as {
    logId?: number;
    platform?: string;
    importType?: string;
    rows?: ImportPostRow[];
  };
  const logId = Number(payload.logId);
  const platform = String(payload.platform ?? "");
  const importType = String(payload.importType ?? "");

  if (!Number.isInteger(logId) || logId <= 0 || !isSupportedPlatform(platform)) {
    return Response.json({ error: "确认参数无效" }, { status: 400 });
  }

  const d1 = getD1();
  const log = await d1
    .prepare("SELECT id, platform, import_type, status FROM data_import_logs WHERE id = ?")
    .bind(logId)
    .first<ImportLog>();

  if (!log || log.platform !== platform || log.import_type !== importType) {
    return Response.json({ error: "导入记录与文件信息不一致" }, { status: 409 });
  }
  if (["completed", "deleted"].includes(log.status)) {
    return Response.json({ error: "该导入记录已完成或已删除" }, { status: 409 });
  }

  if (importType === "image") {
    await d1
      .prepare(
        "UPDATE data_import_logs SET status = 'completed', success_count = 1, error_count = 0 WHERE id = ?",
      )
      .bind(logId)
      .run();
    return Response.json({ successCount: 1, message: "图片记录已人工确认，OCR 接口暂未启用" });
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const validationErrors = validateImportRows(rows, platform);
  if (validationErrors.length) {
    await markFailed(logId, validationErrors.length);
    return Response.json(
      { error: "数据校验失败，未写入任何作品", errors: validationErrors },
      { status: 422 },
    );
  }

  const account = await d1
    .prepare(
      "SELECT id FROM social_accounts WHERE platform = ? AND status = 'active' ORDER BY id LIMIT 1",
    )
    .bind(platform)
    .first<{ id: number }>();
  if (!account) {
    await markFailed(logId, 1);
    return Response.json({ error: "该平台尚未配置启用账号，未写入任何作品" }, { status: 409 });
  }

  const titles = rows.map((row) => row.title.trim());
  const placeholders = titles.map(() => "?").join(",");
  const existing = await d1
    .prepare(
      `SELECT title FROM social_posts WHERE account_id = ? AND title IN (${placeholders})`,
    )
    .bind(account.id, ...titles)
    .all<{ title: string }>();
  if (existing.results.length) {
    const errors = existing.results.map((item) => ({
      rowNumber: rows.find((row) => row.title.trim() === item.title)?.rowNumber ?? 0,
      message: `作品“${item.title}”已存在`,
    }));
    await markFailed(logId, errors.length);
    return Response.json(
      { error: "发现重复作品，未写入任何数据", errors },
      { status: 409 },
    );
  }

  const inserts = rows.map((row) =>
    d1
      .prepare(`
        INSERT INTO social_posts
          (account_id, platform, title, content_type, publish_time,
           views, likes, comments, favorites, shares, fans_growth,
           hashtags, import_log_id)
        VALUES (?, ?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, '[]', ?)
      `)
      .bind(
        account.id,
        platform,
        row.title.trim(),
        new Date(row.publishTime).toISOString(),
        row.views,
        row.likes,
        row.comments,
        row.favorites,
        row.shares,
        row.fansGrowth,
        logId,
      ),
  );

  try {
    await d1.batch([
      ...inserts,
      d1
        .prepare(
          "UPDATE data_import_logs SET status = 'completed', success_count = ?, error_count = 0 WHERE id = ?",
        )
        .bind(rows.length, logId),
    ]);
  } catch {
    await markFailed(logId, rows.length);
    return Response.json(
      { error: "数据库写入失败，事务已回滚，未保留部分数据" },
      { status: 500 },
    );
  }

  return Response.json({ successCount: rows.length, message: "作品数据导入成功" });
}
