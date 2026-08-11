import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  collectionApiAuthorized,
  collectionApiHeaders,
  collectionApiJson,
  parseJsonArray,
  parseJsonObject,
  parsePositiveId,
} from "@/lib/data-collection-api-v2";
import type { CommentRecord, ContentRecord, HotTopicRecord } from "@/lib/data-collection-v2";
import { analyzeImportedHotTopic } from "@/lib/hot-topic-import-analysis";

type LogRow = {
  id: number;
  platform: string;
  source_name: string;
  entity_type: "hot_topic" | "content" | "comment";
  status: string;
  total_count: number;
  error_count: number;
};

type StagingRow = {
  id: number;
  record_index: number;
  normalized_payload: string | null;
  validation_status: string;
  validation_errors: string;
};

function commentKey(record: CommentRecord) {
  return `${record.post_id}|${record.username}|${record.comment_text}|${record.comment_time}`;
}

function topicDataSource(record: HotTopicRecord) {
  if (record.platform !== "douyin") return record.source;
  if (record.topic_type === "planting_rank") return "douyin_seed_rank";
  if (record.topic_type === "challenge_rank") return "douyin_challenge_rank";
  return "douyin_hot_rank";
}

function collectionDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function topicSnapshotKey(record: HotTopicRecord) {
  return `${record.platform}|${topicDataSource(record)}|${record.topic_name}|${collectionDate(record.collect_time)}`;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: collectionApiHeaders() });
}

