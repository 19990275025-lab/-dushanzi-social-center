import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  normalizeWorkBuddyDeepPosts,
  summarizeWorkBuddyDeepPosts,
  validateWorkBuddyDeepPosts,
  type DeepPost,
} from "@/lib/workbuddy-posts-deep-v2-1";
import { normalizeWorkBuddyDailyPosts } from "@/lib/workbuddy-posts-daily-v2-2";
import { loadContentEffectEvaluations } from "@/lib/content-effect-evaluation-server";

type ExistingPost = { id: number; platform_post_id: string | null; title: string; publish_time: string };

async function checksum(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function sourcePath(request: Request, fallback: string) {
  const raw = request.headers.get("x-source-path-encoded");
  if (!raw) return fallback;
  try { return decodeURIComponent(raw); } catch { return fallback; }
}

const matchSql = `(p.platform_post_id = ? OR (? IS NULL AND p.platform_post_id IS NULL AND p.title = ? AND p.publish_time = ?))`;
function matchBinds(post: DeepPost) {
  return [post.platformPostId, post.platformPostId, post.title, post.publishTime] as const;
}

function tags(post: DeepPost) {
  const values = post.contentMetadata.tags;
  return Array.isArray(values) ? values.filter((item): item is string => typeof item === "string") : [];
}

async function markFailed(fileId: number, logId: number | null, message: string) {
  const d1 = getD1();
  const statements = [d1.prepare(`UPDATE content_collection_files SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(message.slice(0, 4000), fileId)];
  if (logId) statements.push(d1.prepare(`UPDATE collection_logs SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(message.slice(0, 4000), logId));
  await d1.batch(statements);
}

export async function POST(request: Request) {
  if (new URL(request.url).searchParams.get("confirmed") !== "true") {
    return Response.json({ error: "必须在预览后明确确认，才能写入深度作品 V2.1 数据" }, { status: 409 });
  }
  const rawText = await request.text();
  let rawPayload: unknown;
  try { rawPayload = JSON.parse(rawText); }
  catch { return Response.json({ error: "WorkBuddy 深度作品文件不是有效 JSON" }, { status: 400 }); }
  const sourceFile = request.headers.get("x-source-file") ?? "douyin_posts_deep_unknown.json";
  const fullPath = sourcePath(request, sourceFile);
  const calculatedChecksum = await checksum(rawText);
  const suppliedChecksum = request.headers.get("x-source-checksum");
  if (suppliedChecksum && suppliedChecksum !== calculatedChecksum) return Response.json({ error: "checksum 复核失败，未写入" }, { status: 422 });
  const fileMeta = {
    fileName: sourceFile, fullPath, checksum: calculatedChecksum,
    fileSize: new TextEncoder().encode(rawText).byteLength,
  };
  const payload = normalizeWorkBuddyDailyPosts(rawPayload, fileMeta) ?? normalizeWorkBuddyDeepPosts(rawPayload, fileMeta);
  if (!payload) return Response.json({ error: "WorkBuddy V2.1/V2.2 作品结构无效" }, { status: 400 });
  const errors = validateWorkBuddyDeepPosts(payload);
  if (errors.length) return Response.json({ error: "确认前完整性复核失败，未写入业务表", errors }, { status: 422 });

  await ensureDatabase();
  const d1 = getD1();
  const fileRecord = await d1.prepare(`SELECT id, status FROM content_collection_files WHERE checksum = ? LIMIT 1`)
    .bind(calculatedChecksum).first<{ id: number; status: string }>();
  if (!fileRecord) return Response.json({ error: "未找到该 checksum 的预览记录，请先执行预览" }, { status: 409 });
  if (fileRecord.status === "completed") return Response.json({ error: "同一 checksum 已完成入库，禁止重复写入" }, { status: 409 });
  if (fileRecord.status !== "validated") return Response.json({ error: `文件状态为 ${fileRecord.status}，不能确认入库` }, { status: 409 });
  await d1.prepare(`UPDATE content_collection_files SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(fileRecord.id).run();

  await d1.prepare(`INSERT INTO social_accounts
    (platform, account_name, account_id, account_url, followers_count, status)
    VALUES ('douyin', ?, 'dushanzi_daxigu_douyin', NULL, 0, 'active')
    ON CONFLICT(platform, account_id) DO UPDATE SET account_name = excluded.account_name, status = 'active', updated_at = CURRENT_TIMESTAMP`)
    .bind(payload.accountName).run();
  const account = await d1.prepare(`SELECT id FROM social_accounts WHERE platform = 'douyin' AND account_id = 'dushanzi_daxigu_douyin' LIMIT 1`).first<{ id: number }>();
  if (!account) {
    await markFailed(fileRecord.id, null, "抖音账号初始化失败");
    return Response.json({ error: "抖音账号初始化失败" }, { status: 500 });
  }

  const existingResult = await d1.prepare(`SELECT id, platform_post_id, title, publish_time FROM social_posts WHERE platform = 'douyin'`).all<ExistingPost>();
  const existingByIdentity = new Map<string, ExistingPost>();
  for (const post of payload.posts) {
    const existing = existingResult.results.find((row) =>
      (post.platformPostId && row.platform_post_id === post.platformPostId) ||
      (!post.platformPostId && !row.platform_post_id && row.title === post.title && row.publish_time === post.publishTime),
    );
    if (existing) existingByIdentity.set(post.sourceIdentity, existing);
  }
  const summary = summarizeWorkBuddyDeepPosts(payload, existingByIdentity.size);
  const logResult = await d1.prepare(`INSERT INTO collection_logs
    (platform, source_type, source_name, entity_type, status, total_count, success_count,
     error_count, comment_count, source_file, batch_key, unavailable_count, raw_payload, collected_at)
    VALUES ('douyin', 'api', ?, ?,
      'pending', ?, 0, 0, ?, ?, ?, ?, ?, ?)`)
    .bind(payload.schemaVersion === "2.2" ? "WorkBuddy抖音作品每日监测V2.2" : "WorkBuddy抖音作品深度采集V2.1",
      payload.schemaVersion === "2.2" ? "workbuddy_posts_daily_v2_2" : "workbuddy_posts_deep_v2_1",
      payload.posts.length, summary.actualComments, payload.sourceFile,
      `workbuddy:douyin-posts-deep:${payload.checksum}`, payload.unavailableValueCount,
      JSON.stringify({ checksum: payload.checksum, fullPath: payload.sourcePath, collectionBatch: payload.collectionBatch,
        completenessScore: payload.completenessScore, schemaFieldCount: payload.schemaFieldCount,
        scalarValueCount: payload.scalarValueCount, qualityWarnings: payload.qualityWarnings }), payload.collectionTime).run();
  const logId = Number(logResult.meta.last_row_id);
  const statements: Array<ReturnType<typeof d1.prepare>> = [];

  for (const post of payload.posts) {
    const existing = existingByIdentity.get(post.sourceIdentity);
    const currentValues = [
      account.id, "workbuddy", post.platformPostId, post.title, post.contentType, post.publishTime,
      post.postUrl, post.snapshot.playCount, post.snapshot.likeCount, post.snapshot.commentOverviewCount,
      post.snapshot.favoriteCount, post.snapshot.shareCount, post.snapshot.followerGain,
      JSON.stringify(tags(post)), post.durationSeconds === null ? null : Math.round(post.durationSeconds),
      post.durationSeconds, post.postType, post.postStatus, JSON.stringify(post.contentMetadata),
      post.snapshot.dataAvailabilityStatus, post.traffic.completionRate, post.traffic.swipeAwayRate,
      post.traffic.averagePlayDurationSeconds,
      JSON.stringify(post.trafficSources.map((source) => ({ label: source.sourceName, value: source.percentage, nature: source.trafficNature }))),
      logId,
    ];
    if (existing) {
      statements.push(d1.prepare(`UPDATE social_posts SET
        account_id = ?, source = ?, platform_post_id = COALESCE(?, platform_post_id), title = ?, content_type = ?, publish_time = ?,
        post_url = COALESCE(?, post_url), views = COALESCE(?, views), likes = COALESCE(?, likes), comments = COALESCE(?, comments),
        favorites = COALESCE(?, favorites), shares = COALESCE(?, shares), fans_growth = COALESCE(?, fans_growth),
        hashtags = ?, duration = COALESCE(?, duration), duration_seconds = COALESCE(?, duration_seconds),
        post_type = ?, post_status = ?, content_metadata = ?, data_availability_status = ?, completion_rate = ?,
        skip_rate = ?, average_play_duration = ?, traffic_sources = ?, collection_log_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(...currentValues, existing.id));
    } else {
      statements.push(d1.prepare(`INSERT INTO social_posts
        (account_id, source, platform_post_id, title, content_type, publish_time, post_url,
         views, likes, comments, favorites, shares, fans_growth, hashtags, duration, duration_seconds,
         post_type, post_status, content_metadata, data_availability_status, completion_rate, skip_rate,
         average_play_duration, traffic_sources, collection_log_id, platform)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), COALESCE(?, 0),
          COALESCE(?, 0), COALESCE(?, 0), COALESCE(?, 0), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'douyin')`).bind(...currentValues));
    }

    statements.push(d1.prepare(`INSERT INTO social_post_snapshots
      (post_id, platform, snapshot_time, collection_time, snapshot_date, collection_batch, play_count, like_count,
       comment_overview_count, actual_loaded_count, comment_rows_count, favorite_count,
       share_count, danmaku_count, follower_gain, follower_loss, follower_play_ratio,
       page_entry_rate, data_availability_status, traffic_availability_status,
       traffic_sources_availability_status, audience_availability_status,
       comment_keywords_availability_status, comments_availability_status, post_age_days,
       source_file, raw_payload, collection_log_id, source_record_status, source_failure_reason)
      SELECT p.id, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM social_posts p WHERE p.platform = 'douyin' AND ${matchSql} LIMIT 1
      ON CONFLICT(post_id, snapshot_time) DO NOTHING`).bind(
      post.snapshot.snapshotTime, post.snapshot.collectionTime, payload.collectionDate, payload.collectionBatch, post.snapshot.playCount,
      post.snapshot.likeCount, post.snapshot.commentOverviewCount, post.snapshot.actualLoadedCount,
      post.snapshot.commentRowsCount, post.snapshot.favoriteCount, post.snapshot.shareCount,
      post.snapshot.danmakuCount, post.snapshot.followerGain, post.snapshot.followerLoss,
      post.snapshot.followerPlayRatio, post.snapshot.dataAvailabilityStatus,
      post.snapshot.trafficAvailabilityStatus, post.snapshot.trafficSourcesAvailabilityStatus,
      post.snapshot.audienceAvailabilityStatus, post.snapshot.commentKeywordsAvailabilityStatus,
      post.snapshot.commentsAvailabilityStatus, post.postAgeDays, payload.sourceFile,
      JSON.stringify(post.snapshot.rawPayload), logId, post.sourceRecordStatus, post.sourceFailureReason,
      ...matchBinds(post),
    ));

    statements.push(d1.prepare(`INSERT INTO social_post_traffic
      (post_id, snapshot_id, snapshot_time, completion_rate, average_play_duration_seconds,
       two_sec_bounce_rate, five_sec_completion_rate, average_play_ratio, cover_click_rate,
       swipe_away_rate, page_entry_rate, comment_entry_rate, text_expand_rate,
       text_completion_rate, average_images_viewed, like_rate, comment_rate, share_rate,
       favorite_rate, not_interested_rate, data_availability_status, raw_payload, collection_log_id)
      SELECT p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
      WHERE p.platform = 'douyin' AND ${matchSql} LIMIT 1 ON CONFLICT(snapshot_id) DO NOTHING`).bind(
      post.snapshot.snapshotTime, post.traffic.completionRate, post.traffic.averagePlayDurationSeconds,
      post.traffic.twoSecBounceRate, post.traffic.fiveSecCompletionRate, post.traffic.averagePlayRatio,
      post.traffic.coverClickRate, post.traffic.swipeAwayRate, post.traffic.pageEntryRate,
      post.traffic.commentEntryRate, post.traffic.textExpandRate, post.traffic.textCompletionRate,
      post.traffic.averageImagesViewed, post.traffic.likeRate, post.traffic.commentRate,
      post.traffic.shareRate, post.traffic.favoriteRate, post.traffic.notInterestedRate,
      post.traffic.dataAvailabilityStatus, JSON.stringify(post.traffic.rawPayload), logId,
      post.snapshot.snapshotTime, ...matchBinds(post),
    ));

    for (const point of post.metricSeries) {
      statements.push(d1.prepare(`INSERT INTO social_post_metric_series
        (post_id, snapshot_id, snapshot_time, metric_type, series_name, point_index,
         point_time, point_label, metric_value, unit, source_path, raw_value,
         data_availability_status, collection_log_id)
        SELECT p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND ${matchSql} LIMIT 1
        ON CONFLICT DO NOTHING`).bind(
        post.snapshot.snapshotTime, point.metricType, point.seriesName, point.pointIndex,
        point.pointTime, point.pointLabel, point.metricValue, point.unit, point.sourcePath,
        JSON.stringify(point.rawValue), logId, post.snapshot.snapshotTime, ...matchBinds(post),
      ));
    }

    for (const source of post.trafficSources) {
      statements.push(d1.prepare(`INSERT INTO social_post_traffic_sources
        (post_id, snapshot_id, snapshot_time, source_type, metric_dimension, source_name, traffic_value,
         percentage, change_percentage, traffic_nature, raw_value, collection_log_id)
        SELECT p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND ${matchSql} LIMIT 1
        ON CONFLICT(snapshot_id, metric_dimension, source_name, traffic_nature) DO NOTHING`).bind(
        post.snapshot.snapshotTime, source.sourceType, source.trafficValue !== null || source.percentage !== null ? "play" : "unknown", source.sourceName, source.trafficValue,
        source.percentage, source.changePercentage, source.trafficNature, JSON.stringify(source.rawValue),
        logId, post.snapshot.snapshotTime, ...matchBinds(post),
      ));
    }

    if (post.paidTraffic) {
      statements.push(d1.prepare(`INSERT INTO social_post_paid_traffic
        (post_id, snapshot_id, snapshot_time, campaign_type, promotion_type, promotion_source, promotion_present, play_count, relationship_to_overview,
         detail_available, data_availability_status, raw_payload, collection_log_id)
        SELECT p.id, s.id, ?, ?, 'paid', 'dou_plus', 1, ?, ?, ?, ?, ?, ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND ${matchSql} LIMIT 1
        ON CONFLICT(snapshot_id, campaign_type) DO NOTHING`).bind(
        post.snapshot.snapshotTime, post.paidTraffic.campaignType, post.paidTraffic.playCount,
        post.paidTraffic.relationshipToOverview, post.paidTraffic.detailAvailable === null ? null : post.paidTraffic.detailAvailable ? 1 : 0,
        post.paidTraffic.dataAvailabilityStatus, JSON.stringify(post.paidTraffic.rawPayload), logId,
        post.snapshot.snapshotTime, ...matchBinds(post),
      ));
    }

    for (const audience of post.audience.records) {
      statements.push(d1.prepare(`INSERT INTO social_post_audience
        (post_id, snapshot_id, snapshot_time, dimension_type, dimension_name, dimension_value,
         percentage, ranking, raw_value, data_availability_status, collection_log_id)
        SELECT p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND ${matchSql} LIMIT 1
        ON CONFLICT(snapshot_id, dimension_type, dimension_name) DO NOTHING`).bind(
        post.snapshot.snapshotTime, audience.dimensionType, audience.dimensionName,
        audience.dimensionValue, audience.percentage, audience.ranking, JSON.stringify(audience.rawValue),
        post.audience.dataAvailabilityStatus, logId, post.snapshot.snapshotTime, ...matchBinds(post),
      ));
    }

    for (const keyword of post.commentKeywords.records) {
      statements.push(d1.prepare(`INSERT INTO social_post_comment_keywords
        (post_id, snapshot_id, snapshot_time, keyword, ranking, occurrence_count,
         sentiment, category, data_availability_status, raw_value, collection_log_id)
        SELECT p.id, s.id, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND ${matchSql} LIMIT 1
        ON CONFLICT(snapshot_id, keyword, ranking) DO NOTHING`).bind(
        post.snapshot.snapshotTime, keyword.keyword, keyword.rank, post.commentKeywords.dataAvailabilityStatus,
        JSON.stringify(keyword.rawValue), logId, post.snapshot.snapshotTime, ...matchBinds(post),
      ));
    }

    for (const comment of post.comments) {
      statements.push(d1.prepare(`INSERT INTO social_comments
        (post_id, platform, source, source_comment_id, comment_fingerprint, snapshot_id,
         snapshot_time, username, comment_text, comment_type, comment_time, comment_time_raw,
         likes, likes_availability_status, likes_raw_value, reply_count, is_author,
         author_replied, sentiment, raw_payload, data_availability_status, collection_log_id)
        SELECT p.id, 'douyin', 'workbuddy', ?, ?, s.id, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), ?, ?, ?, ?, ?,
          'unknown', ?, 'available', ?
        FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
        WHERE p.platform = 'douyin' AND ${matchSql}
          AND NOT EXISTS (SELECT 1 FROM social_comments c WHERE c.post_id = p.id AND c.comment_fingerprint = ?)
        LIMIT 1`).bind(
        comment.sourceCommentId, comment.fingerprint, post.snapshot.snapshotTime, comment.username,
        comment.commentText, comment.commentType, comment.commentTime, comment.commentTimeRaw,
        comment.likes, comment.likesAvailabilityStatus, JSON.stringify(comment.likesRawValue ?? null),
        comment.replyCount, comment.isAuthor ? 1 : 0, comment.authorReplied === null ? null : comment.authorReplied ? 1 : 0,
        JSON.stringify(comment.rawPayload), logId, post.snapshot.snapshotTime, ...matchBinds(post), comment.fingerprint,
      ));
      for (const reply of comment.replies) {
        statements.push(d1.prepare(`INSERT INTO social_comment_replies
          (comment_id, post_id, snapshot_id, source_reply_id, reply_fingerprint, username,
           reply_text, reply_type, reply_time, reply_time_raw, likes, is_author,
           data_availability_status, raw_payload, collection_log_id)
          SELECT c.id, p.id, s.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?
          FROM social_posts p JOIN social_post_snapshots s ON s.post_id = p.id AND s.snapshot_time = ?
          JOIN social_comments c ON c.post_id = p.id AND c.comment_fingerprint = ?
          WHERE p.platform = 'douyin' AND ${matchSql}
          ON CONFLICT(comment_id, reply_fingerprint) DO NOTHING`).bind(
          reply.sourceReplyId, reply.fingerprint, reply.username, reply.replyText, reply.replyType,
          reply.replyTime, reply.replyTimeRaw, reply.likes, reply.isAuthor === null ? null : reply.isAuthor ? 1 : 0,
          JSON.stringify(reply.rawPayload), logId, post.snapshot.snapshotTime, comment.fingerprint,
          ...matchBinds(post),
        ));
      }
    }
  }

  try { await d1.batch(statements); }
  catch (error) {
    const message = error instanceof Error ? error.message : "深度作品 V2.1 数据库事务失败";
    await markFailed(fileRecord.id, logId, message);
    return Response.json({ error: "深度作品 V2.1 数据写入失败，业务数据事务已回滚", detail: message }, { status: 500 });
  }

  let evaluationCount = 0;
  try {
    const evaluations = await loadContentEffectEvaluations(d1, { platform: "douyin" });
    for (const evaluation of evaluations.evaluations.filter((item) => item.grade !== null)) {
      const snapshotRow = await d1.prepare(`SELECT id FROM social_post_snapshots
        WHERE post_id = ? AND collection_log_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1`)
        .bind(evaluation.postId, logId).first<{ id: number }>();
      if (!snapshotRow) continue;
      const result = await d1.prepare(`INSERT INTO social_post_evaluations
        (post_id, evaluation_date, snapshot_id, total_score, grade, propagation_score,
         interaction_score, attraction_score, efficiency_score, confidence, douyin_paid_status,
         data_completeness, raw_evaluation, collection_log_id, platform, model_version, promotion_status, promotion_type, natural_performance_confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'douyin', 'douyin-content-effect-rules-v1', ?, ?, ?)
        ON CONFLICT(post_id, evaluation_date, snapshot_id) DO NOTHING`).bind(
        evaluation.postId, payload.collectionDate, snapshotRow.id, evaluation.overallScore, evaluation.grade,
        evaluation.dimensions.propagation.score, evaluation.dimensions.interaction.score,
        evaluation.dimensions.attraction.score, evaluation.dimensions.efficiency.score,
        evaluation.dataConfidence, evaluation.labels.includes("含付费流量") ? "paid" : "none",
        evaluation.dataCompleteness, JSON.stringify(evaluation), logId,
        evaluation.labels.includes("含付费流量") ? "paid" : "none", evaluation.labels.includes("含付费流量") ? "paid" : "organic", evaluation.naturalPerformanceConfidence,
      ).run();
      evaluationCount += Number(result.meta.changes ?? 0);
    }
    await d1.batch([
      d1.prepare(`UPDATE collection_logs SET status = 'completed', success_count = ?,
        comment_count = ?, error_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(payload.posts.length, summary.actualComments, logId),
      d1.prepare(`UPDATE content_collection_files SET status = 'completed', processed_at = CURRENT_TIMESTAMP,
        collection_log_id = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND checksum = ?`)
        .bind(logId, fileRecord.id, payload.checksum),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "内容效果评分历史保存失败";
    await markFailed(fileRecord.id, logId, message);
    return Response.json({ error: "作品已写入但评分历史保存失败，批次未标记完成", detail: message }, { status: 500 });
  }

  const [snapshotCount, seriesCount, sourceCount, paidCount, audienceCount, keywordCount, commentCount, replyCount] = await Promise.all([
    d1.prepare("SELECT COUNT(*) count FROM social_post_snapshots WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) count FROM social_post_metric_series WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) count FROM social_post_traffic_sources WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) count FROM social_post_paid_traffic WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) count FROM social_post_audience WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) count FROM social_post_comment_keywords WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) count FROM social_comments WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
    d1.prepare("SELECT COUNT(*) count FROM social_comment_replies WHERE collection_log_id = ?").bind(logId).first<{ count: number }>(),
  ]);

  return Response.json({
    logId, fileRecordId: fileRecord.id, checksum: payload.checksum, ...summary,
    insertedPosts: summary.newPosts, updatedPosts: summary.existingPosts,
    databaseCounts: {
      snapshots: Number(snapshotCount?.count ?? 0), metricSeriesPoints: Number(seriesCount?.count ?? 0),
      trafficSources: Number(sourceCount?.count ?? 0), paidTraffic: Number(paidCount?.count ?? 0),
      audienceRecords: Number(audienceCount?.count ?? 0), commentKeywords: Number(keywordCount?.count ?? 0),
      comments: Number(commentCount?.count ?? 0), commentReplies: Number(replyCount?.count ?? 0), evaluations: evaluationCount,
    },
    message: `WorkBuddy 抖音作品 V${payload.schemaVersion} 已完成：${payload.posts.length} 条作品、${Number(seriesCount?.count ?? 0)} 个真实趋势点、${Number(commentCount?.count ?? 0)} 条真实评论、${evaluationCount} 条评分历史。`,
  });
}
