export type DataAvailabilityStatus = "available" | "partial" | "expired" | "unavailable";

type JsonObject = Record<string, unknown>;

export type WorkBuddyTrafficSource = {
  sourceType: string;
  sourceName: string;
  trafficValue: number | null;
  percentage: number | null;
  changePercentage: number | null;
  trafficNature: "organic" | "paid" | "other";
  rawValue: unknown;
};

export type WorkBuddyAudienceRecord = {
  dimensionType: "gender" | "age" | "region" | "interest" | "device" | "activity" | "followers" | "other";
  dimensionName: string;
  dimensionValue: number | null;
  percentage: number | null;
  ranking: number | null;
  rawValue: unknown;
};

export type WorkBuddyCommentKeyword = {
  keyword: string;
  rank: number | null;
  count: number | null;
  sentiment: string | null;
  category: string | null;
  rawValue: unknown;
};

export type WorkBuddyComment = {
  sourceCommentId: string | null;
  commentFingerprint: string;
  username: string;
  commentText: string | null;
  commentType: "text" | "image" | "emoji" | "mixed" | "other";
  commentTime: string | null;
  commentTimeRaw: string;
  likeCount: number;
  replyCount: number;
  isAuthor: boolean;
  authorReplied: boolean | null;
  rawPayload: JsonObject;
};

export type WorkBuddyPostV2 = {
  platformPostId: string;
  title: string;
  publishTime: string;
  postUrl: string;
  postType: string;
  contentType: "video" | "image_text" | "mixed" | "other";
  durationSeconds: number | null;
  postStatus: string | null;
  isPinned: boolean;
  contentMetadata: JsonObject;
  postAgeDays: number;
  snapshot: {
    snapshotTime: string;
    collectionTime: string;
    playCount: number | null;
    likeCount: number | null;
    commentOverviewCount: number | null;
    actualLoadedCount: number | null;
    commentRowsCount: number;
    favoriteCount: number | null;
    shareCount: number | null;
    danmakuCount: number | null;
    followerGain: number | null;
    followerLoss: number | null;
    followerPlayRatio: number | null;
    pageEntryRate: number | null;
    dataAvailabilityStatus: DataAvailabilityStatus;
    trafficAvailabilityStatus: DataAvailabilityStatus;
    trafficSourcesAvailabilityStatus: DataAvailabilityStatus;
    audienceAvailabilityStatus: DataAvailabilityStatus;
    commentKeywordsAvailabilityStatus: DataAvailabilityStatus;
    commentsAvailabilityStatus: DataAvailabilityStatus;
    rawPayload: JsonObject;
  };
  traffic: {
    dataAvailabilityStatus: DataAvailabilityStatus;
    completionRate: number | null;
    averagePlayDurationSeconds: number | null;
    twoSecBounceRate: number | null;
    fiveSecCompletionRate: number | null;
    averagePlayRatio: number | null;
    coverClickRate: number | null;
    swipeAwayRate: number | null;
    pageEntryRate: number | null;
    commentEntryRate: number | null;
    textExpandRate: number | null;
    textCompletionRate: number | null;
    averageImagesViewed: number | null;
    likeRate: number | null;
    commentRate: number | null;
    shareRate: number | null;
    favoriteRate: number | null;
    notInterestedRate: number | null;
    rawPayload: JsonObject;
  };
  trafficSources: WorkBuddyTrafficSource[];
  audience: { dataAvailabilityStatus: DataAvailabilityStatus; records: WorkBuddyAudienceRecord[]; rawPayload: JsonObject };
  commentKeywords: { dataAvailabilityStatus: DataAvailabilityStatus; records: WorkBuddyCommentKeyword[]; rawPayload: JsonObject };
  comments: WorkBuddyComment[];
};

