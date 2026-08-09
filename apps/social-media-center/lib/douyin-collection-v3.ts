import type { CollectionValidationError } from "@/lib/collections";

export type DistributionItem = { label: string; value: number };
export type DouyinCollectionV3Payload = {
  schemaVersion: "3.0";
  source: "douyin-app-to-chrome-creator-center";
  platform: "douyin";
  accountName: string;
  collectedAt: string;
  pageUrl?: string;
  collectionRange: { start: string; end: string };
  fans: {
    currentTotal: number;
    periodEndTotal: number;
    gender: DistributionItem[];
    age: DistributionItem[];
    region: DistributionItem[];
    interests: DistributionItem[];
    growth: Array<{
      recordDate: string;
      fansCount: number;
      netGrowth: number;
      newFans: number;
      lostFans: number;
      returningFans?: number;
      granularity?: string;
    }>;
  };
  posts: Array<{
    title: string;
    publishTime: string;
    videoUrl: string;
    contentType: "video" | "image_text";
    views: number;
    likes: number;
    commentsCount: number;
    displayedCommentsCount?: number;
    favorites: number;
    shares: number;
    completionRate: number | null;
    skipRate: number | null;
    averagePlayDuration: number | null;
    trafficSources: DistributionItem[];
    audience: {
      gender: DistributionItem[];
      age: DistributionItem[];
      region: DistributionItem[];
    };
    comments: Array<{
      username: string;
      commentText: string;
      commentTime: string;
      likes: number;
    }>;
    commentKeywords: DistributionItem[];
  }>;
  failures: Array<{ target: string; stage: string; reason: string }>;
};

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number(value);
const optionalNumber = (value: unknown) => value === null || value === undefined || value === "" ? null : number(value);
const validDate = (value: string) => Boolean(value) && !Number.isNaN(Date.parse(value));
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";

function distribution(value: unknown): DistributionItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item) => {
    const row = isObject(item) ? item : {};
    return { label: text(row.label).slice(0, 100), value: number(row.value) };
  });
}

function validDouyinUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname.endsWith("douyin.com");
  } catch {
    return false;
  }
}

export function normalizeDouyinCollectionV3(value: unknown): DouyinCollectionV3Payload | null {
  if (!isObject(value) || !isObject(value.fans) || !Array.isArray(value.posts)) return null;
  const fans = value.fans;
  return {
    schemaVersion: text(value.schemaVersion) as "3.0",
    source: text(value.source) as DouyinCollectionV3Payload["source"],
    platform: text(value.platform) as "douyin",
    accountName: text(value.accountName),
    collectedAt: text(value.collectedAt),
    pageUrl: text(value.pageUrl) || undefined,
    collectionRange: isObject(value.collectionRange) ? {
      start: text(value.collectionRange.start),
      end: text(value.collectionRange.end),
    } : { start: "", end: "" },
    fans: {
      currentTotal: number(fans.currentTotal),
      periodEndTotal: number(fans.periodEndTotal),
      gender: distribution(fans.gender),
      age: distribution(fans.age),
      region: distribution(fans.region),
      interests: distribution(fans.interests),
      growth: Array.isArray(fans.growth) ? fans.growth.slice(0, 370).map((item) => {
        const row = isObject(item) ? item : {};
        return {
          recordDate: text(row.recordDate),
          fansCount: number(row.fansCount),
          netGrowth: number(row.netGrowth),
          newFans: number(row.newFans),
          lostFans: number(row.lostFans),
          returningFans: row.returningFans === undefined ? undefined : number(row.returningFans),
          granularity: text(row.granularity) || undefined,
        };
      }) : [],
    },
    posts: value.posts.slice(0, 200).map((item) => {
      const row = isObject(item) ? item : {};
      const audience = isObject(row.audience) ? row.audience : {};
      return {
        title: text(row.title).slice(0, 1000),
        publishTime: text(row.publishTime),
        videoUrl: text(row.videoUrl),
        contentType: text(row.contentType || "video") as "video" | "image_text",
        views: number(row.views),
        likes: number(row.likes),
        commentsCount: number(row.commentsCount),
        displayedCommentsCount: row.displayedCommentsCount === undefined ? undefined : number(row.displayedCommentsCount),
        favorites: number(row.favorites),
        shares: number(row.shares),
        completionRate: optionalNumber(row.completionRate),
        skipRate: optionalNumber(row.skipRate),
        averagePlayDuration: optionalNumber(row.averagePlayDuration),
        trafficSources: distribution(row.trafficSources),
        audience: {
          gender: distribution(audience.gender),
          age: distribution(audience.age),
          region: distribution(audience.region),
        },
        comments: Array.isArray(row.comments) ? row.comments.slice(0, 50).map((item) => {
          const comment = isObject(item) ? item : {};
          return {
            username: text(comment.username).slice(0, 200),
            commentText: text(comment.commentText).slice(0, 4000),
            commentTime: text(comment.commentTime),
            likes: number(comment.likes),
          };
        }) : [],
        commentKeywords: distribution(row.commentKeywords),
      };
    }),
    failures: Array.isArray(value.failures) ? value.failures.slice(0, 500).map((item) => {
      const row = isObject(item) ? item : {};
      return {
        target: text(row.target).slice(0, 500),
        stage: text(row.stage).slice(0, 100),
        reason: text(row.reason).slice(0, 1000),
      };
    }).filter((item) => item.target && item.reason) : [],
  };
}

