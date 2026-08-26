import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  normalizeDouyinCollectionV3,
  summarizeDouyinCollectionV3,
  validateDouyinCollectionV3,
} from "@/lib/douyin-collection-v3";

async function failLog(logId: number, message: string) {
  await getD1().prepare(`
    UPDATE collection_logs
    SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(message.slice(0, 4000), logId).run();
}

export async function POST(request: Request) {
  const body = (await request.json()) as { payload?: unknown; confirmed?: boolean };
  if (body.confirmed !== true) {
    return Response.json({ error: "必须人工确认后才能写入数据库" }, { status: 409 });
  }

  const payload = normalizeDouyinCollectionV3(body.payload);
  if (!payload) return Response.json({ error: "确认参数无效" }, { status: 400 });
  const errors = validateDouyinCollectionV3(payload);
  if (errors.length) {
    return Response.json({ error: "确认前复核失败，未写入任何业务数据", errors }, { status: 422 });
  }

  await ensureDatabase();
  const d1 = getD1();
  await d1.prepare(`
    INSERT INTO social_accounts
      (platform, account_name, account_id, account_url, followers_count, status)
    VALUES ('douyin', ?, 'dushanzi_daxigu_douyin', NULL, ?, 'active')
    ON CONFLICT(platform, account_id) DO UPDATE SET
      account_name = excluded.account_name,
      followers_count = excluded.followers_count,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `).bind(payload.accountName, payload.fans.currentTotal).run();

  const account = await d1.prepare(`
    SELECT id FROM social_accounts
    WHERE platform = 'douyin' AND account_id = 'dushanzi_daxigu_douyin'
    LIMIT 1
  `).first<{ id: number }>();
  if (!account) return Response.json({ error: "抖音账号初始化失败，未写入业务数据" }, { status: 500 });

  const summary = summarizeDouyinCollectionV3(payload);
  const sourcePrefix = `douyin-v3:${payload.collectionRange.start.slice(0, 10)}:${payload.collectionRange.end.slice(0, 10)}`;
  const existingPosts = await d1.prepare(`
    SELECT title FROM social_posts WHERE account_id = ? AND title IN (${payload.posts.map(() => "?").join(",")})
  `).bind(account.id, ...payload.posts.map((post) => post.title)).all<{ title: string }>();
  const existingTitles = new Set(existingPosts.results.map((post) => post.title));

  const logResult = await d1.prepare(`
    INSERT INTO collection_logs
      (platform, source_type, source_name, source_url, entity_type, status,
       total_count, success_count, error_count, comment_count, error_message, collected_at)
    VALUES ('douyin', 'api', '抖音创作者中心 V3.0', ?, 'douyin_v3', 'pending', ?, 0, ?, ?, ?, ?)
  `).bind(
    payload.pageUrl ?? null,
    summary.fans + summary.fanGrowthRecords + summary.posts + summary.audienceRecords + summary.comments,
    summary.failures,
    summary.comments,
    summary.failures ? JSON.stringify(payload.failures).slice(0, 4000) : null,
    new Date(payload.collectedAt).toISOString(),
  ).run();
  const logId = Number(logResult.meta.last_row_id);
  const collectedAt = new Date(payload.collectedAt).toISOString();

  const statements = [
    d1.prepare(`
      INSERT INTO social_fans
        (account_id, platform, fans_count, gender_distribution, age_distribution, region_distribution,
         interest_distribution, active_time_distribution, source_type, source_record_id, raw_payload,
         collection_log_id, collected_at)
      VALUES (?, 'douyin', ?, ?, ?, ?, ?, '[]', 'api', ?, ?, ?, ?)
      ON CONFLICT(platform, source_record_id) WHERE source_record_id IS NOT NULL DO UPDATE SET
        fans_count = excluded.fans_count,
        gender_distribution = excluded.gender_distribution,
        age_distribution = excluded.age_distribution,
        region_distribution = excluded.region_distribution,
        interest_distribution = excluded.interest_distribution,
        raw_payload = excluded.raw_payload,
        collection_log_id = excluded.collection_log_id,
        collected_at = excluded.collected_at
    `).bind(
      account.id,
      payload.fans.currentTotal,
      JSON.stringify(payload.fans.gender),
      JSON.stringify(payload.fans.age),
      JSON.stringify(payload.fans.region),
      JSON.stringify(payload.fans.interests),
      `${sourcePrefix}:fans`,
      JSON.stringify(payload.fans),
      logId,
      collectedAt,
    ),
    ...payload.fans.growth.map((growth) => d1.prepare(`
      INSERT INTO fan_growth_records
        (account_id, platform, record_date, snapshot_date, period_type, period_start, period_end,
         fans_count, net_growth, new_fans, lost_fans, new_followers, lost_followers,
         returning_followers, collection_time, source_type, source_record_id, raw_payload, collection_log_id)
      VALUES (?, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?, ?, ?)
      ON CONFLICT(platform, source_record_id) WHERE source_record_id IS NOT NULL DO UPDATE SET
        fans_count = excluded.fans_count,
        net_growth = excluded.net_growth,
        new_fans = excluded.new_fans,
        lost_fans = excluded.lost_fans,
        new_followers = excluded.new_followers,
        lost_followers = excluded.lost_followers,
        returning_followers = excluded.returning_followers,
        collection_time = excluded.collection_time,
        raw_payload = excluded.raw_payload,
        collection_log_id = excluded.collection_log_id,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      account.id,
      growth.recordDate.slice(0, 10),
      payload.collectedAt.slice(0, 10),
      growth.granularity === "period_summary" ? "custom" : "daily",
      growth.granularity === "period_summary" ? payload.collectionRange.start.slice(0, 10) : growth.recordDate.slice(0, 10),
      growth.recordDate.slice(0, 10),
      growth.fansCount,
      growth.netGrowth,
      growth.newFans,
      growth.lostFans,
      growth.newFans,
      growth.lostFans,
      growth.returningFans ?? null,
      collectedAt,
      `${sourcePrefix}:growth:${growth.recordDate.slice(0, 10)}`,
      JSON.stringify(growth),
      logId,
    )),
    ...payload.posts.map((post) => d1.prepare(`
      INSERT INTO social_posts
        (account_id, platform, title, content_type, publish_time, video_url, views, likes, comments,
         favorites, shares, fans_growth, hashtags, completion_rate, skip_rate, average_play_duration,
         traffic_sources, collection_log_id)
      VALUES (?, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, title) WHERE platform <> 'kuaishou' OR platform_post_id IS NULL DO UPDATE SET
        content_type = excluded.content_type,
        publish_time = excluded.publish_time,
        video_url = excluded.video_url,
        views = excluded.views,
        likes = excluded.likes,
        comments = excluded.comments,
        favorites = excluded.favorites,
        shares = excluded.shares,
        completion_rate = excluded.completion_rate,
        skip_rate = excluded.skip_rate,
        average_play_duration = excluded.average_play_duration,
        traffic_sources = excluded.traffic_sources,
        collection_log_id = excluded.collection_log_id,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      account.id,
      post.title,
      post.contentType,
      new Date(post.publishTime).toISOString(),
      post.videoUrl || null,
      post.views,
      post.likes,
      post.commentsCount,
      post.favorites,
      post.shares,
      post.completionRate,
      post.skipRate,
      post.averagePlayDuration,
      JSON.stringify(post.trafficSources),
      logId,
    )),
    ...payload.posts.filter((post) => post.audience.gender.length || post.audience.age.length || post.audience.region.length).map((post, index) => d1.prepare(`
      INSERT INTO content_audience_analysis
        (post_id, platform, gender_distribution, age_distribution, region_distribution,
         source_type, source_record_id, raw_payload, collection_log_id, collected_at)
      SELECT id, 'douyin', ?, ?, ?, 'api', ?, ?, ?, ?
      FROM social_posts WHERE account_id = ? AND title = ? LIMIT 1
      ON CONFLICT(post_id) DO UPDATE SET
        gender_distribution = excluded.gender_distribution,
        age_distribution = excluded.age_distribution,
        region_distribution = excluded.region_distribution,
        source_record_id = excluded.source_record_id,
        raw_payload = excluded.raw_payload,
        collection_log_id = excluded.collection_log_id,
        collected_at = excluded.collected_at,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      JSON.stringify(post.audience.gender),
      JSON.stringify(post.audience.age),
      JSON.stringify(post.audience.region),
      `${sourcePrefix}:audience:${index + 1}`,
      JSON.stringify({ ...post.audience, skipRate: post.skipRate, displayedCommentsCount: post.displayedCommentsCount }),
      logId,
      collectedAt,
      account.id,
      post.title,
    )),
    ...payload.posts.flatMap((post) => post.comments.map((comment) => d1.prepare(`
      INSERT INTO social_comments
        (post_id, platform, username, comment_text, comment_time, likes, sentiment, collection_log_id)
      SELECT id, 'douyin', ?, ?, ?, ?, 'unknown', ?
      FROM social_posts p
      WHERE p.account_id = ? AND p.title = ?
        AND NOT EXISTS (
          SELECT 1 FROM social_comments c
          WHERE c.post_id = p.id AND c.username = ? AND c.comment_text = ? AND c.comment_time = ?
        )
      LIMIT 1
    `).bind(
      comment.username,
      comment.commentText,
      new Date(comment.commentTime).toISOString(),
      comment.likes,
      logId,
      account.id,
      post.title,
      comment.username,
      comment.commentText,
      new Date(comment.commentTime).toISOString(),
    ))),
    d1.prepare(`
      UPDATE collection_logs
      SET status = 'completed', success_count = ?, error_count = ?, comment_count = ?,
          error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      summary.fans + summary.fanGrowthRecords + summary.posts + summary.audienceRecords + summary.comments,
      summary.failures,
      summary.comments,
      summary.failures ? JSON.stringify(payload.failures).slice(0, 4000) : null,
      logId,
    ),
  ];

  try {
    await d1.batch(statements);
  } catch (error) {
    await failLog(logId, error instanceof Error ? error.message : "数据库事务失败");
    return Response.json({ error: "数据库写入失败，事务已回滚，未保留部分数据" }, { status: 500 });
  }

  const insertedPosts = payload.posts.filter((post) => !existingTitles.has(post.title)).length;
  return Response.json({
    logId,
    ...summary,
    insertedPosts,
    updatedPosts: summary.posts - insertedPosts,
    message: `V3.0 已入库：粉丝快照 1 条、增长 ${summary.fanGrowthRecords} 条、作品 ${summary.posts} 条、观众分析 ${summary.audienceRecords} 条、评论 ${summary.comments} 条`,
  });
}
