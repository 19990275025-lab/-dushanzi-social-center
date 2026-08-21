import {
  normalizeWorkBuddyDeepPosts,
  type WorkBuddyDeepPayload,
} from "@/lib/workbuddy-posts-deep-v2-1";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const object = (value: unknown): JsonObject => isObject(value) ? value : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();

function status(value: unknown, fallback = "unavailable") {
  if (Array.isArray(value)) return value.length ? "completed" : fallback;
  if (isObject(value)) return Object.keys(value).length ? "completed" : fallback;
  const raw = text(value).toLowerCase();
  return raw && raw !== "-" && !raw.includes("暂无") && !raw.startsWith("unavailable") ? "completed" : fallback;
}

function comments(value: unknown, overview: unknown) {
  const raw = object(value);
  return {
    overview_comment_count: overview,
    visible_comment_count: raw.total_visible,
    comments: (Array.isArray(raw.list) ? raw.list : []).map((item) => {
      const row = object(item);
      return {
        username: row.user,
        time: row.time,
        content: row.content,
        likes: row.likes,
        reply_count: row.reply_count,
        is_author: row.author === true,
        author_replied: row.author_replied,
        replies: row.replies,
      };
    }),
    raw_daily_monitor: raw,
  };
}

function audience(value: unknown) {
  const raw = object(value);
  return {
    ...raw,
    gender_distribution: raw.gender,
    age_distribution: raw.age,
    region_distribution: raw.region,
    activity_distribution: raw.activity,
    attention_hot_keywords: Array.isArray(raw.interest_keywords)
      ? raw.interest_keywords.map((item) => ({ 关键词: object(item).word ?? object(item).keyword, 热度: object(item).heat ?? object(item).value }))
      : raw.interest_keywords,
  };
}

function convertPost(value: unknown, bucket: "new" | "monitored" | "expired" | "private" | "failed") {
  const row = object(value);
  const basic = object(row.basic_metrics);
  const isPrivate = bucket === "private" || /私密/.test(text(row.status));
  const isFailed = bucket === "failed";
  const unavailableStatus = isFailed ? "failed" : bucket === "expired" ? "partial" : "unavailable";
  const traffic = object(row.traffic_analysis);
  const trafficSource = object(row.traffic_source);
  const rawKeywords = row.comment_keywords;
  const keywordRows = Array.isArray(rawKeywords)
    ? rawKeywords.map((item, index) => ({ keyword: object(item).word ?? object(item).keyword ?? item, rank: object(item).rank ?? index + 1 }))
    : [];
  const rawComments = object(row.comments);
  return {
    ...row,
    status: isPrivate ? "私密" : isFailed ? "采集失败" : text(row.status) || "正常",
    collection_time: row.collection_time ?? row.snapshot_time,
    checklist: {
      traffic: { status: isPrivate || isFailed ? unavailableStatus : status(traffic, unavailableStatus), detail: row.failure_reason ?? null },
      traffic_source: { status: isPrivate || isFailed ? unavailableStatus : status(trafficSource, unavailableStatus), detail: null },
      audience: { status: isPrivate || isFailed ? unavailableStatus : status(row.audience_analysis, unavailableStatus), detail: null },
      comment_keywords: { status: isPrivate || isFailed ? unavailableStatus : status(keywordRows, unavailableStatus), detail: null },
      comments: { status: isPrivate || isFailed ? unavailableStatus : status(rawComments.list, unavailableStatus), detail: null },
    },
    traffic_analysis: { ...traffic, traffic_sources: {
      ...trafficSource,
      ...(/平台扶持/.test(text(object(row.paid_traffic).type)) ? { 平台扶持流量: object(row.paid_traffic) } : {}),
    } },
    audience_analysis: audience(row.audience_analysis),
    comment_keywords: { keywords: keywordRows, raw_daily_monitor: rawKeywords },
    comments: comments(row.comments, basic["评论量"]),
    content_metadata: { ...object(row.content_metadata), duration: row.duration ?? object(row.content_metadata).时长 },
    raw_fields: { daily_bucket: bucket, monitoring_status: row.monitoring_status, first_seen_date: row.first_seen_date },
  };
}

export function normalizeWorkBuddyDailyPosts(value: unknown, file: { fileName: string; fullPath: string; checksum: string; fileSize: number }): WorkBuddyDeepPayload | null {
  if (!isObject(value) || value.schema !== "douyin_daily_monitor_v2.2" || !/^\d{4}-\d{2}-\d{2}$/.test(text(value.collection_date))) return null;
  const buckets = [
    ["new_posts", "new"],
    ["monitored_posts", "monitored"],
    ["expired_posts", "expired"],
    ["private_posts", "private"],
    ["failed_posts", "failed"],
  ] as const;
  const posts = buckets.flatMap(([key, bucket]) => (Array.isArray(value[key]) ? value[key] : []).map((item) => convertPost(item, bucket)));
  const converted = {
    collection_info: {
      collection_date: value.collection_date,
      collection_time: value.collection_time,
      collection_batch: value.collection_batch,
      list_time_filter: value.monitoring_window,
      posts_in_filter_range: posts.length,
    },
    summary: { ...object(value.summary), total_posts_collected: posts.length },
    file_info: { generated_at: value.collection_time, account: value.account },
    posts,
  };
  const payload = normalizeWorkBuddyDeepPosts(converted, file);
  return payload ? { ...payload, schemaVersion: "2.2", collectionDate: text(value.collection_date), collectionBatch: text(value.collection_batch) || null,
    rawCollectionInfo: object(converted.collection_info), rawSummary: object(converted.summary),
    qualityWarnings: ["V2.2 日监测五类作品数组已按原始状态统一映射；未提供字段保持 unavailable。"] } : null;
}