function validateDistribution(values: DistributionItem[], rowNumber: number, field: string, errors: CollectionValidationError[]) {
  if (values.some((item) => !item.label || !Number.isFinite(item.value) || item.value < 0)) {
    errors.push({ rowNumber, field, message: `${field}包含无效标签或数值` });
  }
}

export function validateDouyinCollectionV3(payload: DouyinCollectionV3Payload) {
  const errors: CollectionValidationError[] = [];
  if (payload.schemaVersion !== "3.0") errors.push({ rowNumber: 0, field: "schemaVersion", message: "仅支持 V3.0 采集文件" });
  if (payload.source !== "douyin-app-to-chrome-creator-center") errors.push({ rowNumber: 0, field: "source", message: "V3.0 采集来源无效" });
  if (payload.platform !== "douyin") errors.push({ rowNumber: 0, field: "platform", message: "V3.0 当前仅支持抖音" });
  if (!payload.accountName) errors.push({ rowNumber: 0, field: "accountName", message: "账号名称不能为空" });
  if (!validDate(payload.collectedAt)) errors.push({ rowNumber: 0, field: "collectedAt", message: "采集时间无效" });
  if (!validDate(payload.collectionRange.start) || !validDate(payload.collectionRange.end) || Date.parse(payload.collectionRange.start) > Date.parse(payload.collectionRange.end)) {
    errors.push({ rowNumber: 0, field: "collectionRange", message: "采集日期范围无效" });
  }
  if (![payload.fans.currentTotal, payload.fans.periodEndTotal].every(Number.isInteger) || payload.fans.currentTotal < 0 || payload.fans.periodEndTotal < 0) {
    errors.push({ rowNumber: 0, field: "fans", message: "粉丝数量必须为非负整数" });
  }
  for (const [field, values] of Object.entries({ gender: payload.fans.gender, age: payload.fans.age, region: payload.fans.region, interests: payload.fans.interests })) {
    validateDistribution(values, 0, `fans.${field}`, errors);
  }
  payload.fans.growth.forEach((growth, index) => {
    if (!validDate(growth.recordDate) || ![growth.fansCount, growth.netGrowth, growth.newFans, growth.lostFans].every(Number.isInteger) || growth.fansCount < 0 || growth.newFans < 0 || growth.lostFans < 0) {
      errors.push({ rowNumber: index + 1, field: "fans.growth", message: "粉丝增长记录日期或数值无效" });
    }
  });
  payload.posts.forEach((post, index) => {
    const rowNumber = index + 1;
    if (!post.title) errors.push({ rowNumber, field: "title", message: "作品标题不能为空" });
    if (!validDate(post.publishTime)) errors.push({ rowNumber, field: "publishTime", message: "发布时间无效" });
    if (!validDouyinUrl(post.videoUrl)) errors.push({ rowNumber, field: "videoUrl", message: "非空作品链接必须属于 douyin.com" });
    if (!(["video", "image_text"] as string[]).includes(post.contentType)) errors.push({ rowNumber, field: "contentType", message: "内容类型无效" });
    for (const [field, metric] of Object.entries({ views: post.views, likes: post.likes, commentsCount: post.commentsCount, favorites: post.favorites, shares: post.shares })) {
      if (!Number.isInteger(metric) || metric < 0) errors.push({ rowNumber, field, message: `${field}必须为非负整数` });
    }
    for (const [field, metric] of Object.entries({ completionRate: post.completionRate, skipRate: post.skipRate })) {
      if (metric !== null && (!Number.isFinite(metric) || metric < 0 || metric > 100)) errors.push({ rowNumber, field, message: `${field}必须介于 0–100` });
    }
    if (post.averagePlayDuration !== null && (!Number.isFinite(post.averagePlayDuration) || post.averagePlayDuration < 0)) errors.push({ rowNumber, field: "averagePlayDuration", message: "平均播放时长无效" });
    validateDistribution(post.trafficSources, rowNumber, "trafficSources", errors);
    validateDistribution(post.audience.gender, rowNumber, "audience.gender", errors);
    validateDistribution(post.audience.age, rowNumber, "audience.age", errors);
    validateDistribution(post.audience.region, rowNumber, "audience.region", errors);
    post.comments.forEach((comment) => {
      if (!comment.username || !comment.commentText || !validDate(comment.commentTime) || !Number.isInteger(comment.likes) || comment.likes < 0) {
        errors.push({ rowNumber, field: "comments", message: "评论用户名、内容、时间或点赞数无效" });
      }
    });
  });
  return errors;
}

export function summarizeDouyinCollectionV3(payload: DouyinCollectionV3Payload) {
  const comments = payload.posts.reduce((total, post) => total + post.comments.length, 0);
  const audienceRecords = payload.posts.filter((post) => post.audience.gender.length || post.audience.age.length || post.audience.region.length).length;
  return {
    fans: 1,
    fanGrowthRecords: payload.fans.growth.length,
    posts: payload.posts.length,
    comments,
    audienceRecords,
    failures: payload.failures.length,
  };
}
