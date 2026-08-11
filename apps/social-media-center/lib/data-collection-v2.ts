export const collectionDataTypes = ["hot_topic", "content", "comment"] as const;
export type CollectionDataType = (typeof collectionDataTypes)[number];

export const collectionPlatforms = ["douyin", "kuaishou", "weibo"] as const;
export type CollectionPlatform = (typeof collectionPlatforms)[number];

type UnknownRecord = Record<string, unknown>;

export type HotTopicRecord = {
  platform: CollectionPlatform;
  source: string;
  topic_type: "hot_rank" | "planting_rank" | "challenge_rank";
  topic_name: string;
  keyword: string;
  ranking: number;
  heat_value: number;
  trend: "up" | "down" | "new" | "stable";
  category: string | null;
  collect_time: string;
};

export type ContentRecord = {
  platform: CollectionPlatform;
  source: string;
  title: string;
  publish_time: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  account_id: number | null;
  content_type: string;
};

export type CommentRecord = {
  platform: CollectionPlatform;
  source: string;
  username: string;
  comment_text: string;
  comment_time: string;
  post_id: number | null;
};

export type StandardRecord = HotTopicRecord | ContentRecord | CommentRecord;

export type NormalizationResult = {
  index: number;
  dataType: CollectionDataType;
  platform: CollectionPlatform | null;
  source: string;
  normalized: StandardRecord | null;
  raw: UnknownRecord;
  errors: string[];
};

export type CollectionEnvelope = {
  dataType: CollectionDataType;
  source: string;
  platform: CollectionPlatform | null;
  collectedAt: string;
  accountId: number | null;
  postId: number | null;
  records: UnknownRecord[];
};

const platformAliases: Record<string, CollectionPlatform> = {
  douyin: "douyin",
  dy: "douyin",
  抖音: "douyin",
  kuaishou: "kuaishou",
  ks: "kuaishou",
  快手: "kuaishou",
  weibo: "weibo",
  wb: "weibo",
  微博: "weibo",
};

const dataTypeAliases: Record<string, CollectionDataType> = {
  hot_topic: "hot_topic",
  hotspot: "hot_topic",
  topic: "hot_topic",
  热点: "hot_topic",
  content: "content",
  post: "content",
  video: "content",
  内容: "content",
  作品: "content",
  comment: "comment",
  comments: "comment",
  评论: "comment",
};

const trendAliases: Record<string, HotTopicRecord["trend"]> = {
  up: "up",
  rising: "up",
  rise: "up",
  上升: "up",
  上涨: "up",
  down: "down",
  falling: "down",
  fall: "down",
  下降: "down",
  下跌: "down",
  new: "new",
  新: "new",
  新增: "new",
  stable: "stable",
  steady: "stable",
  持平: "stable",
  稳定: "stable",
};

const topicTypeAliases: Record<string, HotTopicRecord["topic_type"]> = {
  hot_rank: "hot_rank",
  douyin_hot_rank: "hot_rank",
  热点榜: "hot_rank",
  热搜榜: "hot_rank",
  planting_rank: "planting_rank",
  seed_rank: "planting_rank",
  douyin_seed_rank: "planting_rank",
  种草榜: "planting_rank",
  challenge_rank: "challenge_rank",
  douyin_challenge_rank: "challenge_rank",
  挑战榜: "challenge_rank",
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pick(record: UnknownRecord, aliases: string[]) {
  for (const alias of aliases) {
    if (record[alias] !== undefined && record[alias] !== null && record[alias] !== "") return record[alias];
  }
  return undefined;
}

function textValue(value: unknown, field: string, errors: string[], maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") {
    errors.push(`${field}不能为空`);
    return "";
  }
  const normalized = String(value).trim();
  if (!normalized) errors.push(`${field}不能为空`);
  if (normalized.length > maxLength) errors.push(`${field}不能超过${maxLength}个字符`);
  return normalized.slice(0, maxLength);
}

function optionalPositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replaceAll(",", "").trim());
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function metricValue(value: unknown, field: string, errors: string[], integer = false) {
  if (value === undefined || value === null || value === "") {
    errors.push(`${field}不能为空`);
    return 0;
  }
  let normalized: number;
  if (typeof value === "number") {
    normalized = value;
  } else {
    const source = String(value).trim().replaceAll(",", "");
    const multiplier = source.endsWith("亿") ? 100_000_000 : source.endsWith("万") ? 10_000 : 1;
    normalized = Number(source.replace(/[万亿]$/, "")) * multiplier;
  }
  if (!Number.isFinite(normalized) || normalized < 0 || (integer && !Number.isInteger(normalized))) {
    errors.push(`${field}必须是${integer ? "非负整数" : "非负数字"}`);
    return 0;
  }
  return integer ? normalized : Math.round(normalized * 100) / 100;
}