export type WorkBuddyPostsV2Payload = {
  schemaVersion: "2.0";
  platform: "douyin";
  source: "WorkBuddy";
  sourceFile: string;
  accountName: string;
  accountPlatformId: string;
  collectionTime: string;
  snapshotTime: string;
  collectionPeriod: { start: string | null; end: string | null; note: string | null };
  batchKey: string;
  schemaFieldCount: number;
  scalarValueCount: number;
  unavailableValueCount: number;
  posts: WorkBuddyPostV2[];
  qualityWarnings: string[];
  rawSummary: JsonObject;
};

export type WorkBuddyPostsV2Summary = {
  schemaFieldCount: number;
  scalarValueCount: number;
  posts: number;
  existingPosts: number;
  newPosts: number;
  snapshots: number;
  trafficRows: number;
  trafficAvailable: number;
  trafficSources: number;
  paidTrafficPosts: number;
  audienceRecords: number;
  commentKeywords: number;
  overviewCommentCount: number;
  actualLoadedCount: number;
  commentRows: number;
  commentCountMismatch: number;
  unavailableValues: number;
  olderThan14Days: number;
  duplicatePostIds: number;
};

export type WorkBuddyPostsV2ValidationError = { rowNumber: number; field: string; message: string };

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function object(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function isUnavailable(value: unknown) {
  const raw = text(value).toLowerCase();
  return value === null || value === undefined || raw === "" || raw.startsWith("unavailable") || raw.includes("页面未显示（老作品不可用）");
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isUnavailable(value)) return null;
  const raw = text(value).replaceAll(",", "");
  const match = raw.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  let result = Number(match[0]);
  if (!Number.isFinite(result)) return null;
  if (/万/.test(raw)) result *= 10_000;
  if (/亿/.test(raw)) result *= 100_000_000;
  return result;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed === null || parsed < 0 ? null : Math.round(parsed);
}

function percentage(value: unknown) {
  const parsed = numeric(value);
  return parsed === null ? null : parsed;
}

function durationSeconds(value: unknown) {
  if (isUnavailable(value)) return null;
  if (typeof value === "number") return value >= 0 ? value : null;
  const raw = text(value);
  const units = raw.match(/([\d.]+)\s*秒/);
  if (units) return Number(units[1]);
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function exactChinaDateTime(value: unknown) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw)) return `${raw.replace(" ", "T")}${raw.length === 16 ? ":00" : ""}+08:00`;
  return null;
}

function dateOnly(value: unknown) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function ageInDays(publishTime: string, snapshotTime: string) {
  const publish = Date.parse(publishTime);
  const snapshot = Date.parse(snapshotTime);
  if (!Number.isFinite(publish) || !Number.isFinite(snapshot)) return 0;
  return Math.max(0, Math.floor((snapshot - publish) / 86_400_000));
}

function availability(hasValues: boolean, complete: boolean, postAgeDays: number): DataAvailabilityStatus {
  if (complete) return "available";
  if (hasValues) return "partial";
  return postAgeDays > 14 ? "expired" : "unavailable";
}

function canonicalPaths(value: unknown) {
  const paths = new Set<string>();
  let scalarCount = 0;
  const visit = (current: unknown, prefix: string) => {
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, prefix ? `${prefix}.[]` : "[]"));
      return;
    }
    if (isObject(current)) {
      for (const [key, item] of Object.entries(current)) visit(item, prefix ? `${prefix}.${key}` : key);
      return;
    }
    scalarCount += 1;
    paths.add(prefix);
  };
  visit(value, "");
  return { fieldCount: paths.size, scalarCount };
}

function countUnavailable(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countUnavailable(item), 0);
  if (isObject(value)) return Object.values(value).reduce<number>((total, item) => total + countUnavailable(item), 0);
  return typeof value === "string" && value.trim().toLowerCase().startsWith("unavailable") ? 1 : 0;
}

function smallHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function contentType(postType: string): WorkBuddyPostV2["contentType"] {
  if (postType.includes("图文") && postType.includes("视频")) return "mixed";
  if (postType.includes("图文")) return "image_text";
  if (postType.includes("视频")) return "video";
  return "other";
}

