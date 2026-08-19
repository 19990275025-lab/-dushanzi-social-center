export const WORKBUDDY_V2_SOURCE = "WorkBuddy热点监测Agent";

type WorkBuddyRawTopic = Record<string, unknown>;
type StandardPlatform = "douyin" | "kuaishou" | "weibo";

export type WorkBuddyV2Record = {
  platform: StandardPlatform;
  source: typeof WORKBUDDY_V2_SOURCE;
  topic_type: "hot_rank" | "planting_rank" | "challenge_rank";
  topic_name: string;
  keyword: string;
  ranking: number;
  heat_value: number;
  trend: "up" | "down" | "new" | "stable";
  category: string | null;
  source_url: string | null;
  raw_payload: WorkBuddyRawTopic;
  collect_time: string;
};

export type WorkBuddyV2Batch = {
  data_type: "hot_topic";
  source: typeof WORKBUDDY_V2_SOURCE;
  platform: StandardPlatform;
  collected_at: string;
  source_file?: string;
  records: WorkBuddyV2Record[];
};

export type WorkBuddyV2BuildOptions = {
  expectedCollectionDate?: string;
  requireCollectionTime?: boolean;
  requireTopicType?: boolean;
};

const platformAliases: Record<string, StandardPlatform> = {
  抖音: "douyin",
  douyin: "douyin",
  dy: "douyin",
  快手: "kuaishou",
  kuaishou: "kuaishou",
  ks: "kuaishou",
  微博: "weibo",
  weibo: "weibo",
  wb: "weibo",
};

function value(record: WorkBuddyRawTopic, aliases: string[]) {
  for (const alias of aliases) {
    const item = record[alias];
    if (item !== undefined && item !== null && String(item).trim()) return item;
  }
  return undefined;
}

function firstPlatform(raw: unknown): StandardPlatform | null {
  const tokens = String(raw ?? "").split(/[\/、,，|+]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  for (const token of tokens) {
    const platform = platformAliases[token];
    if (platform) return platform;
  }
  return null;
}

function topicType(rawType: unknown, rawHeat: string, title: string): WorkBuddyV2Record["topic_type"] | null {
  const text = `${String(rawType ?? "")} ${rawHeat} ${title}`;
  if (/挑战榜|挑战话题|challenge/i.test(text)) return "challenge_rank";
  if (/种草榜|种草|planting|seed/i.test(text)) return "planting_rank";
  if (/热点榜|热搜榜|热榜|hot.?rank|hot.?search/i.test(text)) return "hot_rank";
  return "hot_rank";
}

function trend(raw: unknown): WorkBuddyV2Record["trend"] | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (["新", "新增", "新上榜", "new"].includes(text)) return "new";
  if (["上升", "上涨", "up", "rising"].includes(text)) return "up";
  if (["下降", "下跌", "down", "falling"].includes(text)) return "down";
  if (["持平", "稳定", "stable", "steady"].includes(text)) return "stable";
  return null;
}

function beijingDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function normalizeWorkBuddyHeat(raw: unknown) {
  const source = String(raw ?? "").replaceAll(",", "").trim();
  if (!source) return null;
  const amounts: number[] = [];
  for (const match of source.matchAll(/([\d.]+)\s*(亿|千万|万)/g)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    amounts.push(amount * (match[2] === "亿" ? 100_000_000 : match[2] === "千万" ? 10_000_000 : 10_000));
  }
  if (/破亿|亿级/.test(source)) amounts.push(100_000_000);
  if (/千万级|千万播放|千万点赞/.test(source)) amounts.push(10_000_000);

  let score = amounts.length ? 25 + Math.log10(Math.max(...amounts) + 1) * 9 : 0;
  const topRank = source.match(/TOP\s*(\d+)/i);
  if (topRank) score = Math.max(score, 101 - Math.min(100, Number(topRank[1])));
  if (/全网热议|持续霸榜/.test(source)) score = Math.max(score, 92);
  else if (/热搜/.test(source)) score = Math.max(score, 86);
  else if (/热榜/.test(source)) score = Math.max(score, 80);
  else if (/央视|人民日报|中国旅游报/.test(source)) score = Math.max(score, 75);
  return Math.max(1, Math.min(100, Math.round(score || 60)));
}