function requiredPositiveInteger(value: unknown, field: string, errors: string[]) {
  const normalized = optionalPositiveInteger(value);
  if (normalized === null) errors.push(`${field}必须是正整数`);
  return normalized ?? 0;
}

function isoDate(value: unknown, field: string, errors: string[]) {
  if (value === undefined || value === null || value === "") {
    errors.push(`${field}不能为空`);
    return "";
  }
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value < 10_000_000_000 ? value * 1000 : value);
  } else {
    const source = String(value).trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(source)
      ? source.replace(" ", "T") + "+08:00"
      : source;
    date = new Date(normalized);
  }
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field}不是有效日期时间`);
    return "";
  }
  return date.toISOString();
}

export function normalizePlatform(value: unknown): CollectionPlatform | null {
  if (typeof value !== "string") return null;
  return platformAliases[value.trim().toLowerCase()] ?? null;
}

export function normalizeDataType(value: unknown): CollectionDataType | null {
  if (typeof value !== "string") return null;
  return dataTypeAliases[value.trim().toLowerCase()] ?? null;
}

export function parseCollectionEnvelope(payload: unknown): { envelope: CollectionEnvelope | null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(payload)) return { envelope: null, errors: ["请求体必须是JSON对象"] };

  const dataType = normalizeDataType(pick(payload, ["data_type", "dataType", "type", "数据类型"]));
  if (!dataType) errors.push("data_type仅支持hot_topic、content或comment");

  const source = textValue(pick(payload, ["source", "source_name", "sourceName", "来源"]), "source", errors, 100);
  const rawPlatform = pick(payload, ["platform", "平台"]);
  const platform = rawPlatform === undefined ? null : normalizePlatform(rawPlatform);
  if (rawPlatform !== undefined && !platform) errors.push("platform仅支持douyin、kuaishou或weibo");

  const rawRecords = pick(payload, ["records", "data", "rows", "数据"]);
  if (!Array.isArray(rawRecords) || !rawRecords.length) errors.push("records必须是非空数组");
  if (Array.isArray(rawRecords) && rawRecords.length > 500) errors.push("单批次最多接收500条数据");
  const records = Array.isArray(rawRecords) ? rawRecords.filter(isRecord) : [];
  if (Array.isArray(rawRecords) && records.length !== rawRecords.length) errors.push("records中的每一项都必须是对象");

  const rawCollectedAt = pick(payload, ["collected_at", "collectedAt", "采集时间"]);
  const dateErrors: string[] = [];
  const collectedAt = rawCollectedAt === undefined
    ? new Date().toISOString()
    : isoDate(rawCollectedAt, "collected_at", dateErrors);
  errors.push(...dateErrors);

  const accountId = optionalPositiveInteger(pick(payload, ["account_id", "accountId", "账号ID"]));
  const postId = optionalPositiveInteger(pick(payload, ["post_id", "postId", "作品ID"]));

  if (errors.length || !dataType) return { envelope: null, errors };
  return { envelope: { dataType, source, platform, collectedAt, accountId, postId, records }, errors: [] };
}

function normalizeHotTopic(record: UnknownRecord, envelope: CollectionEnvelope, errors: string[]): HotTopicRecord {
  const platform = normalizePlatform(pick(record, ["platform", "平台"]) ?? envelope.platform);
  if (!platform) errors.push("platform仅支持douyin、kuaishou或weibo");
  const source = textValue(pick(record, ["source", "来源"]) ?? envelope.source, "source", errors, 100);
  const rawTopicType = pick(record, ["topic_type", "topicType", "榜单类型", "热点类型"]);
  const topicType = rawTopicType === undefined ? "hot_rank" : topicTypeAliases[String(rawTopicType).trim().toLowerCase()];
  if (!topicType) errors.push("topic_type仅支持hot_rank、planting_rank或challenge_rank");
  const rawTrend = pick(record, ["trend", "趋势"]);
  const trend = rawTrend === undefined ? "new" : trendAliases[String(rawTrend).trim().toLowerCase()];
  if (!trend) errors.push("trend仅支持up、down、new或stable");
  const topicName = textValue(pick(record, ["topic_name", "topicName", "topic", "title", "热点名称", "热点标题"]), "topic_name", errors);
  const rawKeyword = pick(record, ["keyword", "关键词"]);
  const keyword = rawKeyword === undefined ? topicName : textValue(rawKeyword, "keyword", errors, 500);
  const rawCategory = pick(record, ["category", "分类"]);
  const category = rawCategory === undefined ? null : textValue(rawCategory, "category", errors, 128);

  return {
    platform: platform ?? "douyin",
    source,
    topic_type: topicType ?? "hot_rank",
    topic_name: topicName,
    keyword,
    ranking: requiredPositiveInteger(pick(record, ["ranking", "rank", "排名"]), "ranking", errors),
    heat_value: metricValue(pick(record, ["heat_value", "heatValue", "heat", "热度"]), "heat_value", errors),
    trend: trend ?? "new",
    category,
    collect_time: isoDate(pick(record, ["collect_time", "collectTime", "collected_at", "采集时间"]) ?? envelope.collectedAt, "collect_time", errors),
  };
}

function normalizeContent(record: UnknownRecord, envelope: CollectionEnvelope, errors: string[]): ContentRecord {
  const platform = normalizePlatform(pick(record, ["platform", "平台"]) ?? envelope.platform);
  if (!platform) errors.push("platform仅支持douyin、kuaishou或weibo");
  const accountIdRaw = pick(record, ["account_id", "accountId", "账号ID"]) ?? envelope.accountId;
  const accountId = optionalPositiveInteger(accountIdRaw);
  if (accountIdRaw !== undefined && accountIdRaw !== null && accountId === null) errors.push("account_id必须是正整数");
  return {
    platform: platform ?? "douyin",
    source: textValue(pick(record, ["source", "来源"]) ?? envelope.source, "source", errors, 100),
    title: textValue(pick(record, ["title", "topic_name", "作品标题", "标题"]), "title", errors),
    publish_time: isoDate(pick(record, ["publish_time", "publishTime", "create_time", "发布时间"]), "publish_time", errors),
    views: metricValue(pick(record, ["views", "view_count", "play_count", "播放量"]), "views", errors, true),
    likes: metricValue(pick(record, ["likes", "liked_count", "点赞量", "点赞"]), "likes", errors, true),
    comments: metricValue(pick(record, ["comments", "comment_count", "评论量", "评论"]), "comments", errors, true),
    favorites: metricValue(pick(record, ["favorites", "collected_count", "收藏量", "收藏"]), "favorites", errors, true),
    shares: metricValue(pick(record, ["shares", "share_count", "分享量", "分享"]), "shares", errors, true),
    account_id: accountId,
    content_type: String(pick(record, ["content_type", "contentType", "内容类型"]) ?? "short_video").trim().slice(0, 100) || "short_video",
  };
}

function normalizeComment(record: UnknownRecord, envelope: CollectionEnvelope, errors: string[]): CommentRecord {
  const platform = normalizePlatform(pick(record, ["platform", "平台"]) ?? envelope.platform);
  if (!platform) errors.push("platform仅支持douyin、kuaishou或weibo");
  const postIdRaw = pick(record, ["post_id", "postId", "作品ID"]) ?? envelope.postId;
  const postId = optionalPositiveInteger(postIdRaw);
  if (postIdRaw !== undefined && postIdRaw !== null && postId === null) errors.push("post_id必须是正整数");
  return {
    platform: platform ?? "douyin",
    source: textValue(pick(record, ["source", "来源"]) ?? envelope.source, "source", errors, 100),
    username: textValue(pick(record, ["username", "nickname", "user_name", "用户名"]), "username", errors, 200),
    comment_text: textValue(pick(record, ["comment_text", "commentText", "content", "评论内容"]), "comment_text", errors, 2000),
    comment_time: isoDate(pick(record, ["comment_time", "commentTime", "create_time", "评论时间"]), "comment_time", errors),
    post_id: postId,
  };
}

export function normalizeCollectionRecords(envelope: CollectionEnvelope): NormalizationResult[] {
  const seen = new Set<string>();
  return envelope.records.map((raw, index) => {
    const errors: string[] = [];
    const normalized = envelope.dataType === "hot_topic"
      ? normalizeHotTopic(raw, envelope, errors)
      : envelope.dataType === "content"
        ? normalizeContent(raw, envelope, errors)
        : normalizeComment(raw, envelope, errors);
    const platform = errors.some((error) => error.startsWith("platform")) ? null : normalized.platform;
    const source = normalized.source || envelope.source;
    const dedupeKey = envelope.dataType === "hot_topic"
      ? `${normalized.platform}|${normalized.source}|${(normalized as HotTopicRecord).topic_type}|${(normalized as HotTopicRecord).topic_name}`
      : envelope.dataType === "content"
        ? `${normalized.platform}|${(normalized as ContentRecord).account_id ?? ""}|${(normalized as ContentRecord).title}`
        : `${normalized.platform}|${(normalized as CommentRecord).post_id ?? ""}|${(normalized as CommentRecord).username}|${(normalized as CommentRecord).comment_text}|${(normalized as CommentRecord).comment_time}`;
    if (seen.has(dedupeKey)) errors.push("同一批次存在重复记录");
    seen.add(dedupeKey);
    return {
      index,
      dataType: envelope.dataType,
      platform,
      source,
      normalized: errors.length ? normalized : normalized,
      raw,
      errors,
    };
  });
}

export function batchPlatform(envelope: CollectionEnvelope, results: NormalizationResult[]) {
  const platforms = new Set(results.map((result) => result.platform).filter((value): value is CollectionPlatform => Boolean(value)));
  if (envelope.platform) platforms.add(envelope.platform);
  if (platforms.size !== 1) return null;
  return [...platforms][0];
}