export async function POST(request: Request) {
  if (!collectionApiAuthorized(request)) return collectionApiJson({ error: "采集接口密钥无效" }, { status: 401 });
  const id = parsePositiveId(new URL(request.url).searchParams.get("id"));
  if (!id) return collectionApiJson({ error: "批次id无效" }, { status: 400 });
  let confirmation: { confirmed?: unknown; duplicate_mode?: unknown };
  try {
    confirmation = await request.json() as { confirmed?: unknown; duplicate_mode?: unknown };
  } catch {
    return collectionApiJson({ error: "请提交JSON确认信息" }, { status: 400 });
  }
  if (confirmation.confirmed !== true) {
    return collectionApiJson({ error: "必须明确设置confirmed为true后才能入库" }, { status: 400 });
  }

  await ensureDatabase();
  const d1 = getD1();
  const [log, staged] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, source_name, entity_type, status, total_count, error_count
      FROM collection_logs WHERE id = ? AND source_type = 'api'
    `).bind(id).first<LogRow>(),
    d1.prepare(`
      SELECT id, record_index, normalized_payload, validation_status, validation_errors
      FROM collection_staging_records WHERE collection_log_id = ? ORDER BY record_index
    `).bind(id).all<StagingRow>(),
  ]);

  if (!log) return collectionApiJson({ error: "采集批次不存在" }, { status: 404 });
  if (log.status === "completed") return collectionApiJson({ error: "该批次已经确认入库" }, { status: 409 });
  if (log.status !== "pending_confirmation") {
    return collectionApiJson({
      error: "该批次尚未通过校验，不能确认入库",
      status: log.status,
      validationErrors: staged.results.filter((row: StagingRow) => row.validation_status === "invalid").map((row: StagingRow) => ({
        index: row.record_index,
        errors: parseJsonArray<string>(row.validation_errors),
      })),
    }, { status: 409 });
  }
  if (!staged.results.length || staged.results.length !== log.total_count) {
    return collectionApiJson({ error: "暂存记录数量与采集日志不一致，已停止写入" }, { status: 409 });
  }
  if (staged.results.some((row: StagingRow) => row.validation_status !== "valid" || !row.normalized_payload)) {
    return collectionApiJson({ error: "暂存数据存在无效记录，已停止写入" }, { status: 409 });
  }

  const statements: Array<ReturnType<typeof d1.prepare>> = [];
  let successCount = staged.results.length;
  let skippedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let aiRecommendedCount = 0;

  if (log.entity_type === "hot_topic") {
    const records: HotTopicRecord[] = [];
    for (const row of staged.results) {
      const record = parseJsonObject<HotTopicRecord>(row.normalized_payload);
      if (!record) return collectionApiJson({ error: `第${row.record_index + 1}条标准热点数据损坏` }, { status: 409 });
      records.push(record);
    }
    const dates = [...new Set(records.map((record) => collectionDate(record.collect_time)))];
    const existing = await d1.prepare(`
      SELECT platform, data_source, topic_name, collection_date FROM hot_topics
      WHERE platform = ? AND source = ? AND collection_date IN (${dates.map(() => "?").join(",")})
    `).bind(log.platform, log.source_name, ...dates).all<{
      platform: string; data_source: string; topic_name: string; collection_date: string;
    }>();
    const existingKeys = new Set(existing.results.map((record) =>
      `${record.platform}|${record.data_source}|${record.topic_name}|${record.collection_date}`));
    const duplicateCount = records.filter((record) => existingKeys.has(topicSnapshotKey(record))).length;
    const duplicateMode = String(confirmation.duplicate_mode ?? "");
    if (duplicateCount && duplicateMode !== "overwrite" && duplicateMode !== "skip") {
      return collectionApiJson({
        error: "同一采集日期已有热点数据，请明确选择覆盖或跳过",
        requiresDuplicateDecision: true,
        duplicateCount,
        allowedModes: ["overwrite", "skip"],
      }, { status: 409 });
    }
    const selectedRecords = duplicateMode === "skip"
      ? records.filter((record) => !existingKeys.has(topicSnapshotKey(record)))
      : records;
    skippedCount = records.length - selectedRecords.length;
    updatedCount = duplicateMode === "overwrite" ? duplicateCount : 0;
    insertedCount = selectedRecords.length - updatedCount;
    successCount = selectedRecords.length;

    const [posts, priorTopics] = await Promise.all([
      d1.prepare("SELECT title, hashtags FROM social_posts ORDER BY publish_time DESC, id DESC LIMIT 300")
        .all<{ title: string; hashtags: string | null }>(),
      d1.prepare("SELECT topic_name, keyword, category FROM hot_topics ORDER BY collect_time DESC, id DESC LIMIT 500")
        .all<{ topic_name: string; keyword: string; category: string | null }>(),
    ]);
    const historicalText = [
      ...posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`),
      ...priorTopics.results.map((topic) => `${topic.topic_name} ${topic.keyword} ${topic.category ?? ""}`),
    ].join(" ");

    for (const record of selectedRecords) {
      const ai = analyzeImportedHotTopic(record, historicalText);
      if (ai?.worthFollowing) aiRecommendedCount += 1;
      statements.push(d1.prepare(`
        INSERT INTO hot_topics
          (platform, source, topic_type, data_source, topic_name, keyword, ranking,
           heat_value, trend, category, related_degree, ai_suggestion, status,
           source_agent, hot_score, recommended_topic, video_direction, publish_time_suggestion,
           collection_log_id, collect_time, collection_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(platform, data_source, topic_name, collection_date) DO UPDATE SET
          source = excluded.source, topic_type = excluded.topic_type,
          keyword = excluded.keyword, category = excluded.category,
          ranking = excluded.ranking, heat_value = excluded.heat_value,
          trend = excluded.trend, related_degree = excluded.related_degree,
          ai_suggestion = excluded.ai_suggestion, source_agent = excluded.source_agent,
          hot_score = excluded.hot_score, recommended_topic = excluded.recommended_topic,
          video_direction = excluded.video_direction,
          publish_time_suggestion = excluded.publish_time_suggestion,
          collection_log_id = excluded.collection_log_id,
          collect_time = excluded.collect_time, status = 'active'
      `).bind(
        record.platform, record.source, record.topic_type, topicDataSource(record),
        record.topic_name, record.keyword, record.ranking, record.heat_value,
        record.trend, record.category,
        ai ? ai.relevanceScore / 100 : null,
        ai ? JSON.stringify({ worthFollowing: ai.worthFollowing, worthFollowingLabel: ai.worthFollowingLabel, analysis: ai.analysis }) : null,
        record.source,
        ai?.relevanceScore ?? null,
        ai?.shortVideoTitle ?? null,
        ai?.shootingDirection ?? null,
        ai?.liveTheme ?? null,
        id, record.collect_time, collectionDate(record.collect_time),
      ));
    }
  } else if (log.entity_type === "content") {
    for (const row of staged.results) {
      const record = parseJsonObject<ContentRecord>(row.normalized_payload);
      if (!record?.account_id) return collectionApiJson({ error: `第${row.record_index + 1}条内容缺少账号关联` }, { status: 409 });
      statements.push(d1.prepare(`
        INSERT INTO social_posts
          (account_id, platform, source, title, content_type, publish_time,
           views, likes, comments, favorites, shares, collection_log_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(account_id, title) DO UPDATE SET
          platform = excluded.platform, source = excluded.source,
          content_type = excluded.content_type, publish_time = excluded.publish_time,
          views = excluded.views, likes = excluded.likes, comments = excluded.comments,
          favorites = excluded.favorites, shares = excluded.shares,
          collection_log_id = excluded.collection_log_id, updated_at = CURRENT_TIMESTAMP
      `).bind(
        record.account_id, record.platform, record.source, record.title,
        record.content_type, record.publish_time, record.views, record.likes,
        record.comments, record.favorites, record.shares, id,
      ));
    }
  } else {
    const records: CommentRecord[] = [];
    for (const row of staged.results) {
      const record = parseJsonObject<CommentRecord>(row.normalized_payload);
      if (!record?.post_id) return collectionApiJson({ error: `第${row.record_index + 1}条评论缺少作品关联` }, { status: 409 });
      records.push(record);
    }
    const postIds = [...new Set(records.map((record) => record.post_id as number))];
    const existingKeys = new Set<string>();
    for (let offset = 0; offset < postIds.length; offset += 50) {
      const chunk = postIds.slice(offset, offset + 50);
      const existing = await d1.prepare(`
        SELECT post_id, username, comment_text, comment_time FROM social_comments
        WHERE post_id IN (${chunk.map(() => "?").join(",")})
      `).bind(...chunk).all<{ post_id: number; username: string; comment_text: string; comment_time: string }>();
      for (const record of existing.results) existingKeys.add(commentKey({
        platform: log.platform as CommentRecord["platform"],
        source: log.source_name,
        username: record.username,
        comment_text: record.comment_text,
        comment_time: record.comment_time,
        post_id: record.post_id,
      }));
    }
    const newRecords = records.filter((record) => !existingKeys.has(commentKey(record)));
    skippedCount = records.length - newRecords.length;
    successCount = newRecords.length;
    for (const record of newRecords) {
      statements.push(d1.prepare(`
        INSERT INTO social_comments
          (post_id, platform, source, username, comment_text, comment_time,
           likes, sentiment, collection_log_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'unknown', ?)
      `).bind(
        record.post_id, record.platform, record.source, record.username,
        record.comment_text, record.comment_time, id,
      ));
    }
  }

  statements.push(
    d1.prepare("UPDATE collection_staging_records SET confirmed_at = CURRENT_TIMESTAMP WHERE collection_log_id = ?").bind(id),
    d1.prepare(`
      UPDATE collection_logs SET status = 'completed', success_count = ?, error_count = 0,
        comment_count = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(
      successCount,
      log.entity_type === "comment" ? successCount : 0,
      skippedCount ? JSON.stringify({ skippedDuplicates: skippedCount }) : null,
      id,
    ),
  );

  try {
    await d1.batch(statements);
  } catch (error) {
    console.error("V2.1 collection confirmation failed", error);
    return collectionApiJson({ error: "批次写入失败，未产生部分业务数据" }, { status: 500 });
  }

  const target = log.entity_type === "hot_topic"
    ? "hot_topics"
    : log.entity_type === "content"
      ? "social_posts"
      : "social_comments";
  return collectionApiJson({
    batchId: id,
    status: "completed",
    target,
    receivedCount: log.total_count,
    writtenCount: successCount,
    insertedCount,
    updatedCount,
    skippedCount,
    aiRecommendedCount,
    message: `采集批次已确认并写入${target}`,
  });
}
