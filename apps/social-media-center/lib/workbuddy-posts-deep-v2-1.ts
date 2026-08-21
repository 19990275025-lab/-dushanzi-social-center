export type DeepAvailability = "available" | "partial" | "unavailable" | "failed";
export type DeepRecordStatus = "normal" | "private" | "partial" | "unavailable" | "failed";

type JsonObject = Record<string, unknown>;

export type DeepSeriesPoint = {
  metricType: string;
  seriesName: string;
  pointIndex: number;
  pointTime: string | null;
  pointLabel: string | null;
  metricValue: number;
  unit: string | null;
  sourcePath: string;
  rawValue: unknown;
};

export type DeepAudienceRecord = {
  dimensionType: "gender" | "age" | "region" | "interest" | "device" | "activity" | "attention_keyword" | "other";
  dimensionName: string;
  dimensionValue: number | null;
  percentage: number | null;
  ranking: number | null;
  rawValue: unknown;
};

export type DeepTrafficSource = {
  sourceType: string;
  sourceName: string;
  trafficValue: number | null;
  percentage: number | null;
  changePercentage: number | null;
  trafficNature: "organic" | "other";
  rawValue: unknown;
};

export type DeepComment = {
  sourceCommentId: string | null;
  fingerprint: string;
  username: string;
  commentText: string | null;
  commentType: "text" | "image" | "emoji" | "mixed" | "other";
  commentTime: string | null;
  commentTimeRaw: string;
  likes: number | null;
  likesAvailabilityStatus: DeepAvailability;
  likesRawValue: unknown;
  replyCount: number;
  isAuthor: boolean;
  authorReplied: boolean | null;
  rawPayload: JsonObject;
  replies: Array<{
    sourceReplyId: string | null;
    fingerprint: string;
    username: string;
    replyText: string | null;
    replyType: "text" | "image" | "emoji" | "mixed" | "other";
    replyTime: string | null;
    replyTimeRaw: string;
    likes: number | null;
    isAuthor: boolean | null;
    rawPayload: JsonObject;
  }>;
};

export type DeepPost = {
  sourceIdentity: string;
  platformPostId: string | null;
  title: string;
  publishTime: string;
  postUrl: string | null;
  postType: string;
  contentType: "video" | "image_text" | "mixed" | "other";
  durationSeconds: number | null;
  postStatus: string;
  sourceRecordStatus: DeepRecordStatus;
  sourceFailureReason: string | null;
  postAgeDays: number;
  contentMetadata: JsonObject;
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
    dataAvailabilityStatus: "available" | "partial" | "unavailable";
    trafficAvailabilityStatus: "available" | "partial" | "unavailable";
    trafficSourcesAvailabilityStatus: "available" | "partial" | "unavailable";
    audienceAvailabilityStatus: "available" | "partial" | "unavailable";
    commentKeywordsAvailabilityStatus: "available" | "partial" | "unavailable";
    commentsAvailabilityStatus: "available" | "partial" | "unavailable";
    rawPayload: JsonObject;
  };
  metricSeries: DeepSeriesPoint[];
  traffic: {
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
    dataAvailabilityStatus: "available" | "partial" | "unavailable";
    rawPayload: JsonObject;
  };
  trafficSources: DeepTrafficSource[];
  paidTraffic: null | {
    campaignType: string;
    playCount: number | null;
    relationshipToOverview: "unknown" | "included" | "additional";
    detailAvailable: boolean | null;
    dataAvailabilityStatus: DeepAvailability;
    rawPayload: JsonObject;
  };
  audience: { dataAvailabilityStatus: DeepAvailability; records: DeepAudienceRecord[]; rawPayload: JsonObject };
  commentKeywords: { dataAvailabilityStatus: DeepAvailability; records: Array<{ keyword: string; rank: number; rawValue: unknown }>; rawPayload: JsonObject };
  comments: DeepComment[];
};

