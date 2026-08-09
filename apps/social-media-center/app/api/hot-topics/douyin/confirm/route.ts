import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  buildDouyinHotTopicPreview,
  DOUYIN_HOT_PREVIEW_TOKEN,
  DOUYIN_HOT_SOURCE_URL,
} from "@/lib/douyin-hot-topic-preview";

export async function POST(request: Request) {
  const payload = await request.json() as { confirmed?: boolean; previewToken?: string };
  if (payload.confirmed !== true || payload.previewToken !== DOUYIN_HOT_PREVIEW_TOKEN) {
    return Response.json({ error: "必须基于当前预览明确确认后才能入库" }, { status: 400 });
  }

  await ensureDatabase();
  const d1 = getD1();
  const posts = await d1.prepare(`
    SELECT title, hashtags FROM social_posts WHERE platform = 'douyin'
    ORDER BY publish_time DESC, id DESC LIMIT 200
  `).all<{ title: string; hashtags: string }>();
  const preview = buildDouyinHotTopicPreview(posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`).join(" "));
  const log = await d1.prepare(`
    INSERT INTO collection_logs
      (platform, source_type, source_name, source_url, entity_type, status,
       total_count, success_count, error_count, collected_at, created_at, updated_at)
    VALUES ('douyin', 'chrome', '抖音官方今日热榜', ?, 'hot_topic', 'running', ?, 0, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `).bind(DOUYIN_HOT_SOURCE_URL, preview.totalCount, preview.collectedAt).first<{ id: number }>();
  if (!log) return Response.json({ error: "采集日志创建失败" }, { status: 500 });

  try {
    await d1.batch(preview.topics.map((topic) => d1.prepare(`
      INSERT INTO hot_topics
        (platform, topic_name, keyword, heat_value, ranking, trend, category,
         related_degree, ai_suggestion, status, source_url, source_record_id,
         collection_log_id, collect_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(platform, topic_name) DO UPDATE SET
        keyword = excluded.keyword, heat_value = excluded.heat_value,
        ranking = excluded.ranking, trend = excluded.trend, category = excluded.category,
        related_degree = excluded.related_degree, ai_suggestion = excluded.ai_suggestion,
        status = excluded.status, source_url = excluded.source_url,
        source_record_id = excluded.source_record_id,
        collection_log_id = excluded.collection_log_id, collect_time = excluded.collect_time
    `).bind(topic.platform, topic.topic_name, topic.keyword, topic.heat_value,
      topic.ranking, topic.trend, topic.category, topic.related_degree,
      topic.ai_suggestion, topic.status, topic.source_url, topic.source_record_id,
      log.id, topic.collect_time)));
    await d1.prepare(`
      UPDATE collection_logs SET status = 'success', success_count = ?,
        collected_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(preview.successCount, preview.collectedAt, log.id).run();
    return Response.json({
      message: "抖音今日热点已确认入库",
      collectionLogId: log.id,
      totalCount: preview.totalCount,
      successCount: preview.successCount,
      errorCount: 0,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "热点批量写入失败";
    await d1.prepare(`
      UPDATE collection_logs SET status = 'failed', error_count = ?, error_message = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(preview.totalCount, reason.slice(0, 1000), log.id).run();
    return Response.json({ error: reason }, { status: 500 });
  }
}
