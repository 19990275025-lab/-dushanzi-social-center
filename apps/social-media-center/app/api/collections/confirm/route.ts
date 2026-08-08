import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { normalizeCollectionPayload, validateCollectionPayload } from "@/lib/collections";

type CollectionLog = {
  id: number;
  platform: string;
  source_type: string;
  status: string;
};
type ExistingPost = { id: number; title: string; video_url: string | null };

async function markFailed(id: number, errorCount: number, message: string) {
  await getD1()
    .prepare(`
      UPDATE collection_logs
      SET status = 'failed', error_count = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(Math.max(1, errorCount), message.slice(0, 4000), id)
    .run();
}

export async function POST(request: Request) {
  await ensureDatabase();
  const body = (await request.json()) as { logId?: number; payload?: unknown };
  const logId = Number(body.logId);
  const payload = normalizeCollectionPayload(body.payload);

  if (!Number.isInteger(logId) || logId <= 0 || !payload) {
    return Response.json({ error: "确认参数无效" }, { status: 400 });
  }

  const d1 = getD1();
  const log = await d1
    .prepare("SELECT id, platform, source_type, status FROM collection_logs WHERE id = ?")
    .bind(logId)
    .first<CollectionLog>();
  if (!log || log.platform !== "douyin" || log.source_type !== "chrome") {
    return Response.json({ error: "采集日志与数据来源不一致" }, { status: 409 });
  }
  if (log.status !== "pending") {
    return Response.json({ error: "该采集批次不是待确认状态" }, { status: 409 });
  }

  const errors = validateCollectionPayload(payload);
  if (errors.length) {
    await markFailed(logId, errors.length, JSON.stringify(errors.slice(0, 100)));
    return Response.json(
      { error: "数据复核失败，未写入任何作品", errors },
      { status: 422 },
    );
  }

  const account = await d1
    .prepare(`
      SELECT id FROM social_accounts
      WHERE platform = 'douyin' AND status = 'active'
      ORDER BY id LIMIT 1
    `)
    .first<{ id: number }>();
  if (!account) {
    await markFailed(logId, 1, "抖音账号尚未配置或未启用");
    return Response.json({ error: "抖音账号尚未配置或未启用，未写入任何作品" }, { status: 409 });
  }

  const titles = payload.rows.map((row) => row.title.trim());
  const links = payload.rows.map((row) => row.videoUrl.trim());
  const titleMarks = titles.map(() => "?").join(",");
  const linkMarks = links.map(() => "?").join(",");
  const existing = await d1
    .prepare(`
      SELECT id, title, video_url FROM social_posts
      WHERE account_id = ?
        AND (title IN (${titleMarks}) OR video_url IN (${linkMarks}))
    `)
    .bind(account.id, ...titles, ...links)
    .all<ExistingPost>();
  const existingByIdentity = new Map<string, ExistingPost>();
  for (const item of existing.results) {
    existingByIdentity.set(`title:${item.title}`, item);
    if (item.video_url) existingByIdentity.set(`url:${item.video_url}`, item);
  }

  const updates = payload.rows.flatMap((row) => {
    const item = existingByIdentity.get(`url:${row.videoUrl}`) ?? existingByIdentity.get(`title:${row.title.trim()}`);
    if (!item) return [];
    return [d1.prepare(`
      UPDATE social_posts
      SET content_type = ?, publish_time = ?, video_url = ?, cover_url = ?,
        views = ?, likes = ?, comments = ?, favorites = ?, shares = ?,
        fans_growth = ?, hashtags = ?, duration = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      row.contentType, new Date(row.publishTime).toISOString(), row.videoUrl,
      row.coverUrl || null, row.views, row.likes, row.comments, row.favorites,
      row.shares, row.fansGrowth, JSON.stringify(row.hashtags), row.duration, item.id,
    )];
  });

  const newRows = payload.rows.filter((row) =>
    !existingByIdentity.has(`url:${row.videoUrl}`) && !existingByIdentity.has(`title:${row.title.trim()}`),
  );
  const inserts = newRows.map((row) =>
    d1
      .prepare(`
        INSERT INTO social_posts
          (account_id, platform, title, content_type, publish_time,
           video_url, cover_url, views, likes, comments, favorites, shares,
           fans_growth, hashtags, duration, collection_log_id)
        VALUES (?, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        account.id,
        row.title.trim(),
        row.contentType,
        new Date(row.publishTime).toISOString(),
        row.videoUrl,
        row.coverUrl || null,
        row.views,
        row.likes,
        row.comments,
        row.favorites,
        row.shares,
        row.fansGrowth,
        JSON.stringify(row.hashtags),
        row.duration,
        logId,
      ),
  );

  try {
    const acquisitionFailures = payload.failures ?? [];
    await d1.batch([
      ...updates,
      ...inserts,
      d1
        .prepare(`
          UPDATE collection_logs
          SET status = 'completed', success_count = ?, error_count = ?,
            error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          payload.rows.length,
          acquisitionFailures.length,
          acquisitionFailures.length ? JSON.stringify(acquisitionFailures).slice(0, 4000) : null,
          logId,
        ),
    ]);
  } catch {
    await markFailed(logId, payload.rows.length, "数据库写入失败");
    return Response.json(
      { error: "数据库写入失败，事务已回滚，未保留部分数据" },
      { status: 500 },
    );
  }

  return Response.json({
    successCount: payload.rows.length,
    insertedCount: newRows.length,
    updatedCount: updates.length,
    message: `${payload.rows.length} 条抖音作品已确认（新增 ${newRows.length} 条、更新 ${updates.length} 条）`,
  });
}
