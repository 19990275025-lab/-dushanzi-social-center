import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  normalizeWorkBuddyDeepPosts,
  summarizeWorkBuddyDeepPosts,
  validateWorkBuddyDeepPosts,
} from "@/lib/workbuddy-posts-deep-v2-1";
import { normalizeWorkBuddyDailyPosts } from "@/lib/workbuddy-posts-daily-v2-2";

async function checksum(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function sourcePath(request: Request, fallback: string) {
  const raw = request.headers.get("x-source-path-encoded");
  if (!raw) return fallback;
  try { return decodeURIComponent(raw); } catch { return fallback; }
}

export async function POST(request: Request) {
  const rawText = await request.text();
  let rawPayload: unknown;
  try { rawPayload = JSON.parse(rawText); }
  catch { return Response.json({ error: "WorkBuddy 深度作品文件不是有效 JSON" }, { status: 400 }); }

  const sourceFile = request.headers.get("x-source-file") ?? "douyin_posts_deep_unknown.json";
  const fullPath = sourcePath(request, sourceFile);
  const calculatedChecksum = await checksum(rawText);
  const suppliedChecksum = request.headers.get("x-source-checksum");
  if (suppliedChecksum && suppliedChecksum !== calculatedChecksum) {
    return Response.json({ error: "文件 checksum 与请求声明不一致，未建立处理记录" }, { status: 422 });
  }
  const fileMeta = {
    fileName: sourceFile,
    fullPath,
    checksum: calculatedChecksum,
    fileSize: new TextEncoder().encode(rawText).byteLength,
  };
  const payload = normalizeWorkBuddyDailyPosts(rawPayload, fileMeta) ?? normalizeWorkBuddyDeepPosts(rawPayload, fileMeta);
  if (!payload) return Response.json({ error: "WorkBuddy V2.1/V2.2 作品结构无效" }, { status: 400 });
  const errors = validateWorkBuddyDeepPosts(payload);

  await ensureDatabase();
  const d1 = getD1();
  const previous = await d1.prepare(`SELECT id, status, processed_at, collection_log_id
    FROM content_collection_files WHERE checksum = ? LIMIT 1`).bind(calculatedChecksum)
    .first<{ id: number; status: string; processed_at: string | null; collection_log_id: number | null }>();
  if (previous?.status === "completed") {
    return Response.json({
      error: "同一 checksum 已完成入库，禁止重复处理",
      completedFile: previous,
      checksum: calculatedChecksum,
    }, { status: 409 });
  }

  const metadata = JSON.stringify({
    schemaVersion: payload.schemaVersion,
    schemaFieldCount: payload.schemaFieldCount,
    scalarValueCount: payload.scalarValueCount,
    qualityWarnings: payload.qualityWarnings,
    rawCollectionInfo: payload.rawCollectionInfo,
    rawSummary: payload.rawSummary,
  });
  if (previous) {
    await d1.prepare(`UPDATE content_collection_files SET
      file_name = ?, full_path = ?, file_size = ?, collection_date = ?, collection_time = ?,
      collection_batch = ?, actual_post_count = ?, completeness_score = ?,
      status = ?, validated_at = CASE WHEN ? = 'validated' THEN CURRENT_TIMESTAMP ELSE validated_at END,
      metadata = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(payload.sourceFile, payload.sourcePath, payload.fileSize, payload.collectionDate, payload.collectionTime,
        payload.collectionBatch, payload.posts.length, payload.completenessScore,
        errors.length ? "failed" : "validated", errors.length ? "failed" : "validated",
        metadata, errors.length ? JSON.stringify(errors) : null, previous.id).run();
  } else {
    await d1.prepare(`INSERT INTO content_collection_files
      (file_name, full_path, checksum, file_size, collection_date, collection_time, collection_batch,
       actual_post_count, completeness_score, status, validated_at, metadata, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'validated' THEN CURRENT_TIMESTAMP END, ?, ?)`)
      .bind(payload.sourceFile, payload.sourcePath, payload.checksum, payload.fileSize,
        payload.collectionDate, payload.collectionTime, payload.collectionBatch, payload.posts.length,
        payload.completenessScore, errors.length ? "failed" : "validated", errors.length ? "failed" : "validated",
        metadata, errors.length ? JSON.stringify(errors) : null).run();
  }
  if (errors.length) return Response.json({ error: "深度作品完整性校验失败，未写入业务表", errors }, { status: 422 });

  const allPosts = await d1.prepare(`SELECT id, platform_post_id, title, publish_time
    FROM social_posts WHERE platform = 'douyin'`).all<{ id: number; platform_post_id: string | null; title: string; publish_time: string }>();
  const existingPosts = payload.posts.filter((post) => allPosts.results.some((row) =>
    (post.platformPostId && row.platform_post_id === post.platformPostId) ||
    (!post.platformPostId && !row.platform_post_id && row.title === post.title && row.publish_time === post.publishTime),
  )).length;
  const summary = summarizeWorkBuddyDeepPosts(payload, existingPosts);

  return Response.json({
    file: {
      fileName: payload.sourceFile,
      fullPath: payload.sourcePath,
      checksum: payload.checksum,
      fileSize: payload.fileSize,
      collectionDate: payload.collectionDate,
      collectionTime: payload.collectionTime,
      collectionBatch: payload.collectionBatch,
      completenessScore: payload.completenessScore,
    },
    summary,
    fieldChecks: payload.schemaVersion === "2.2" ? {
      collection_date: payload.collectionDate === "2026-08-21",
      new_posts: Array.isArray((rawPayload as Record<string, unknown>).new_posts),
      monitored_posts: Array.isArray((rawPayload as Record<string, unknown>).monitored_posts),
      private_posts: Array.isArray((rawPayload as Record<string, unknown>).private_posts),
      expired_posts: Array.isArray((rawPayload as Record<string, unknown>).expired_posts),
      failed_posts: Array.isArray((rawPayload as Record<string, unknown>).failed_posts),
      snapshot_time: payload.posts.every((post) => Boolean(post.snapshot.snapshotTime)),
      collection_time: payload.posts.every((post) => Boolean(post.snapshot.collectionTime)),
    } : {
      collection_info: true, collection_summary: false, summary: true, posts: true,
      missingTopLevelExpectedFields: ["collection_summary", "collection_info.collection_date", "collection_info.collection_batch"],
    },
    postPreview: payload.posts.map((post) => ({
      sourceIdentity: post.sourceIdentity,
      platformPostId: post.platformPostId,
      title: post.title,
      status: post.sourceRecordStatus,
      publishTime: post.publishTime,
      playCount: post.snapshot.playCount,
      commentOverviewCount: post.snapshot.commentOverviewCount,
      actualLoadedCount: post.snapshot.actualLoadedCount,
      metricSeriesPoints: post.metricSeries.length,
      audienceRecords: post.audience.records.length,
      commentKeywords: post.commentKeywords.records.length,
      comments: post.comments.length,
      replies: post.comments.reduce((total, comment) => total + comment.replies.length, 0),
      paidTraffic: post.paidTraffic,
      availability: {
        overall: post.snapshot.dataAvailabilityStatus,
        traffic: post.snapshot.trafficAvailabilityStatus,
        trafficSources: post.snapshot.trafficSourcesAvailabilityStatus,
        audience: post.snapshot.audienceAvailabilityStatus,
        commentKeywords: post.snapshot.commentKeywordsAvailabilityStatus,
        comments: post.snapshot.commentsAvailabilityStatus,
      },
    })),
    qualityWarnings: payload.qualityWarnings,
    message: `WorkBuddy 抖音作品 V${payload.schemaVersion} 无业务落库预览已生成，可执行确认入库。`,
  });
}
