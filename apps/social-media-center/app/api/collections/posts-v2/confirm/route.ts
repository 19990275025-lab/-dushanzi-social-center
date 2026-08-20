import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  summarizeWorkBuddyPostsV2,
  validateWorkBuddyPostsV2,
  type WorkBuddyPostsV2Payload,
} from "@/lib/workbuddy-posts-v2";

type ExistingPost = {
  id: number;
  platform_post_id: string | null;
  video_url: string | null;
  post_url: string | null;
  title: string;
};

function legacyTrafficSources(post: WorkBuddyPostsV2Payload["posts"][number]) {
  return post.trafficSources.map((source) => ({
    label: source.sourceName,
    value: source.percentage,
    trafficValue: source.trafficValue,
    nature: source.trafficNature,
  }));
}

function hashtags(post: WorkBuddyPostsV2Payload["posts"][number]) {
  const values = post.contentMetadata.hashtags;
  return Array.isArray(values) ? values.filter((item): item is string => typeof item === "string") : [];
}

async function failLog(logId: number, message: string) {
  await getD1().prepare(`
    UPDATE collection_logs
    SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(message.slice(0, 4000), logId).run();
}

export async function POST(request: Request) {
  const body = (await request.json()) as { payload?: WorkBuddyPostsV2Payload; confirmed?: boolean };
  if (body.confirmed !== true || !body.payload) {
    return Response.json({ error: "必须人工确认后才能写入作品 V2.0 数据" }, { status: 409 });
  }
  const payload = body.payload;
  const errors = validateWorkBuddyPostsV2(payload);
  if (errors.length) return Response.json({ error: "确认前复核失败，未写入任何业务数据", errors }, { status: 422 });

  await ensureDatabase();
  const d1 = getD1();
  const existingBatch = await d1.prepare("SELECT id, status FROM collection_logs WHERE batch_key = ? LIMIT 1")
    .bind(payload.batchKey).first<{ id: number; status: string }>();
  if (existingBatch && !["failed", "deleted"].includes(existingBatch.status)) {
    return Response.json({ error: `该采集批次已存在（日志 #${existingBatch.id}，状态 ${existingBatch.status}），禁止重复写入` }, { status: 409 });
  }
  if (existingBatch) {
    await d1.prepare("UPDATE collection_logs SET batch_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(existingBatch.id).run();
  }

  await d1.prepare(`
    INSERT INTO social_accounts
      (platform, account_name, account_id, account_url, followers_count, status)
    VALUES ('douyin', ?, 'dushanzi_daxigu_douyin', NULL, 0, 'active')
    ON CONFLICT(platform, account_id) DO UPDATE SET
      account_name = excluded.account_name,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `).bind(payload.accountName).run();
  const account = await d1.prepare(`
    SELECT id FROM social_accounts
    WHERE platform = 'douyin' AND account_id = 'dushanzi_daxigu_douyin'
    LIMIT 1
  `).first<{ id: number }>();
  if (!account) return Response.json({ error: "抖音账号初始化失败" }, { status: 500 });

  const existingResult = await d1.prepare(`
    SELECT id, platform_post_id, video_url, post_url, title
    FROM social_posts WHERE platform = 'douyin'
  `).all<ExistingPost>();
  const existingByPost = new Map<string, ExistingPost>();
  for (const post of payload.posts) {
    const existing = existingResult.results.find((row: ExistingPost) =>
      row.platform_post_id === post.platformPostId ||
      row.video_url === post.postUrl ||
      row.post_url === post.postUrl ||
      (row.title === post.title && row.id > 0),
    );
    if (existing) existingByPost.set(post.platformPostId, existing);
  }

  let duplicateComments = 0;
  for (const post of payload.posts) {
    const existingPost = existingByPost.get(post.platformPostId);
    if (!existingPost || !post.comments.length) continue;
    const current = await d1.prepare(`
      SELECT username, comment_text, comment_time, comment_time_raw
      FROM social_comments WHERE post_id = ?
    `).bind(existingPost.id).all<{ username: string; comment_text: string | null; comment_time: string | null; comment_time_raw: string | null }>();
    duplicateComments += post.comments.filter((comment) => current.results.some((row: { username: string; comment_text: string | null; comment_time: string | null; comment_time_raw: string | null }) =>
      row.username === comment.username &&
      (row.comment_text ?? "") === (comment.commentText ?? "") &&
      ((comment.commentTime && row.comment_time && Date.parse(row.comment_time) === Date.parse(comment.commentTime)) || row.comment_time_raw === comment.commentTimeRaw),
    )).length;
  }

  const summary = summarizeWorkBuddyPostsV2(payload, existingByPost.size);
  const logResult = await d1.prepare(`
    INSERT INTO collection_logs
      (platform, source_type, source_name, source_url, entity_type, status,
       total_count, success_count, error_count, comment_count, source_file,
       batch_key, unavailable_count, raw_payload, error_message, collected_at)
    VALUES ('douyin', 'api', 'WorkBuddy抖音作品Agent', ?, 'workbuddy_posts_v2', 'pending',
      ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    payload.posts[0]?.postUrl ?? null,
    payload.posts.length,
    summary.commentRows,
    payload.sourceFile,
    payload.batchKey,
    payload.unavailableValueCount,
    JSON.stringify({ schemaFieldCount: payload.schemaFieldCount, scalarValueCount: payload.scalarValueCount, rawSummary: payload.rawSummary }),
    payload.qualityWarnings.length ? JSON.stringify(payload.qualityWarnings) : null,
    payload.collectionTime,
  ).run();
  const logId = Number(logResult.meta.last_row_id);

  const statements: Array<ReturnType<typeof d1.prepare>> = [];
  for (const post of payload.posts) {
    const existing = existingByPost.get(post.platformPostId);
    const legacyValues = [
      account.id, "workbuddy", post.platformPostId, post.title, post.contentType, post.publishTime,
      post.postUrl, post.postUrl, post.snapshot.playCount ?? 0, post.snapshot.likeCount ?? 0,
      post.snapshot.commentOverviewCount ?? 0, post.snapshot.favoriteCount, post.snapshot.shareCount ?? 0,
      post.snapshot.followerGain, JSON.stringify(hashtags(post)), post.durationSeconds === null ? null : Math.round(post.durationSeconds),
      post.durationSeconds, post.postType, post.postStatus, post.isPinned ? 1 : 0, JSON.stringify(post.contentMetadata),
      post.snapshot.dataAvailabilityStatus, post.traffic.completionRate, post.traffic.swipeAwayRate,
      post.traffic.averagePlayDurationSeconds, JSON.stringify(legacyTrafficSources(post)), logId,
    ];
    if (existing) {
      statements.push(d1.prepare(`
        UPDATE social_posts SET
          account_id = ?, source = ?, platform_post_id = ?, title = ?, content_type = ?, publish_time = ?,
          video_url = ?, post_url = ?, views = ?, likes = ?, comments = ?,
          favorites = COALESCE(?, favorites), shares = ?, fans_growth = COALESCE(?, fans_growth),
          hashtags = ?, duration = COALESCE(?, duration), duration_seconds = ?, post_type = ?, post_status = ?,
          is_pinned = ?, content_metadata = ?, data_availability_status = ?, completion_rate = ?,
          skip_rate = ?, average_play_duration = ?, traffic_sources = ?, collection_log_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(...legacyValues, existing.id));
    } else {
      statements.push(d1.prepare(`
        INSERT INTO social_posts
          (account_id, source, platform_post_id, title, content_type, publish_time, video_url, post_url,
           views, likes, comments, favorites, shares, fans_growth, hashtags, duration, duration_seconds,
           post_type, post_status, is_pinned, content_metadata, data_availability_status, completion_rate,
           skip_rate, average_play_duration, traffic_sources, collection_log_id, platform)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), ?, COALESCE(?, 0), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'douyin')
      `).bind(...legacyValues));
    }

    statements.push(d1.prepare(`
      INSERT INTO social_post_snapshots
        (post_id, platform, snapshot_time, collection_time, play_count, like_count,
         comment_overview_count, actual_loaded_count, comment_rows_count, favorite_count,
         share_count, danmaku_count, follower_gain, follower_loss, follower_play_ratio,
         page_entry_rate, data_availability_status, traffic_availability_status,
         traffic_sources_availability_status, audience_availability_status,
         comment_keywords_availability_status, comments_availability_status, post_age_days,
         source_file, raw_payload, collection_log_id)
      SELECT id, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM social_posts WHERE platform = 'douyin' AND platform_post_id = ? LIMIT 1
      ON CONFLICT(post_id, snapshot_time) DO NOTHING
    `).bind(
      post.snapshot.snapshotTime, post.snapshot.collectionTime, post.snapshot.playCount, post.snapshot.likeCount,
      post.snapshot.commentOverviewCount, post.snapshot.actualLoadedCount, post.snapshot.commentRowsCount,
      post.snapshot.favoriteCount, post.snapshot.shareCount, post.snapshot.danmakuCount, post.snapshot.followerGain,
      post.snapshot.followerLoss, post.snapshot.followerPlayRatio, post.snapshot.pageEntryRate,
      post.snapshot.dataAvailabilityStatus, post.snapshot.trafficAvailabilityStatus,
      post.snapshot.trafficSourcesAvailabilityStatus, post.snapshot.audienceAvailabilityStatus,
      post.snapshot.commentKeywordsAvailabilityStatus, post.snapshot.commentsAvailabilityStatus,
      post.postAgeDays, payload.sourceFile, JSON.stringify(post.snapshot.rawPayload), logId, post.platformPostId,
    ));

    statements.push(d1.prepare(`
      INSERT INTO social_post_traffic
        (post_id, snapshot_id, snapshot_time, completion_rate, average_play_duration_seconds,
         two_sec_bounce_rate, five_sec_completion_rate, average_play_ratio, cover_click_rate,
         swipe_away_rate, page_entry_rate, comment_entry_rate, text_expand_rate,
         text_completion_rate, average_images_viewed, like_rate, comment_rate, share_rate,
         favorite_rate, not_interested_rate, data_availability_status, raw_payload, collection_log_id)
      SELECT p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
      WHERE p.platform = 'douyin' AND p.platform_post_id = ? LIMIT 1
      ON CONFLICT(snapshot_id) DO NOTHING
    `).bind(
      post.snapshot.snapshotTime, post.traffic.completionRate, post.traffic.averagePlayDurationSeconds,
      post.traffic.twoSecBounceRate, post.traffic.fiveSecCompletionRate, post.traffic.averagePlayRatio,
      post.traffic.coverClickRate, post.traffic.swipeAwayRate, post.traffic.pageEntryRate,
      post.traffic.commentEntryRate, post.traffic.textExpandRate, post.traffic.textCompletionRate,
      post.traffic.averageImagesViewed, post.traffic.likeRate, post.traffic.commentRate,
      post.traffic.shareRate, post.traffic.favoriteRate, post.traffic.notInterestedRate,
      post.traffic.dataAvailabilityStatus, JSON.stringify(post.traffic.rawPayload), logId,
      post.snapshot.snapshotTime, post.platformPostId,
    ));

    for (const source of post.trafficSources) {
      statements.push(d1.prepare(`
        INSERT INTO social_post_traffic_sources
          (post_id, snapshot_id, snapshot_time, source_type, source_name, traffic_value,
           percentage, change_percentage, traffic_nature, raw_value, collection_log_id)
        SELECT p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND p.platform_post_id = ? LIMIT 1
        ON CONFLICT(snapshot_id, source_name, traffic_nature) DO NOTHING
      `).bind(
        post.snapshot.snapshotTime, source.sourceType, source.sourceName, source.trafficValue,
        source.percentage, source.changePercentage, source.trafficNature, JSON.stringify(source.rawValue),
        logId, post.snapshot.snapshotTime, post.platformPostId,
      ));
    }

    for (const audience of post.audience.records) {
      const sourceRecordId = `${post.platformPostId}:${post.snapshot.snapshotTime}:audience:${audience.dimensionType}:${audience.dimensionName}`;
      statements.push(d1.prepare(`
        INSERT INTO content_audience_analysis
          (post_id, platform, gender_distribution, age_distribution, region_distribution,
           snapshot_id, snapshot_time, dimension_type, dimension_name, dimension_value,
           percentage, ranking, raw_value, data_availability_status, source_type,
           source_record_id, raw_payload, collection_log_id, collected_at)
        SELECT p.id, 'douyin', '[]', '[]', '[]', s.id, ?, ?, ?, ?, ?, ?, ?, ?,
          'api', ?, NULL, ?, ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND p.platform_post_id = ? LIMIT 1
        ON CONFLICT(snapshot_id, dimension_type, dimension_name) DO NOTHING
      `).bind(
        post.snapshot.snapshotTime, audience.dimensionType, audience.dimensionName,
        audience.dimensionValue, audience.percentage, audience.ranking, JSON.stringify(audience.rawValue),
        post.audience.dataAvailabilityStatus, sourceRecordId, logId, post.snapshot.collectionTime,
        post.snapshot.snapshotTime, post.platformPostId,
      ));
    }

    for (const keyword of post.commentKeywords.records) {
      statements.push(d1.prepare(`
        INSERT INTO social_post_comment_keywords
          (post_id, snapshot_id, snapshot_time, keyword, ranking, occurrence_count,
           sentiment, category, data_availability_status, raw_value, collection_log_id)
        SELECT p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND p.platform_post_id = ? LIMIT 1
        ON CONFLICT(snapshot_id, keyword, ranking) DO NOTHING
      `).bind(
        post.snapshot.snapshotTime, keyword.keyword, keyword.rank, keyword.count,
        keyword.sentiment, keyword.category, post.commentKeywords.dataAvailabilityStatus,
        JSON.stringify(keyword.rawValue), logId, post.snapshot.snapshotTime, post.platformPostId,
      ));
    }

    for (const comment of post.comments) {
      statements.push(d1.prepare(`
        UPDATE social_comments SET
          source = 'workbuddy', source_comment_id = COALESCE(source_comment_id, ?),
          comment_fingerprint = COALESCE(comment_fingerprint, ?), snapshot_id = COALESCE(snapshot_id, (
            SELECT s.id FROM social_post_snapshots s WHERE s.post_id = social_comments.post_id AND s.snapshot_time = ? LIMIT 1
          )), snapshot_time = COALESCE(snapshot_time, ?), comment_type = ?, comment_time_raw = ?,
          reply_count = ?, is_author = ?, author_replied = ?, raw_payload = ?, collection_log_id = ?
        WHERE id = (
          SELECT c.id FROM social_comments c JOIN social_posts p ON p.id = c.post_id
          WHERE p.platform = 'douyin' AND p.platform_post_id = ? AND c.comment_fingerprint IS NULL
            AND c.username = ? AND COALESCE(c.comment_text, '') = COALESCE(?, '')
            AND ((? IS NOT NULL AND c.comment_time IS NOT NULL AND datetime(c.comment_time) = datetime(?))
              OR COALESCE(c.comment_time_raw, '') = ?)
          ORDER BY c.id LIMIT 1
        )
      `).bind(
        comment.sourceCommentId, comment.commentFingerprint, post.snapshot.snapshotTime,
        post.snapshot.snapshotTime, comment.commentType, comment.commentTimeRaw, comment.replyCount,
        comment.isAuthor ? 1 : 0, comment.authorReplied, JSON.stringify(comment.rawPayload), logId,
        post.platformPostId, comment.username, comment.commentText, comment.commentTime,
        comment.commentTime, comment.commentTimeRaw,
      ));
      statements.push(d1.prepare(`
        INSERT INTO social_comments
          (post_id, platform, source, source_comment_id, comment_fingerprint, snapshot_id,
           snapshot_time, username, comment_text, comment_type, comment_time, comment_time_raw,
           likes, reply_count, is_author, author_replied, sentiment, raw_payload,
           data_availability_status, collection_log_id)
        SELECT p.id, 'douyin', 'workbuddy', ?, ?, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'unknown', ?, 'available', ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND p.platform_post_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM social_comments c
            WHERE c.post_id = p.id AND c.comment_fingerprint = ?
          )
        LIMIT 1
      `).bind(
        comment.sourceCommentId, comment.commentFingerprint, post.snapshot.snapshotTime,
        comment.username, comment.commentText, comment.commentType, comment.commentTime,
        comment.commentTimeRaw, comment.likeCount, comment.replyCount, comment.isAuthor ? 1 : 0,
        comment.authorReplied, JSON.stringify(comment.rawPayload), logId, post.snapshot.snapshotTime,
        post.platformPostId, comment.commentFingerprint,
      ));
    }
  }

  statements.push(d1.prepare(`
    UPDATE collection_logs SET status = 'completed', success_count = ?, comment_count = ?,
      error_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(payload.posts.length, summary.commentRows, logId));

  try {
    await d1.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "作品 V2.0 数据库事务失败";
    await failLog(logId, message);
    return Response.json({ error: "作品 V2.0 数据库写入失败，业务数据事务已回滚", detail: message }, { status: 500 });
  }

  return Response.json({
    logId,
    ...summary,
    insertedPosts: summary.newPosts,
    updatedPosts: summary.existingPosts,
    insertedComments: Math.max(0, summary.commentRows - duplicateComments),
    enrichedExistingComments: duplicateComments,
    message: `作品 V2.0 已入库：新增作品 ${summary.newPosts} 条、更新 ${summary.existingPosts} 条、快照 ${summary.snapshots} 条、评论明细 ${summary.commentRows} 条。`,
  });
}