export type WorkBuddyDeepPayload = {
  schemaVersion: "2.1" | "2.2";
  platform: "douyin";
  source: "WorkBuddy";
  sourceFile: string;
  sourcePath: string;
  checksum: string;
  fileSize: number;
  accountName: string;
  collectionDate: string | null;
  collectionTime: string;
  collectionBatch: string | null;
  collectionPeriod: { start: string | null; end: string | null; raw: string | null };
  schemaFieldCount: number;
  scalarValueCount: number;
  unavailableValueCount: number;
  failedValueCount: number;
  completenessScore: number;
  posts: DeepPost[];
  qualityWarnings: string[];
  rawCollectionInfo: JsonObject;
  rawSummary: JsonObject;
};

export type DeepValidationError = { field: string; message: string; rowNumber?: number };

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const object = (value: unknown): JsonObject => isObject(value) ? value : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();

function unavailable(value: unknown) {
  const raw = text(value).toLowerCase();
  return value === null || value === undefined || raw === "" || raw === "-" || raw.startsWith("unavailable") || raw.startsWith("failed") || raw === "暂无数据";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (unavailable(value)) return null;
  const raw = text(value).replaceAll(",", "");
  if (/精确值\s*unavailable/i.test(raw)) return null;
  const match = raw.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  let result = Number(match[0]);
  if (/万/.test(raw)) result *= 10_000;
  if (/亿/.test(raw)) result *= 100_000_000;
  return Number.isFinite(result) ? result : null;
}

const integer = (value: unknown) => {
  const parsed = numberValue(value);
  return parsed === null || parsed < 0 ? null : Math.round(parsed);
};
const percent = (value: unknown) => numberValue(value);

function chinaDateTime(value: unknown) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(raw)) return `${raw.replace(" ", "T")}${raw.length === 16 ? ":00" : ""}+08:00`;
  return null;
}

function duration(value: unknown) {
  const raw = text(value).replace(/^.*?(?=\d)/, "");
  const parts = raw.split(":").map(Number);
  if (parts.some((item) => !Number.isFinite(item))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function smallHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalProfile(value: unknown) {
  const paths = new Set<string>();
  let scalarValues = 0;
  let unavailableValues = 0;
  let failedValues = 0;
  const visit = (current: unknown, path: string) => {
    if (Array.isArray(current)) return current.forEach((item) => visit(item, `${path}.[]`));
    if (isObject(current)) return Object.entries(current).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key));
    scalarValues += 1;
    paths.add(path);
    if (typeof current === "string" && current.trim().toLowerCase().startsWith("unavailable")) unavailableValues += 1;
    if (typeof current === "string" && current.trim().toLowerCase().startsWith("failed")) failedValues += 1;
  };
  visit(value, "");
  return { schemaFieldCount: paths.size, scalarValueCount: scalarValues, unavailableValueCount: unavailableValues, failedValueCount: failedValues };
}

function checklistStatus(row: JsonObject, key: string): DeepAvailability {
  const value = text(object(object(row.checklist)[key]).status).toLowerCase();
  if (value === "completed" || value === "available") return "available";
  if (value === "partial") return "partial";
  if (value === "failed") return "failed";
  return "unavailable";
}

const databaseAvailability = (status: DeepAvailability): "available" | "partial" | "unavailable" =>
  status === "available" ? "available" : status === "partial" ? "partial" : "unavailable";

function addSeries(target: DeepSeriesPoint[], metricType: string, seriesName: string, values: unknown[], times: unknown[] | null, labels: unknown[] | null, sourcePath: string, unit: string | null) {
  values.forEach((rawValue, pointIndex) => {
    const metricValue = numberValue(rawValue);
    if (metricValue === null) return;
    const rawTime = times?.[pointIndex];
    const pointTime = typeof rawTime === "number" ? new Date(rawTime).toISOString() : chinaDateTime(rawTime);
    target.push({ metricType, seriesName, pointIndex, pointTime, pointLabel: text(labels?.[pointIndex]) || null, metricValue, unit, sourcePath, rawValue });
  });
}

