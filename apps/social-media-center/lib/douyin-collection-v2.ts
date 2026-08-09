import type { CollectionValidationError } from "@/lib/collections";

export type DistributionItem = { label: string; value: number };
export type FanGrowthItem = {
  recordDate: string;
  fansCount: number;
  netGrowth: number;
  newFans: number;
  lostFans: number;
};
export type DouyinCommentV2 = {
  username: string;
  commentText: string;
  commentTime: string;
  likes: number;
  keyword?: string;
};
export type DouyinPostV2 = {
  title: string;
  publishTime: string;
  videoUrl: string;
  contentType: "video" | "image_text";
  views: number;
  likes: number;
  commentsCount: number;
  favorites: number;
  shares: number;
  completionRate: number | null;
  averagePlayDuration: number | null;
  trafficSources: DistributionItem[];
  audience: {
    gender: DistributionItem[];
    age: DistributionItem[];
    region: DistributionItem[];
  };
  comments: DouyinCommentV2[];
  commentKeywords: DistributionItem[];
};
export type DouyinCollectionV2Payload = {
  schemaVersion: "2.0" | "2.1";
  source: "douyin-app" | "chrome-creator-center";
  platform: "douyin";
  accountName: string;
  collectedAt: string;
  pageUrl?: string;
  collectionRange: { start: string; end: string };
  fans: {
    total: number;
    gender: DistributionItem[];
    age: DistributionItem[];
    region: DistributionItem[];
    interests: DistributionItem[];
    activeTime: DistributionItem[];
    growth: FanGrowthItem[];
  };
  posts: DouyinPostV2[];
  failures: { target: string; stage: string; reason: string }[];
};

const number = (value: unknown) => Number(value);
const text = (value: unknown) => String(value ?? "").trim();
const validDate = (value: string) => Boolean(value) && !Number.isNaN(Date.parse(value));
const validUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.endsWith("douyin.com");
  } catch {
    return false;
  }
};

function distribution(value: unknown): DistributionItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return { label: text(row.label).slice(0, 100), value: number(row.value) };
  });
}

function validateDistribution(
  values: DistributionItem[],
  rowNumber: number,
  field: string,
  errors: CollectionValidationError[],
) {
  for (const item of values) {
    if (!item.label || !Number.isFinite(item.value) || item.value < 0) {
      errors.push({ rowNumber, field, message: `${field}包含无效标签或数值` });
      return;
    }
  }
}

export function normalizeDouyinCollectionV2(value: unknown): DouyinCollectionV2Payload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!raw.fans || typeof raw.fans !== "object" || !Array.isArray(raw.posts)) return null;
  const fans = raw.fans as Record<string, unknown>;
  return {
    schemaVersion: text(raw.schemaVersion) as DouyinCollectionV2Payload["schemaVersion"],
    source: text(raw.source) as DouyinCollectionV2Payload["source"],
    platform: text(raw.platform) as "douyin",
    accountName: text(raw.accountName),
    collectedAt: text(raw.collectedAt),
    pageUrl: text(raw.pageUrl) || undefined,
    collectionRange: raw.collectionRange && typeof raw.collectionRange === "object" ? {
      start: text((raw.collectionRange as Record<string, unknown>).start),
      end: text((raw.collectionRange as Record<string, unknown>).end),
    } : { start: "", end: "" },
    fans: {
      total: number(fans.total),
      gender: distribution(fans.gender),
      age: distribution(fans.age),
      region: distribution(fans.region),
      interests: distribution(fans.interests),
      activeTime: distribution(fans.activeTime),
      growth: Array.isArray(fans.growth) ? fans.growth.slice(0, 370).map((item) => {
        const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          recordDate: text(row.recordDate),
          fansCount: number(row.fansCount),
          netGrowth: number(row.netGrowth),
          newFans: number(row.newFans),
          lostFans: number(row.lostFans),
        };
      }) : [],
    },
    posts: raw.posts.slice(0, 200).map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const audience = (row.audience && typeof row.audience === "object" ? row.audience : {}) as Record<string, unknown>;
      return {
        title: text(row.title).slice(0, 1000),
        publishTime: text(row.publishTime),
        videoUrl: text(row.videoUrl),
        contentType: text(row.contentType || "video") as DouyinPostV2["contentType"],
        views: number(row.views),
        likes: number(row.likes),
        commentsCount: number(row.commentsCount),
        favorites: number(row.favorites),
        shares: number(row.shares),
        completionRate: row.completionRate === null || row.completionRate === "" || row.completionRate === undefined ? null : number(row.completionRate),
        averagePlayDuration: row.averagePlayDuration === null || row.averagePlayDuration === "" || row.averagePlayDuration === undefined ? null : number(row.averagePlayDuration),
        trafficSources: distribution(row.trafficSources),
        audience: {
          gender: distribution(audience.gender),
          age: distribution(audience.age),
          region: distribution(audience.region),
        },
        comments: Array.isArray(row.comments) ? row.comments.slice(0, 50).map((comment) => {
          const data = (comment && typeof comment === "object" ? comment : {}) as Record<string, unknown>;
          return {
            username: text(data.username).slice(0, 200),
            commentText: text(data.commentText).slice(0, 4000),
            commentTime: text(data.commentTime),
            likes: number(data.likes),
            keyword: text(data.keyword).slice(0, 200) || undefined,
          };
        }) : [],
        commentKeywords: distribution(row.commentKeywords),
      };
    }),
    failures: Array.isArray(raw.failures) ? raw.failures.slice(0, 500).map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return { target: text(row.target).slice(0, 500), stage: text(row.stage).slice(0, 100), reason: text(row.reason).slice(0, 1000) };
    }).filter((item) => item.target && item.reason) : [],
  };
}