function commentType(row: JsonObject): WorkBuddyComment["commentType"] {
  const image = row.is_image_comment === true;
  const emoji = row.is_emoji_comment === true;
  if (image && emoji) return "mixed";
  if (image) return "image";
  if (emoji) return "emoji";
  return isUnavailable(row.comment_text) ? "other" : "text";
}

function normalizeComments(postId: string, value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Map<string, number>();
  return rows.map((item) => {
    const row = object(item);
    const rawText = text(row.comment_text);
    const rawTime = text(row.comment_time);
    const type = commentType(row);
    const base = `${postId}|${text(row.username)}|${rawTime}|${isUnavailable(row.comment_text) ? type : rawText}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const rawCommentId = text(row.comment_id);
    const sourceCommentId = isUnavailable(rawCommentId) ? null : rawCommentId;
    return {
      sourceCommentId,
      commentFingerprint: sourceCommentId ? `douyin:${sourceCommentId}` : `workbuddy:${smallHash(base)}:${occurrence}`,
      username: text(row.username),
      commentText: isUnavailable(row.comment_text) ? null : rawText,
      commentType: type,
      commentTime: exactChinaDateTime(row.comment_time),
      commentTimeRaw: rawTime,
      likeCount: nonNegativeInteger(row.like_count) ?? 0,
      replyCount: nonNegativeInteger(row.reply_count) ?? 0,
      isAuthor: row.is_author === true,
      authorReplied: null,
      rawPayload: row,
    } satisfies WorkBuddyComment;
  });
}

function normalizeTrafficSources(value: unknown) {
  const row = object(value);
  const sources = Array.isArray(row.sources) ? row.sources : [];
  const normalized: WorkBuddyTrafficSource[] = sources.map((item) => {
    const source = object(item);
    const sourceName = text(source.source);
    return {
      sourceType: "platform_page",
      sourceName,
      trafficValue: null,
      percentage: percentage(source.share),
      changePercentage: percentage(source.change),
      trafficNature: sourceName === "其他" ? "other" as const : "organic" as const,
      rawValue: source,
    };
  }).filter((item) => item.sourceName);
  const extra = text(row.extra_traffic);
  if (!isUnavailable(extra) && /DOU\s*\+/i.test(extra)) {
    normalized.push({
      sourceType: "extra_traffic",
      sourceName: "DOU+投放",
      trafficValue: nonNegativeInteger(extra),
      percentage: null,
      changePercentage: null,
      trafficNature: "paid",
      rawValue: row.extra_traffic,
    });
  }
  return normalized;
}

function normalizeAudience(value: unknown) {
  const row = object(value);
  const records: WorkBuddyAudienceRecord[] = [];
  const gender = object(row.gender_distribution);
  for (const [key, rawValue] of Object.entries(gender)) {
    const name = key === "male" ? "男性" : key === "female" ? "女性" : key;
    const rate = percentage(rawValue);
    if (rate !== null) records.push({ dimensionType: "gender", dimensionName: name, dimensionValue: rate, percentage: rate, ranking: null, rawValue });
  }
  if (Array.isArray(row.age_distribution)) {
    row.age_distribution.forEach((item, index) => {
      const age = object(item);
      const name = text(age.age ?? age.label ?? age.name);
      const rate = percentage(age.share ?? age.percentage ?? age.value);
      if (name && rate !== null) records.push({ dimensionType: "age", dimensionName: name, dimensionValue: rate, percentage: rate, ranking: index + 1, rawValue: age });
    });
  }
  if (Array.isArray(row.region_distribution)) {
    row.region_distribution.forEach((item, index) => {
      const region = object(item);
      const name = text(region.region);
      const rate = percentage(region.share);
      if (name && rate !== null) records.push({ dimensionType: "region", dimensionName: name, dimensionValue: rate, percentage: rate, ranking: index + 1, rawValue: region });
    });
  }
  if (Array.isArray(row.interest_distribution)) {
    row.interest_distribution.forEach((item, index) => {
      const interest = object(item);
      const name = text(interest.interest);
      const rate = percentage(interest.share);
      if (name && rate !== null) records.push({ dimensionType: "interest", dimensionName: name, dimensionValue: rate, percentage: rate, ranking: index + 1, rawValue: interest });
    });
  }
  if (Array.isArray(row.device_distribution)) {
    row.device_distribution.forEach((item, index) => {
      const device = object(item);
      const name = text(device.device ?? device.name);
      const rate = percentage(device.share ?? device.percentage);
      if (name && rate !== null) records.push({ dimensionType: "device", dimensionName: name, dimensionValue: rate, percentage: rate, ranking: index + 1, rawValue: device });
    });
  }
  if (Array.isArray(row.audience_focus_keywords)) {
    row.audience_focus_keywords.forEach((item, index) => {
      const keyword = object(item);
      const name = text(keyword.keyword);
      if (name) records.push({ dimensionType: "other", dimensionName: `观众关注热词：${name}`, dimensionValue: numeric(keyword.heat), percentage: null, ranking: index + 1, rawValue: keyword });
    });
  }
  return records;
}

function normalizeCommentKeywords(value: unknown) {
  const row = object(value);
  const keywords = Array.isArray(row.keywords) ? row.keywords : [];
  return keywords.map((item, index) => {
    const keyword = object(item);
    return {
      keyword: text(keyword.keyword),
      rank: nonNegativeInteger(keyword.rank) ?? index + 1,
      count: nonNegativeInteger(keyword.count ?? row.occurrence_count),
      sentiment: isUnavailable(keyword.sentiment ?? row.sentiment) ? null : text(keyword.sentiment ?? row.sentiment),
      category: isUnavailable(keyword.category ?? row.category) ? null : text(keyword.category ?? row.category),
      rawValue: keyword,
    } satisfies WorkBuddyCommentKeyword;
  }).filter((item) => item.keyword);
}

function normalizePost(item: unknown, snapshotTime: string, collectionTime: string): WorkBuddyPostV2 {
  const row = object(item);
  const platformPostId = text(row.post_id);
  const publishTime = exactChinaDateTime(row.publish_time_iso) ?? exactChinaDateTime(row.publish_time) ?? text(row.publish_time);
  const postAgeDays = ageInDays(publishTime, snapshotTime);
  const basic = object(row.basic_metrics);
  const trafficAnalysis = object(row.traffic_analysis);
  const contentAppeal = object(trafficAnalysis.content_appeal);
  const engagement = object(trafficAnalysis.audience_engagement);
  const trafficSources = normalizeTrafficSources(trafficAnalysis.traffic_sources);
  const audienceRaw = object(row.audience_analysis);
  const audienceRecords = normalizeAudience(audienceRaw);
  const keywordRaw = object(row.comment_keywords);
  const keywordRecords = normalizeCommentKeywords(keywordRaw);
  const commentsRaw = object(row.comments);
  const comments = normalizeComments(platformPostId, commentsRaw.list);
  const trafficNumericValues = [
    contentAppeal.completion_rate, contentAppeal.avg_play_duration, contentAppeal.two_sec_bounce_rate,
    contentAppeal.five_sec_completion_rate, contentAppeal.cover_click_rate, contentAppeal.swipe_away_rate,
    contentAppeal.page_entry_rate, contentAppeal.comment_entry_rate, contentAppeal.text_expand_rate,
    contentAppeal.text_completion_rate, contentAppeal.avg_images_viewed,
  ].map(numeric).filter((value) => value !== null);
  const trafficStatus = availability(trafficNumericValues.length > 0 || trafficSources.length > 0, trafficNumericValues.length >= 3 && trafficSources.length > 0, postAgeDays);
  const trafficSourcesStatus = availability(trafficSources.length > 0, trafficSources.length > 0, postAgeDays);
  const audienceTypes = new Set(audienceRecords.map((record) => record.dimensionType));
  const audienceStatus = availability(audienceRecords.length > 0, ["gender", "age", "region", "interest"].every((type) => audienceTypes.has(type as WorkBuddyAudienceRecord["dimensionType"])), postAgeDays);
  const keywordStatus = availability(keywordRecords.length > 0, keywordRecords.length > 0, postAgeDays);
  const actualLoadedCount = nonNegativeInteger(commentsRaw.actual_loaded_count);
  const commentsStatus = actualLoadedCount !== null ? "available" : availability(comments.length > 0, false, postAgeDays);
  const favoriteCount = nonNegativeInteger(basic.favorite_count);
  const overallStatus: DataAvailabilityStatus = [trafficStatus, audienceStatus, keywordStatus].includes("expired")
    ? ([trafficStatus, audienceStatus, keywordStatus].some((status) => status === "available" || status === "partial") ? "partial" : "expired")
    : [trafficStatus, audienceStatus, keywordStatus].every((status) => status === "available") ? "available" : "partial";
  const metadata = object(row.content_metadata);
  const rawPostType = text(row.post_type);

  return {
    platformPostId,
    title: text(row.title),
    publishTime,
    postUrl: text(row.post_url),
    postType: rawPostType,
    contentType: contentType(rawPostType),
    durationSeconds: durationSeconds(row.video_duration),
    postStatus: text(row.post_status) || null,
    isPinned: row.is_pinned === true,
    contentMetadata: { ...metadata, image_count: row.image_count ?? null, original_video_duration: row.video_duration ?? null },
    postAgeDays,
    snapshot: {
      snapshotTime,
      collectionTime,
      playCount: nonNegativeInteger(basic.play_count),
      likeCount: nonNegativeInteger(basic.like_count),
      commentOverviewCount: nonNegativeInteger(basic.comment_count ?? commentsRaw.total_count_displayed_in_overview),
      actualLoadedCount,
      commentRowsCount: comments.length,
      favoriteCount,
      shareCount: nonNegativeInteger(basic.share_count),
      danmakuCount: nonNegativeInteger(basic.danmaku_count),
      followerGain: nonNegativeInteger(basic.follower_gain),
      followerLoss: nonNegativeInteger(basic.follower_loss),
      followerPlayRatio: percentage(basic.follower_play_ratio),
      pageEntryRate: percentage(basic.page_entry_rate),
      dataAvailabilityStatus: overallStatus,
      trafficAvailabilityStatus: trafficStatus,
      trafficSourcesAvailabilityStatus: trafficSourcesStatus,
      audienceAvailabilityStatus: audienceStatus,
      commentKeywordsAvailabilityStatus: keywordStatus,
      commentsAvailabilityStatus: commentsStatus,
      rawPayload: row,
    },
    traffic: {
      dataAvailabilityStatus: trafficStatus,
      completionRate: percentage(contentAppeal.completion_rate ?? basic.completion_rate),
      averagePlayDurationSeconds: durationSeconds(contentAppeal.avg_play_duration),
      twoSecBounceRate: percentage(contentAppeal.two_sec_bounce_rate ?? basic.two_sec_bounce_rate),
      fiveSecCompletionRate: percentage(contentAppeal.five_sec_completion_rate),
      averagePlayRatio: percentage(contentAppeal.avg_play_ratio),
      coverClickRate: percentage(contentAppeal.cover_click_rate),
      swipeAwayRate: percentage(contentAppeal.swipe_away_rate ?? basic.swipe_away_rate),
      pageEntryRate: percentage(contentAppeal.page_entry_rate ?? basic.page_entry_rate),
      commentEntryRate: percentage(contentAppeal.comment_entry_rate),
      textExpandRate: percentage(contentAppeal.text_expand_rate ?? basic.text_expand_rate),
      textCompletionRate: percentage(contentAppeal.text_completion_rate),
      averageImagesViewed: numeric(contentAppeal.avg_images_viewed ?? basic.avg_images_viewed),
      likeRate: percentage(engagement.like_rate),
      commentRate: percentage(engagement.comment_rate),
      shareRate: percentage(engagement.share_rate),
      favoriteRate: percentage(engagement.favorite_rate),
      notInterestedRate: percentage(engagement.not_interested_rate),
      rawPayload: trafficAnalysis,
    },
    trafficSources,
    audience: { dataAvailabilityStatus: audienceStatus, records: audienceRecords, rawPayload: audienceRaw },
    commentKeywords: { dataAvailabilityStatus: keywordStatus, records: keywordRecords, rawPayload: keywordRaw },
    comments,
  };
}

export function normalizeWorkBuddyPostsV2(value: unknown, sourceFile = "douyin_posts_unknown.json"): WorkBuddyPostsV2Payload | null {
  if (!isObject(value) || !isObject(value.collection_info) || !Array.isArray(value.posts) || !isObject(value.summary)) return null;
  const info = value.collection_info;
  const snapshotTime = exactChinaDateTime(info.snapshot_time) ?? exactChinaDateTime(info.collection_time);
  const collectionTime = exactChinaDateTime(info.collection_time) ?? snapshotTime;
  if (!snapshotTime || !collectionTime) return null;
  const pathSummary = canonicalPaths(value);
  const normalizedPosts = value.posts.map((post) => normalizePost(post, snapshotTime, collectionTime));
  const qualityWarnings: string[] = [];
  const declaredComments = normalizedPosts.reduce((total, post) => total + (post.snapshot.actualLoadedCount ?? 0), 0);
  const commentRows = normalizedPosts.reduce((total, post) => total + post.comments.length, 0);
  if (declaredComments !== commentRows) qualityWarnings.push(`源文件声明实际读取评论 ${declaredComments} 条，但评论明细数组为 ${commentRows} 条；仅落库真实明细，不补造缺失评论。`);
  const summaryComments = nonNegativeInteger(value.summary.comments_total_collected);
  if (summaryComments !== null && summaryComments !== declaredComments) qualityWarnings.push(`summary.comments_total_collected=${summaryComments}，与作品级 actual_loaded_count 合计 ${declaredComments} 不一致。`);
  const ids = normalizedPosts.map((post) => post.platformPostId).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) qualityWarnings.push(`源文件包含 ${new Set(duplicateIds).size} 个重复 post_id。`);

  return {
    schemaVersion: "2.0",
    platform: "douyin",
    source: "WorkBuddy",
    sourceFile: sourceFile.split(/[\\/]/).at(-1) || "douyin_posts_unknown.json",
    accountName: text(info.account_name),
    accountPlatformId: text(info.douyin_id),
    collectionTime,
    snapshotTime,
    collectionPeriod: {
      start: dateOnly(object(info.data_period).start_date),
      end: dateOnly(object(info.data_period).end_date),
      note: text(object(info.data_period).note) || null,
    },
    batchKey: `workbuddy:douyin-posts:${snapshotTime}`,
    schemaFieldCount: pathSummary.fieldCount,
    scalarValueCount: pathSummary.scalarCount,
    unavailableValueCount: countUnavailable(value),
    posts: normalizedPosts,
    qualityWarnings,
    rawSummary: value.summary,
  };
}

export function validateWorkBuddyPostsV2(payload: WorkBuddyPostsV2Payload) {
  const errors: WorkBuddyPostsV2ValidationError[] = [];
  if (payload.platform !== "douyin") errors.push({ rowNumber: 0, field: "platform", message: "作品 V2.0 当前仅支持抖音" });
  if (!payload.accountName) errors.push({ rowNumber: 0, field: "account_name", message: "账号名称不能为空" });
  if (!payload.accountPlatformId) errors.push({ rowNumber: 0, field: "douyin_id", message: "抖音账号 ID 不能为空" });
  if (!Date.parse(payload.snapshotTime)) errors.push({ rowNumber: 0, field: "snapshot_time", message: "快照时间无效" });
  if (!payload.posts.length) errors.push({ rowNumber: 0, field: "posts", message: "作品数组不能为空" });
  const ids = new Set<string>();
  payload.posts.forEach((post, index) => {
    const rowNumber = index + 1;
    if (!post.platformPostId) errors.push({ rowNumber, field: "post_id", message: "作品 post_id 不能为空" });
    if (ids.has(post.platformPostId)) errors.push({ rowNumber, field: "post_id", message: "同一文件内 post_id 重复" });
    ids.add(post.platformPostId);
    if (!post.title) errors.push({ rowNumber, field: "title", message: "作品标题不能为空" });
    if (!Date.parse(post.publishTime)) errors.push({ rowNumber, field: "publish_time", message: "发布时间无效" });
    if (!/^https:\/\/creator\.douyin\.com\//.test(post.postUrl)) errors.push({ rowNumber, field: "post_url", message: "作品链接必须来自抖音创作者中心" });
    for (const [field, metric] of Object.entries({ play_count: post.snapshot.playCount, like_count: post.snapshot.likeCount, comment_count: post.snapshot.commentOverviewCount, share_count: post.snapshot.shareCount })) {
      if (metric !== null && (!Number.isInteger(metric) || metric < 0)) errors.push({ rowNumber, field, message: `${field} 必须是非负整数或 unavailable` });
    }
    post.comments.forEach((comment) => {
      if (!comment.username) errors.push({ rowNumber, field: "comments.username", message: "评论用户名不能为空" });
      if (!comment.commentTimeRaw) errors.push({ rowNumber, field: "comments.comment_time", message: "评论原始时间不能为空" });
    });
  });
  return errors;
}

export function summarizeWorkBuddyPostsV2(payload: WorkBuddyPostsV2Payload, existingPosts = 0): WorkBuddyPostsV2Summary {
  const ids = payload.posts.map((post) => post.platformPostId);
  return {
    schemaFieldCount: payload.schemaFieldCount,
    scalarValueCount: payload.scalarValueCount,
    posts: payload.posts.length,
    existingPosts,
    newPosts: payload.posts.length - existingPosts,
    snapshots: payload.posts.length,
    trafficRows: payload.posts.length,
    trafficAvailable: payload.posts.filter((post) => post.traffic.dataAvailabilityStatus === "available" || post.traffic.dataAvailabilityStatus === "partial").length,
    trafficSources: payload.posts.reduce((total, post) => total + post.trafficSources.length, 0),
    paidTrafficPosts: payload.posts.filter((post) => post.trafficSources.some((source) => source.trafficNature === "paid")).length,
    audienceRecords: payload.posts.reduce((total, post) => total + post.audience.records.length, 0),
    commentKeywords: payload.posts.reduce((total, post) => total + post.commentKeywords.records.length, 0),
    overviewCommentCount: payload.posts.reduce((total, post) => total + (post.snapshot.commentOverviewCount ?? 0), 0),
    actualLoadedCount: payload.posts.reduce((total, post) => total + (post.snapshot.actualLoadedCount ?? 0), 0),
    commentRows: payload.posts.reduce((total, post) => total + post.comments.length, 0),
    commentCountMismatch: payload.posts.reduce((total, post) => total + Math.abs((post.snapshot.actualLoadedCount ?? post.comments.length) - post.comments.length), 0),
    unavailableValues: payload.unavailableValueCount,
    olderThan14Days: payload.posts.filter((post) => post.postAgeDays > 14).length,
    duplicatePostIds: ids.length - new Set(ids).size,
  };
}