function hourlyTimeAxis(value: unknown, count: number) {
  if (!count) return null;
  const match = text(value).match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*~\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
  if (!match) return null;
  const start = Date.parse(`${match[1].replace(" ", "T")}:00+08:00`);
  const end = Date.parse(`${match[2].replace(" ", "T")}:00+08:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start !== (count - 1) * 3_600_000) return null;
  return Array.from({ length: count }, (_, index) => new Date(start + index * 3_600_000).toISOString());
}

function normalizeSeries(row: JsonObject) {
  const records: DeepSeriesPoint[] = [];
  const overview = object(row.overview);
  const chart = object(overview.traffic_chart);
  const hourlyTimes = hourlyTimeAxis(chart.time_range, Array.isArray(chart.hourly_new) ? chart.hourly_new.length : 0);
  if (Array.isArray(chart.hourly_new)) addSeries(records, "play", "hourly_new", chart.hourly_new, hourlyTimes, null, "overview.traffic_chart.hourly_new", "count");
  if (Array.isArray(chart.hourly_cumulative)) addSeries(records, "play", "hourly_cumulative", chart.hourly_cumulative, hourlyTimeAxis(chart.time_range, chart.hourly_cumulative.length), null, "overview.traffic_chart.hourly_cumulative", "count");
  if (Array.isArray(chart.daily_new)) addSeries(records, "play", "daily_new", chart.daily_new, null, null, "overview.traffic_chart.daily_new", "count");
  const fanChart = object(overview.fan_chart);
  if (Array.isArray(fanChart.hourly_new)) addSeries(records, "follower_gain", "hourly_new", fanChart.hourly_new, hourlyTimeAxis(fanChart.time_range, fanChart.hourly_new.length), null, "overview.fan_chart.hourly_new", "count");
  if (Array.isArray(fanChart.hourly_cumulative)) addSeries(records, "follower_gain", "hourly_cumulative", fanChart.hourly_cumulative, hourlyTimeAxis(fanChart.time_range, fanChart.hourly_cumulative.length), null, "overview.fan_chart.hourly_cumulative", "count");
  if (Array.isArray(fanChart.hourly)) addSeries(records, "follower_gain", "hourly_new", fanChart.hourly, hourlyTimeAxis(fanChart.time_range, fanChart.hourly.length), null, "overview.fan_chart.hourly", "count");

  if (Array.isArray(chart.data)) {
    addSeries(records, "play", "hourly_new", chart.data.map((item) => object(item).value), chart.data.map((item) => object(item).time), null, "overview.traffic_chart.data", "count");
  }
  const rawCharts = Array.isArray(chart.charts_raw) ? chart.charts_raw : Object.entries(object(chart.charts_raw)).map(([name, value]) => ({ name, value }));
  rawCharts.forEach((entry, chartIndex) => {
    const chartName = isObject(entry) && "value" in entry ? text(entry.name) : `chart_${chartIndex}`;
    const rawChart = object(isObject(entry) && "value" in entry ? entry.value : entry);
    if (Array.isArray(chart.data) && (chartName === "chart_0" || chartIndex === 0)) return;
    const axis = Array.isArray(rawChart.xAxis) ? rawChart.xAxis : Array.isArray(object(rawChart.xAxis).data) ? object(rawChart.xAxis).data as unknown[] : [];
    const series = Array.isArray(rawChart.series) ? rawChart.series : [];
    series.forEach((item, seriesIndex) => {
      const seriesRow = object(item);
      const metricType = chartIndex === 0 && chartName !== "chart_1" ? "play" : "follower_gain";
      const name = text(seriesRow.name) || (metricType === "play" ? "hourly_new" : "hourly_new");
      if (Array.isArray(seriesRow.data)) addSeries(records, metricType, name, seriesRow.data, axis, null, `overview.traffic_chart.charts_raw.${chartName || chartIndex}.series.${seriesIndex}`, "count");
    });
  });

  const fanGrowth = object(object(row.audience_analysis).fan_growth_trend);
  if (Array.isArray(fanGrowth.points)) {
    addSeries(records, "follower_gain", "daily_new", fanGrowth.points.map((item) => object(item)["涨粉量"]), fanGrowth.points.map((item) => object(item).time), null, "audience_analysis.fan_growth_trend.points", "count");
  }
  const watchTrend = object(object(row.traffic_analysis).watch_trend);
  for (const [kind, value] of Object.entries(watchTrend)) {
    const group = object(value);
    for (const [name, series] of Object.entries(group)) {
      if (Array.isArray(series)) addSeries(records, kind === "留存分析" ? "retention" : "bounce", name === "当前作品" ? "current" : "benchmark", series, null, series.map((_, index) => String(index)), `traffic_analysis.watch_trend.${kind}.${name}`, "ratio");
    }
  }
  return records;
}

function addAudienceDistribution(records: DeepAudienceRecord[], type: DeepAudienceRecord["dimensionType"], value: unknown, nameKeys: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const row = object(item);
      const name = nameKeys.map((key) => text(row[key])).find(Boolean) || "";
      const rawValue = row["占比"] ?? row.percentage ?? row.value ?? row["热度"];
      if (name && numberValue(rawValue) !== null) records.push({ dimensionType: type, dimensionName: name, dimensionValue: numberValue(rawValue), percentage: text(rawValue).includes("%") ? percent(rawValue) : null, ranking: index + 1, rawValue: row });
    });
  } else if (isObject(value)) {
    Object.entries(value).forEach(([name, rawValue], index) => {
      if (numberValue(rawValue) !== null) records.push({ dimensionType: type, dimensionName: name, dimensionValue: numberValue(rawValue), percentage: text(rawValue).includes("%") ? percent(rawValue) : null, ranking: index + 1, rawValue });
    });
  }
}

function normalizeAudience(value: unknown) {
  const raw = object(value);
  const records: DeepAudienceRecord[] = [];
  addAudienceDistribution(records, "gender", raw.gender_distribution, ["性别", "label", "name"]);
  addAudienceDistribution(records, "age", raw.age_distribution, ["年龄", "label", "name"]);
  addAudienceDistribution(records, "region", raw.region_distribution ?? raw.region_distribution_top10, ["地区", "地域", "region", "name"]);
  addAudienceDistribution(records, "interest", raw.interest_distribution, ["兴趣", "interest", "name"]);
  addAudienceDistribution(records, "device", raw.device_distribution, ["设备", "device", "name"]);
  addAudienceDistribution(records, "activity", raw.activity_distribution, ["活跃度", "activity", "name"]);
  addAudienceDistribution(records, "attention_keyword", raw.attention_hot_keywords ?? raw.follow_interest_hotwords, ["关键词", "keyword", "name"]);
  return records;
}

function commentType(value: unknown): DeepComment["commentType"] {
  const raw = text(value);
  const image = /\[图片\]|图片评论/.test(raw);
  const emoji = /\[图片表情\]|\[表情\]/.test(raw);
  const plain = raw.replace(/\[[^\]]+\]/g, "").trim();
  if ((image || emoji) && plain) return "mixed";
  if (image) return "image";
  if (emoji) return "emoji";
  return raw ? "text" : "other";
}

function normalizeComments(postIdentity: string, value: unknown) {
  const raw = object(value);
  const rows = Array.isArray(raw.comments) ? raw.comments : [];
  const occurrence = new Map<string, number>();
  return rows.map((item) => {
    const row = object(item);
    const username = text(row.username);
    const rawTime = text(row.time ?? row.comment_time);
    const rawText = text(row.content ?? row.comment_text);
    const type = commentType(rawText);
    const sourceIdRaw = text(row.comment_id);
    const sourceCommentId = unavailable(sourceIdRaw) ? null : sourceIdRaw;
    const base = `${postIdentity}|${username}|${rawTime}|${rawText || type}`;
    const count = (occurrence.get(base) ?? 0) + 1;
    occurrence.set(base, count);
    const fingerprint = sourceCommentId ? `douyin:${sourceCommentId}` : `workbuddy-deep:${smallHash(base)}:${count}`;
    const likesRaw = row.likes ?? row.like_count;
    const repliesRaw = Array.isArray(row.replies) ? row.replies : Array.isArray(row.reply_list) ? row.reply_list : [];
    return {
      sourceCommentId,
      fingerprint,
      username,
      commentText: rawText || null,
      commentType: type,
      commentTime: chinaDateTime(rawTime),
      commentTimeRaw: rawTime,
      likes: integer(likesRaw),
      likesAvailabilityStatus: unavailable(likesRaw) ? "unavailable" as const : "available" as const,
      likesRawValue: likesRaw,
      replyCount: integer(row.reply_count) ?? repliesRaw.length,
      isAuthor: row.is_author === true,
      authorReplied: row.author_replied === true ? true : row.author_replied === false ? false : null,
      rawPayload: row,
      replies: repliesRaw.map((reply, replyIndex) => {
        const replyRow = object(reply);
        const replyText = text(replyRow.content ?? replyRow.reply_text);
        const replyTimeRaw = text(replyRow.time ?? replyRow.reply_time);
        const sourceReplyRaw = text(replyRow.reply_id);
        const sourceReplyId = unavailable(sourceReplyRaw) ? null : sourceReplyRaw;
        return {
          sourceReplyId,
          fingerprint: sourceReplyId ? `douyin:${sourceReplyId}` : `workbuddy-deep:${smallHash(`${fingerprint}|${replyIndex}|${text(replyRow.username)}|${replyTimeRaw}|${replyText}`)}`,
          username: text(replyRow.username), replyText: replyText || null, replyType: commentType(replyText),
          replyTime: chinaDateTime(replyTimeRaw), replyTimeRaw, likes: integer(replyRow.likes ?? replyRow.like_count),
          isAuthor: replyRow.is_author === true ? true : replyRow.is_author === false ? false : null, rawPayload: replyRow,
        };
      }),
    } satisfies DeepComment;
  });
}

function normalizeTrafficSources(value: unknown) {
  const records: DeepTrafficSource[] = [];
  const push = (name: string, raw: unknown) => {
    const row = object(raw);
    const percentage = percent(isObject(raw) ? row["占比"] ?? row.share ?? row.percentage : raw);
    const trafficValue = numberValue(row["播放量"] ?? row.traffic_value ?? row.value);
    if (!name || (percentage === null && trafficValue === null)) return;
    const changeMatch = text(raw).match(/对比7日\s*([+-]?\d+(?:\.\d+)?)%/);
    records.push({ sourceType: "platform_page", sourceName: name, trafficValue, percentage, changePercentage: changeMatch ? Number(changeMatch[1]) : percent(row["对比7日"] ?? row.change), trafficNature: name === "其他" || /平台扶持/.test(name) ? "other" : "organic", rawValue: raw });
  };
  if (Array.isArray(value)) value.forEach((item) => push(text(object(item)["来源"] ?? object(item).source), item));
  else if (isObject(value)) Object.entries(value).forEach(([name, raw]) => push(name, raw));
  return records;
}

function normalizePost(value: unknown, fileCollectionTime: string): DeepPost {
  const row = object(value);
  const title = text(row.title);
  const publishTime = chinaDateTime(row.publish_time) ?? text(row.publish_time);
  const collectionTime = chinaDateTime(row.collection_time) ?? fileCollectionTime;
  const snapshotTime = collectionTime;
  const rawPostId = text(row.post_id);
  const platformPostId = unavailable(rawPostId) ? null : rawPostId;
  const sourceIdentity = platformPostId ?? `private:${smallHash(`${title}|${publishTime}`)}`;
  const status = text(row.status);
  const checklist = object(row.checklist);
  const checklistValues = Object.values(checklist).map(object);
  const sourceRecordStatus: DeepRecordStatus = /私密/.test(status) ? "private" : checklistValues.some((item) => text(item.status) === "failed") ? "failed" : /正常/.test(status) ? "normal" : checklistValues.some((item) => text(item.status) === "partial") ? "partial" : "unavailable";
  const sourceFailureReason = sourceRecordStatus === "normal" ? null : checklistValues.map((item) => text(item.detail)).filter(Boolean).join("；") || null;
  const basic = object(row.basic_metrics);
  const trafficRaw = object(row.traffic_analysis);
  const appeal = object(trafficRaw.content_attraction ?? trafficRaw["content_attraction_图文"]);
  const engagement = object(trafficRaw.audience_engagement);
  const commentsRaw = object(row.comments);
  const comments = normalizeComments(sourceIdentity, commentsRaw);
  const trafficStatus = checklistStatus(row, "traffic");
  const trafficSourcesStatus = checklistStatus(row, "traffic_source");
  const audienceStatus = checklistStatus(row, "audience");
  const keywordStatus = checklistStatus(row, "comment_keywords");
  const commentsStatus = checklistStatus(row, "comments");
  const overallStatus = sourceRecordStatus === "private" || sourceRecordStatus === "failed" ? "unavailable" : [trafficStatus, audienceStatus, keywordStatus, commentsStatus].some((item) => item !== "available") ? "partial" : "available";
  const postType = text(row.type);
  const contentType = postType.includes("图文") ? "image_text" : postType.includes("视频") ? "video" : "other";
  const publishMillis = Date.parse(publishTime);
  const snapshotMillis = Date.parse(snapshotTime);
  const postAgeDays = Number.isFinite(publishMillis) && Number.isFinite(snapshotMillis) ? Math.max(0, Math.floor((snapshotMillis - publishMillis) / 86_400_000)) : 0;
  const keywordRaw = object(row.comment_keywords);
  const keywordValues = Array.isArray(keywordRaw.keywords) ? keywordRaw.keywords : [];
  const paidRaw = object(row.paid_traffic);
  const paidType = text(paidRaw.type);
  const hasPaid = !/非DOU\s*\+|平台扶持/i.test(paidType) && /DOU\s*\+|付费|投放/i.test(paidType);
  const metadata = object(row.content_metadata);

  return {
    sourceIdentity, platformPostId, title, publishTime, postUrl: text(row.post_url) || null, postType,
    contentType, durationSeconds: duration(metadata.duration ?? postType), postStatus: status,
    sourceRecordStatus, sourceFailureReason, postAgeDays,
    contentMetadata: { ...metadata, raw_category: row.category ?? null, raw_type: row.type ?? null, collection_evidence: row.collection_evidence ?? null, raw_fields: row.raw_fields ?? null },
    snapshot: {
      snapshotTime, collectionTime,
      playCount: integer(basic["播放量"]), likeCount: integer(basic["点赞量"]), commentOverviewCount: integer(commentsRaw.overview_comment_count ?? basic["评论量"]),
      actualLoadedCount: integer(commentsRaw.visible_comment_count ?? commentsRaw.total_visible_comments), commentRowsCount: comments.length,
      favoriteCount: integer(basic["收藏量"]), shareCount: integer(basic["分享量"]), danmakuCount: integer(basic["弹幕量"]),
      followerGain: integer(basic["涨粉量"] ?? basic["吸粉量"]), followerLoss: integer(basic["脱粉量"]), followerPlayRatio: percent(basic["粉丝播放占比"]),
      dataAvailabilityStatus: overallStatus, trafficAvailabilityStatus: databaseAvailability(trafficStatus),
      trafficSourcesAvailabilityStatus: databaseAvailability(trafficSourcesStatus), audienceAvailabilityStatus: databaseAvailability(audienceStatus),
      commentKeywordsAvailabilityStatus: databaseAvailability(keywordStatus), commentsAvailabilityStatus: databaseAvailability(commentsStatus), rawPayload: row,
    },
    metricSeries: normalizeSeries(row),
    traffic: {
      completionRate: percent(appeal["完播率"] ?? basic["完播率"]), averagePlayDurationSeconds: numberValue(appeal["平均播放时长"]),
      twoSecBounceRate: percent(appeal["2s跳出率"] ?? basic["2s跳出率"]), fiveSecCompletionRate: percent(appeal["5s完播率"]),
      averagePlayRatio: percent(appeal["平均播放占比"]), coverClickRate: percent(appeal["封面点击率"]), swipeAwayRate: percent(appeal["划走率"] ?? basic["划走率"]),
      pageEntryRate: percent(appeal["详情页进入率"]), commentEntryRate: percent(appeal["评论进入率"]), textExpandRate: percent(appeal["文案展开率"] ?? basic["文案展开率"]),
      textCompletionRate: percent(appeal["文案完读率"]), averageImagesViewed: numberValue(appeal["平均浏览图片数"] ?? basic["平均浏览图片数"]),
      likeRate: percent(engagement["点赞率"]), commentRate: percent(engagement["评论率"]), shareRate: percent(engagement["分享率"]),
      favoriteRate: percent(engagement["收藏率"]), notInterestedRate: percent(engagement["不感兴趣率"]), dataAvailabilityStatus: databaseAvailability(trafficStatus), rawPayload: trafficRaw,
    },
    trafficSources: normalizeTrafficSources(trafficRaw.traffic_sources),
    paidTraffic: hasPaid ? {
      campaignType: paidType, playCount: integer(paidRaw["播放量"]),
      relationshipToOverview: ("extra_traffic_paid" in trafficRaw || /额外流量/.test(text(paidRaw.note) + text(paidRaw.detail_entry) + text(object(trafficRaw.extra_traffic_paid).note))) ? "additional" : "unknown",
      detailAvailable: text(paidRaw.detail_entry).includes("无") || text(paidRaw.note).includes("无二级") ? false : null,
      dataAvailabilityStatus: "available", rawPayload: paidRaw,
    } : null,
    audience: { dataAvailabilityStatus: audienceStatus, records: normalizeAudience(row.audience_analysis), rawPayload: object(row.audience_analysis) },
    commentKeywords: { dataAvailabilityStatus: keywordStatus, records: keywordValues.map((item, index) => ({ keyword: text(isObject(item) ? item.keyword : item), rank: integer(isObject(item) ? item.rank : null) ?? index + 1, rawValue: item })).filter((item) => item.keyword), rawPayload: keywordRaw },
    comments,
  };
}

export function normalizeWorkBuddyDeepPosts(value: unknown, file: { fileName: string; fullPath: string; checksum: string; fileSize: number }): WorkBuddyDeepPayload | null {
  if (!isObject(value) || !isObject(value.collection_info) || !isObject(value.summary) || !Array.isArray(value.posts) || !isObject(value.file_info)) return null;
  const fileInfo = value.file_info;
  const generated = chinaDateTime(fileInfo.generated_at);
  const latestPostCollection = value.posts.map((item) => chinaDateTime(object(item).collection_time)).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null;
  const collectionTime = generated ?? latestPostCollection;
  if (!collectionTime) return null;
  const profile = canonicalProfile(value);
  const posts = value.posts.map((item) => normalizePost(item, collectionTime));
  const checklist = value.posts.flatMap((item) => Object.values(object(object(item).checklist)).map(object));
  const completed = checklist.filter((item) => text(item.status) === "completed").length;
  const partial = checklist.filter((item) => text(item.status) === "partial").length;
  const completenessScore = checklist.length ? Number((((completed + partial * 0.5) / checklist.length) * 100).toFixed(2)) : 0;
  const range = text(object(value.collection_info).list_time_filter);
  const rangeMatch = range.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  const qualityWarnings: string[] = [];
  if (!("collection_summary" in value)) qualityWarnings.push("顶层 collection_summary 不存在；真实文件使用 summary 保存采集汇总，已按原字段映射且未补造。 ");
  if (!("collection_date" in value.collection_info)) qualityWarnings.push("collection_info.collection_date 不存在；collection_date 仅从 file_info.generated_at 的真实日期部分取得。 ");
  if (!("collection_batch" in value.collection_info)) qualityWarnings.push("collection_info.collection_batch 不存在；处理记录保存 null。 ");
  return {
    schemaVersion: "2.1", platform: "douyin", source: "WorkBuddy", sourceFile: file.fileName, sourcePath: file.fullPath,
    checksum: file.checksum, fileSize: file.fileSize, accountName: text(fileInfo.account), collectionDate: collectionTime.slice(0, 10), collectionTime,
    collectionBatch: text(object(value.collection_info).collection_batch) || null,
    collectionPeriod: { start: rangeMatch?.[1] ?? null, end: rangeMatch?.[2] ?? null, raw: range || null },
    ...profile, completenessScore, posts, qualityWarnings, rawCollectionInfo: value.collection_info, rawSummary: value.summary,
  };
}

export function validateWorkBuddyDeepPosts(payload: WorkBuddyDeepPayload) {
  const errors: DeepValidationError[] = [];
  if (!payload.accountName) errors.push({ field: "file_info.account", message: "账号名称为空" });
  if (!payload.checksum || !/^[a-f0-9]{64}$/.test(payload.checksum)) errors.push({ field: "checksum", message: "SHA-256 checksum 无效" });
  if (!payload.posts.length) errors.push({ field: "posts", message: "作品数组为空" });
  const summaryCount = integer(payload.rawSummary.total_posts_collected);
  const infoCount = integer(payload.rawCollectionInfo.posts_in_filter_range);
  if (summaryCount !== null && summaryCount !== payload.posts.length) errors.push({ field: "summary.total_posts_collected", message: `声明 ${summaryCount} 条，实际 ${payload.posts.length} 条` });
  if (infoCount !== null && infoCount !== payload.posts.length) errors.push({ field: "collection_info.posts_in_filter_range", message: `声明 ${infoCount} 条，实际 ${payload.posts.length} 条` });
  const realIds = new Set<string>();
  payload.posts.forEach((post, index) => {
    if (!post.title) errors.push({ rowNumber: index + 1, field: "title", message: "作品标题为空" });
    if (!Date.parse(post.publishTime)) errors.push({ rowNumber: index + 1, field: "publish_time", message: "发布时间无效" });
    if (post.platformPostId) {
      if (realIds.has(post.platformPostId)) errors.push({ rowNumber: index + 1, field: "post_id", message: "真实 post_id 重复" });
      realIds.add(post.platformPostId);
    }
    if (post.sourceRecordStatus === "normal" && !post.platformPostId) errors.push({ rowNumber: index + 1, field: "post_id", message: "正常作品缺少 post_id" });
    if (post.snapshot.commentRowsCount !== post.comments.length) errors.push({ rowNumber: index + 1, field: "comments", message: "评论明细计数不一致" });
  });
  return errors;
}

export function summarizeWorkBuddyDeepPosts(payload: WorkBuddyDeepPayload, existingPosts = 0) {
  const normalPosts = payload.posts.filter((post) => post.sourceRecordStatus === "normal" || post.sourceRecordStatus === "partial").length;
  const privatePosts = payload.posts.filter((post) => post.sourceRecordStatus === "private").length;
  return {
    actualPosts: payload.posts.length, normalPosts, privatePosts,
    unavailablePosts: payload.posts.filter((post) => post.sourceRecordStatus === "unavailable").length,
    failedPosts: payload.posts.filter((post) => post.sourceRecordStatus === "failed").length,
    existingPosts, newPosts: Math.max(0, payload.posts.length - existingPosts), snapshots: payload.posts.length,
    metricSeriesPoints: payload.posts.reduce((sum, post) => sum + post.metricSeries.length, 0),
    trafficRows: payload.posts.length, trafficSourceRows: payload.posts.reduce((sum, post) => sum + post.trafficSources.length, 0),
    paidTrafficPosts: payload.posts.filter((post) => post.paidTraffic?.dataAvailabilityStatus === "available").length,
    audienceRecords: payload.posts.reduce((sum, post) => sum + post.audience.records.length, 0),
    commentKeywords: payload.posts.reduce((sum, post) => sum + post.commentKeywords.records.length, 0),
    actualComments: payload.posts.reduce((sum, post) => sum + post.comments.length, 0),
    commentReplies: payload.posts.reduce((sum, post) => sum + post.comments.reduce((replySum, comment) => replySum + comment.replies.length, 0), 0),
    overviewCommentCount: payload.posts.reduce((sum, post) => sum + (post.snapshot.commentOverviewCount ?? 0), 0),
    actualLoadedCount: payload.posts.reduce((sum, post) => sum + (post.snapshot.actualLoadedCount ?? 0), 0),
    unavailableValues: payload.unavailableValueCount, failedValues: payload.failedValueCount,
    postsWithin14Days: payload.posts.filter((post) => post.postAgeDays <= 14).length,
  };
}