export function validateDouyinCollectionV2(payload: DouyinCollectionV2Payload) {
  const errors: CollectionValidationError[] = [];
  if (!(payload.schemaVersion === "2.0" || payload.schemaVersion === "2.1")) errors.push({ rowNumber: 0, field: "schemaVersion", message: "仅支持 V2.0/V2.1 采集文件" });
  if (!(["douyin-app", "chrome-creator-center"] as string[]).includes(payload.source)) errors.push({ rowNumber: 0, field: "source", message: "采集来源无效" });
  if (payload.platform !== "douyin") errors.push({ rowNumber: 0, field: "platform", message: "V2.0 当前仅支持抖音" });
  if (!payload.accountName) errors.push({ rowNumber: 0, field: "accountName", message: "账号名称不能为空" });
  if (!validDate(payload.collectedAt)) errors.push({ rowNumber: 0, field: "collectedAt", message: "采集时间无效" });
  if (!validDate(payload.collectionRange.start) || !validDate(payload.collectionRange.end) || Date.parse(payload.collectionRange.start) > Date.parse(payload.collectionRange.end)) {
    errors.push({ rowNumber: 0, field: "collectionRange", message: "采集日期范围无效" });
  }
  if (!Number.isInteger(payload.fans.total) || payload.fans.total < 0) errors.push({ rowNumber: 0, field: "fans.total", message: "粉丝总量必须为非负整数" });
  for (const [field, values] of Object.entries({ gender: payload.fans.gender, age: payload.fans.age, region: payload.fans.region, interests: payload.fans.interests, activeTime: payload.fans.activeTime })) {
    validateDistribution(values, 0, `fans.${field}`, errors);
  }
  payload.fans.growth.forEach((item, index) => {
    if (!validDate(item.recordDate) || ![item.fansCount, item.netGrowth, item.newFans, item.lostFans].every(Number.isInteger) || item.fansCount < 0 || item.newFans < 0 || item.lostFans < 0) {
      errors.push({ rowNumber: index + 1, field: "fans.growth", message: "粉丝增长记录日期或数值无效" });
    }
  });
  payload.posts.forEach((post, index) => {
    const rowNumber = index + 1;
    if (!post.title) errors.push({ rowNumber, field: "title", message: "作品标题不能为空" });
    if (!validDate(post.publishTime)) errors.push({ rowNumber, field: "publishTime", message: "发布时间无效" });
    if (!validUrl(post.videoUrl)) errors.push({ rowNumber, field: "videoUrl", message: "作品链接必须属于 douyin.com" });
    if (!(["video", "image_text"] as string[]).includes(post.contentType)) errors.push({ rowNumber, field: "contentType", message: "内容类型无效" });
    for (const [field, value] of Object.entries({ views: post.views, likes: post.likes, commentsCount: post.commentsCount, favorites: post.favorites, shares: post.shares })) {
      if (!Number.isInteger(value) || value < 0) errors.push({ rowNumber, field, message: `${field}必须为非负整数` });
    }
    if (post.completionRate !== null && (!Number.isFinite(post.completionRate) || post.completionRate < 0 || post.completionRate > 100)) errors.push({ rowNumber, field: "completionRate", message: "完播率必须介于 0–100" });
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

export function summarizeDouyinCollectionV2(payload: DouyinCollectionV2Payload) {
  const comments = payload.posts.reduce((sum, post) => sum + post.comments.length, 0);
  const completePosts = payload.posts.filter((post) => post.completionRate !== null && post.averagePlayDuration !== null && post.trafficSources.length && (post.audience.age.length || post.audience.gender.length || post.audience.region.length)).length;
  const totalTargets = 1 + payload.fans.growth.length + payload.posts.length + comments;
  const successTargets = totalTargets - payload.failures.length;
  const fanFields = [
    payload.fans.total > 0,
    payload.fans.growth.length > 0,
    payload.fans.gender.length > 0,
    payload.fans.age.length > 0,
    payload.fans.region.length > 0,
    payload.fans.interests.length > 0,
    payload.fans.activeTime.length > 0,
  ];
  const postFields = payload.posts.flatMap((post) => [
    Boolean(post.title),
    validDate(post.publishTime),
    validUrl(post.videoUrl),
    Number.isInteger(post.views) && post.views >= 0,
    post.completionRate !== null,
    post.averagePlayDuration !== null,
    post.trafficSources.length > 0,
    post.audience.gender.length > 0,
    post.audience.age.length > 0,
    post.audience.region.length > 0,
  ]);
  const commentFields = payload.posts.flatMap((post) => [
    Number.isInteger(post.commentsCount) && post.commentsCount >= 0,
    post.commentsCount === 0 || post.comments.length > 0,
    post.commentsCount === 0 || post.commentKeywords.length > 0,
  ]);
  const rate = (fields: boolean[]) => fields.length ? Math.round((fields.filter(Boolean).length / fields.length) * 10000) / 100 : 0;
  const fanCompleteness = rate(fanFields);
  const postCompleteness = rate(postFields);
  const commentCompleteness = rate(commentFields);
  const overallCompleteness = rate([...fanFields, ...postFields, ...commentFields]);
  const failedFields = [
    ...(!fanFields[1] ? ["粉丝增长趋势"] : []),
    ...(!fanFields[6] ? ["粉丝活跃时间"] : []),
    ...payload.posts.flatMap((post, index) => [
      ...(post.completionRate === null ? [`作品${index + 1}.完播率`] : []),
      ...(post.averagePlayDuration === null ? [`作品${index + 1}.平均播放时长`] : []),
      ...(!post.trafficSources.length ? [`作品${index + 1}.流量来源`] : []),
      ...(!post.audience.gender.length ? [`作品${index + 1}.观众性别`] : []),
      ...(!post.audience.age.length ? [`作品${index + 1}.观众年龄`] : []),
      ...(!post.audience.region.length ? [`作品${index + 1}.观众地域`] : []),
      ...(post.commentsCount > 0 && !post.comments.length ? [`作品${index + 1}.评论内容`] : []),
      ...(post.commentsCount > 0 && !post.commentKeywords.length ? [`作品${index + 1}.评论热词`] : []),
    ]),
  ];
  return {
    fanSnapshots: 1,
    fanGrowthRecords: payload.fans.growth.length,
    posts: payload.posts.length,
    comments,
    completePosts,
    failures: payload.failures.length,
    successRate: totalTargets ? Math.max(0, Math.round((successTargets / totalTargets) * 10000) / 100) : 0,
    completeness: {
      fans: fanCompleteness,
      posts: postCompleteness,
      comments: commentCompleteness,
      overall: overallCompleteness,
      threshold: 80,
    },
    eligibleForConfirmation: fanCompleteness >= 80 && postCompleteness >= 80 && commentCompleteness >= 80,
    failedFields,
  };
}