export function buildWorkBuddyV2Records(
  rawTopics: unknown[],
  collectedAt: string,
  limit = 500,
  options: WorkBuddyV2BuildOptions = {},
) {
  const records: WorkBuddyV2Record[] = [];
  const errors: Array<{ row: number; reason: string }> = [];
  const seen = new Set<string>();
  for (const [index, raw] of rawTopics.slice(0, limit).entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({ row: index + 1, reason: "记录不是对象" });
      continue;
    }
    const topic = raw as WorkBuddyRawTopic;
    const sourceAgent = String(value(topic, ["source_agent", "sourceAgent", "来源Agent"]) ?? "").trim();
    const platform = firstPlatform(value(topic, ["platform", "平台"]));
    const title = String(value(topic, ["topic", "topic_title", "topicName", "热点标题", "热点名称"]) ?? "").trim();
    const ranking = Number(value(topic, ["rank", "ranking", "排名"]));
    const rawHeat = String(value(topic, ["heat_value", "heatValue", "热度"]) ?? "").trim();
    const keyword = String(value(topic, ["keyword", "关键词"]) ?? title).trim();
    const category = String(value(topic, ["category", "分类"]) ?? "").trim();
    const rawTopicType = value(topic, ["list_type", "topic_type", "topicType", "榜单类型", "热点类型"]);
    const normalizedTopicType = topicType(rawTopicType, rawHeat, title);
    const rawTrend = value(topic, ["trend", "趋势"]);
    const normalizedTrend = trend(rawTrend);
    const rawCollectTime = value(topic, ["collect_time", "collectTime", "collected_at", "采集时间"]);
    const collectTime = String(rawCollectTime ?? collectedAt).trim();
    const collectionDate = beijingDate(collectTime);
    const heat = normalizeWorkBuddyHeat(rawHeat);
    const reasons: string[] = [];
    if (sourceAgent && sourceAgent !== WORKBUDDY_V2_SOURCE) reasons.push("数据来源不是WorkBuddy热点监测Agent");
    if (!platform) reasons.push("平台无法映射为抖音、快手或微博");
    if (!title) reasons.push("热点名称为空");
    if (!Number.isInteger(ranking) || ranking <= 0) reasons.push("排名必须是正整数");
    if (heat === null) reasons.push("热度为空");
    if (options.requireTopicType && !rawTopicType) reasons.push("榜单类型为空");
    if (!normalizedTopicType) reasons.push("榜单类型无法映射为热点榜、种草榜或挑战榜");
    if (rawTrend !== undefined && !normalizedTrend) reasons.push("趋势无法映射为上升、下降、新上榜或持平");
    if (options.requireCollectionTime && !rawCollectTime) reasons.push("采集时间为空");
    if (!collectionDate) reasons.push("采集时间无效");
    if (options.expectedCollectionDate && collectionDate && collectionDate !== options.expectedCollectionDate) {
      reasons.push(`采集时间日期${collectionDate}与文件日期${options.expectedCollectionDate}不一致`);
    }
    const dedupeKey = platform && normalizedTopicType && title && Number.isInteger(ranking) && collectionDate
      ? `${collectionDate}|${platform}|${normalizedTopicType}|${title}|${ranking}`
      : null;
    if (dedupeKey && seen.has(dedupeKey)) reasons.push("同一文件存在重复热点");
    if (dedupeKey) seen.add(dedupeKey);
    if (reasons.length) {
      errors.push({ row: index + 1, reason: reasons.join("；") });
      continue;
    }
    records.push({
      platform: platform as StandardPlatform,
      source: WORKBUDDY_V2_SOURCE,
      topic_type: normalizedTopicType as WorkBuddyV2Record["topic_type"],
      topic_name: title.slice(0, 500),
      keyword: keyword.slice(0, 500),
      ranking,
      heat_value: heat as number,
      trend: normalizedTrend ?? "new",
      category: category.slice(0, 128) || null,
      source_url: String(value(topic, ["url", "source_url", "链接"]) ?? "").trim().slice(0, 2000) || null,
      raw_payload: topic,
      collect_time: new Date(collectTime).toISOString(),
    });
  }
  return { records, errors, requestedCount: Math.min(limit, rawTopics.length) };
}

export function groupWorkBuddyV2Batches(records: WorkBuddyV2Record[], collectedAt: string, sourceFile?: string): WorkBuddyV2Batch[] {
  const platforms: StandardPlatform[] = ["douyin", "kuaishou", "weibo"];
  return platforms.flatMap((platform) => {
    const platformRecords = records.filter((record) => record.platform === platform);
    return platformRecords.length ? [{
      data_type: "hot_topic" as const,
      source: WORKBUDDY_V2_SOURCE,
      platform,
      collected_at: collectedAt,
      source_file: sourceFile,
      records: platformRecords,
    }] : [];
  });
}
