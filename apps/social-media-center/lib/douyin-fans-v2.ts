export const FAN_V2_SOURCE_FILE = "douyin_fans_20260820.json";

export type FanPeriodType = "daily" | "7d" | "30d" | "natural_month" | "custom";
export type FanDimensionType = "gender" | "age" | "region" | "interest" | "device" | "activity" | "follow_keyword" | "other";

export type FanGrowthV2Record = {
  periodType: FanPeriodType;
  periodStart: string | null;
  periodEnd: string | null;
  fansCount: number;
  newFollowers: number | null;
  lostFollowers: number | null;
  netGrowth: number | null;
  returningFollowers: number | null;
  rawPayload: Record<string, unknown>;
};

export type FanProfileV2Record = {
  dimensionType: FanDimensionType;
  dimensionName: string;
  dimensionValue: number | null;
  percentage: number | null;
  ranking: number;
  rawValue: string | null;
};

export type DouyinFansV2Payload = {
  platform: "douyin";
  accountName: string;
  snapshotDate: string;
  collectionTime: string;
  sourceFile: string;
  sourceRecordId: string;
  fansCount: number;
  displayFansCount: string | null;
  maleRatio: number | null;
  femaleRatio: number | null;
  dataPeriods: FanPeriodType[];
  rawMetricCount: number;
  successMetricCount: number;
  unavailableMetricCount: number;
  growth: FanGrowthV2Record[];
  profiles: FanProfileV2Record[];
  rawPayload: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const record = (value: unknown) => isRecord(value) ? value : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const dateOnly = (value: string) => value.slice(0, 10);

function percentRecords(value: unknown, dimensionType: FanDimensionType): FanProfileV2Record[] {
  return array(value).flatMap((item, index) => {
    const row = record(item);
    const name = text(row["原始标签"]);
    const numericValue = numberOrNull(row["数值"]);
    if (!name || numericValue === null) return [];
    return [{
      dimensionType,
      dimensionName: name,
      dimensionValue: numericValue,
      percentage: numericValue,
      ranking: index + 1,
      rawValue: text(row["原始值"]) || `${numericValue}%`,
    }];
  });
}

function growthRecord(
  value: unknown,
  periodType: FanPeriodType,
  fansCount: number,
): FanGrowthV2Record | null {
  const row = record(value);
  if (text(row["状态"]) === "unavailable") return null;
  const periodText = text(row["统计周期"]);
  const periodParts = periodText.split("至");
  const periodStart = periodParts[0] || null;
  const periodEnd = periodParts[1] || periodParts[0] || null;
  return {
    periodType,
    periodStart,
    periodEnd,
    fansCount,
    newFollowers: numberOrNull(row["吸粉量"]),
    lostFollowers: numberOrNull(row["脱粉量"]),
    netGrowth: numberOrNull(row["粉丝净增"]),
    returningFollowers: numberOrNull(row["回访粉丝量"]),
    rawPayload: row,
  };
}

export function normalizeDouyinFansV2(value: unknown, sourceFile = FAN_V2_SOURCE_FILE): DouyinFansV2Payload | null {
  if (!isRecord(value)) return null;
  const rawData = record(value.raw_data);
  const overview = record(rawData["粉丝总览"]);
  const exactTotal = record(overview["当前粉丝总数"]);
  const growthData = record(rawData["粉丝增长"]);
  const profile = record(rawData["粉丝画像"]);
  const collectionLog = record(value.collection_log);
  const fansCount = numberOrNull(exactTotal["数值"]);
  const collectionTime = text(collectionLog.ended_at);
  if (text(value.platform) !== "抖音" || fansCount === null || !collectionTime) return null;

  const gender = percentRecords(profile["性别分布"], "gender");
  const growth = [
    growthRecord(growthData["昨天"], "daily", fansCount),
    growthRecord(growthData["近7天"], "7d", fansCount),
    growthRecord(growthData["近30天"], "30d", fansCount),
  ].filter((item): item is FanGrowthV2Record => Boolean(item));

  const hotwords = array(profile["粉丝关注热词"]).flatMap((item, index) => {
    if (!Array.isArray(item) || !text(item[0])) return [];
    const value = numberOrNull(item[1]);
    return [{
      dimensionType: "follow_keyword" as const,
      dimensionName: text(item[0]),
      dimensionValue: value,
      percentage: null,
      ranking: index + 1,
      rawValue: value === null ? null : String(value),
    }];
  });
  const unavailable = array(value.unavailable_or_failed).flatMap((item, index) => {
    const row = record(item);
    const field = text(row.field);
    if (!field) return [];
    const reason = text(row.reason);
    return [{
      dimensionType: "other" as const,
      dimensionName: field,
      dimensionValue: null,
      percentage: null,
      ranking: index + 1,
      rawValue: reason ? `unavailable: ${reason}` : "unavailable",
    }];
  });
  const displayFansCount = text(record(growthData["昨天"])["总粉丝量"]) || null;

  return {
    platform: "douyin",
    accountName: text(value.actual_account_name) || text(value.requested_account),
    snapshotDate: dateOnly(collectionTime),
    collectionTime,
    sourceFile,
    sourceRecordId: `douyin-fans-v2:${dateOnly(collectionTime)}`,
    fansCount,
    displayFansCount,
    maleRatio: gender.find((item) => item.dimensionName === "男性")?.percentage ?? null,
    femaleRatio: gender.find((item) => item.dimensionName === "女性")?.percentage ?? null,
    dataPeriods: growth.map((item) => item.periodType),
    rawMetricCount: numberOrNull(collectionLog.successful_metric_values) ?? 0,
    successMetricCount: numberOrNull(collectionLog.successful_metric_values) ?? 0,
    unavailableMetricCount: numberOrNull(collectionLog.failed_requested_fields) ?? unavailable.length,
    growth,
    profiles: [
      ...gender,
      ...percentRecords(profile["年龄分布"], "age"),
      ...percentRecords(profile["地域分布"], "region"),
      ...percentRecords(profile["兴趣分布"], "interest"),
      ...percentRecords(profile["设备分布"], "device"),
      ...percentRecords(profile["活跃分布"], "activity"),
      ...hotwords,
      ...unavailable,
    ],
    rawPayload: value,
  };
}

export function validateDouyinFansV2(payload: DouyinFansV2Payload) {
  const errors: string[] = [];
  if (!payload.accountName) errors.push("采集账号不能为空");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.snapshotDate)) errors.push("快照日期无效");
  if (!Number.isInteger(payload.fansCount) || payload.fansCount <= 0) errors.push("精确粉丝总数无效");
  if (payload.maleRatio === null || payload.femaleRatio === null) errors.push("性别画像不完整");
  if (payload.growth.length !== 3) errors.push("daily、7d、30d增长记录必须完整");
  for (const growth of payload.growth) {
    if (!growth.periodStart || !growth.periodEnd) errors.push(`${growth.periodType}统计周期缺失`);
    for (const [name, metric] of Object.entries({
      newFollowers: growth.newFollowers,
      lostFollowers: growth.lostFollowers,
      netGrowth: growth.netGrowth,
      returningFollowers: growth.returningFollowers,
    })) if (metric === null || !Number.isInteger(metric)) errors.push(`${growth.periodType}.${name}无效`);
  }
  const requiredCounts: Record<FanDimensionType, number> = {
    gender: 2, age: 5, region: 29, interest: 10, device: 7,
    activity: 4, follow_keyword: 100, other: 8,
  };
  for (const [dimensionType, expected] of Object.entries(requiredCounts)) {
    const actual = payload.profiles.filter((item) => item.dimensionType === dimensionType).length;
    if (actual !== expected) errors.push(`${dimensionType}画像应为${expected}项，实际${actual}项`);
  }
  const unavailable = payload.profiles.filter((item) => item.dimensionType === "other");
  if (unavailable.some((item) => item.dimensionValue !== null || item.percentage !== null || !item.rawValue?.startsWith("unavailable"))) {
    errors.push("unavailable字段必须保持null并标记unavailable");
  }
  if (payload.successMetricCount !== 173 || payload.unavailableMetricCount !== 8) errors.push("采集指标计数与真实文件不一致");
  return errors;
}

export function summarizeDouyinFansV2(payload: DouyinFansV2Payload) {
  return {
    fansCount: payload.fansCount,
    growthRecords: payload.growth.length,
    profileRecords: payload.profiles.length,
    followKeywords: payload.profiles.filter((item) => item.dimensionType === "follow_keyword").length,
    unavailable: payload.profiles.filter((item) => item.dimensionType === "other").length,
    dimensionCounts: Object.fromEntries(
      (["gender", "age", "region", "interest", "device", "activity", "follow_keyword", "other"] as FanDimensionType[])
        .map((type) => [type, payload.profiles.filter((item) => item.dimensionType === type).length]),
    ),
  };
}
