import * as XLSX from "xlsx";
import { calculateRelevance, classifyHotTopic } from "@/lib/hot-topic-engine";

export const HOT_TOPIC_DATA = "hot_topics";
export const externalHotTopicPlatforms = ["douyin", "kuaishou", "weibo", "web"] as const;
export type ExternalHotTopicPlatform = (typeof externalHotTopicPlatforms)[number];

export type ExternalHotTopicRow = {
  rowNumber: number;
  platform: ExternalHotTopicPlatform;
  topicName: string;
  keyword: string;
  heatValue: number;
  ranking: number | null;
  trend: "rising" | "stable" | "falling" | "new";
  category: string;
  collectTime: string;
  sourceUrl: string | null;
  sourceRecordId: string | null;
  rawPayload: Record<string, unknown>;
};

export type ExternalHotTopicAnalysis = {
  relatedDegree: number;
  hotScore: number;
  recommendation: string;
  recommendedTopic: string;
  videoDirection: string;
  publishTimeSuggestion: string;
};

const platformAliases: Record<string, ExternalHotTopicPlatform> = {
  douyin: "douyin", 抖音: "douyin",
  kuaishou: "kuaishou", 快手: "kuaishou",
  weibo: "weibo", 微博: "weibo",
  web: "web", all: "web", internet: "web", 全网: "web",
};
const trendAliases: Record<string, ExternalHotTopicRow["trend"]> = {
  rising: "rising", rise: "rising", up: "rising", 上升: "rising", 上涨: "rising",
  stable: "stable", steady: "stable", 平稳: "stable", 持平: "stable",
  falling: "falling", fall: "falling", down: "falling", 下降: "falling", 下跌: "falling",
  new: "new", 新增: "new", 新出现: "new",
};

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
  }
  return undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  const match = normalized.match(/^([\d.]+)\s*(亿|万|w|W|k|K)?$/);
  if (!match) return Number.NaN;
  const base = Number(match[1]);
  const multiplier = match[2] === "亿" ? 100_000_000 : /万|w/i.test(match[2] ?? "") ? 10_000 : /k/i.test(match[2] ?? "") ? 1_000 : 1;
  return base * multiplier;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S))).toISOString();
  }
  const text = String(value ?? "").trim();
  if (!text) return new Date().toISOString();
  const date = new Date(text.replace(/年|月/g, "-").replace(/日/g, ""));
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}

export function normalizeExternalHotTopicRow(raw: Record<string, unknown>, rowNumber: number): ExternalHotTopicRow | null {
  const platformText = String(pick(raw, ["platform", "平台", "source_platform", "来源平台"]) ?? "").trim();
  const platform = platformAliases[platformText] ?? platformAliases[platformText.toLowerCase()];
  const topicName = String(pick(raw, ["topic_name", "topicName", "热点名称", "话题", "标题"]) ?? "").trim();
  const heatValue = numberValue(pick(raw, ["heat_value", "heatValue", "热度", "热度值"]));
  if (!platform || !topicName || !Number.isFinite(heatValue)) return null;
  const keyword = String(pick(raw, ["keyword", "关键词"]) ?? topicName).trim();
  const rankingValue = numberValue(pick(raw, ["ranking", "rank", "排名"]));
  const trendText = String(pick(raw, ["trend", "趋势"]) ?? "new").trim();
  const collectTime = dateValue(pick(raw, ["collect_time", "collectTime", "采集时间", "更新时间"]));

  return {
    rowNumber,
    platform,
    topicName: topicName.slice(0, 500),
    keyword: keyword.slice(0, 255),
    heatValue: Math.max(0, heatValue),
    ranking: Number.isInteger(rankingValue) && rankingValue > 0 ? rankingValue : null,
    trend: trendAliases[trendText] ?? trendAliases[trendText.toLowerCase()] ?? "new",
    category: String(pick(raw, ["category", "分类"]) ?? classifyHotTopic(topicName)).trim().slice(0, 128),
    collectTime,
    sourceUrl: String(pick(raw, ["source_url", "sourceUrl", "url", "链接", "来源链接"]) ?? "").trim().slice(0, 2000) || null,
    sourceRecordId: String(pick(raw, ["source_record_id", "sourceRecordId", "external_id", "外部编号"]) ?? "").trim().slice(0, 255) || null,
    rawPayload: raw,
  };
}

export function validateExternalHotTopics(rows: ExternalHotTopicRow[], sourceAgent: string) {
  const errors: Array<{ rowNumber: number; message: string }> = [];
  if (!sourceAgent.trim() || sourceAgent.trim().length > 255) errors.push({ rowNumber: 0, message: "source_agent 必填且不能超过 255 字" });
  if (!rows.length) errors.push({ rowNumber: 0, message: "没有可导入的热点数据" });
  if (rows.length > 500) errors.push({ rowNumber: 0, message: "单次最多导入 500 条热点" });
  for (const row of rows) {
    if (!row.collectTime) errors.push({ rowNumber: row.rowNumber, message: "采集时间格式无效" });
    if (row.heatValue < 0) errors.push({ rowNumber: row.rowNumber, message: "热度不能为负数" });
  }
  return errors;
}

export function parseExternalHotTopicExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], totalRows: 0, detectedSourceAgent: "" };
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const agents = new Set(rawRows.map((row) => String(pick(row, ["source_agent", "sourceAgent", "数据来源", "来源Agent"]) ?? "").trim()).filter(Boolean));
  const rows = rawRows
    .map((row, index) => normalizeExternalHotTopicRow(row, index + 2))
    .filter((row): row is ExternalHotTopicRow => row !== null);
  return { rows, totalRows: rawRows.length, detectedSourceAgent: agents.size === 1 ? [...agents][0] : "" };
}

export function analyzeExternalHotTopic(row: ExternalHotTopicRow, historicalText: string): ExternalHotTopicAnalysis {
  const relevancePercent = calculateRelevance({
    topicName: row.topicName,
    keyword: row.keyword,
    category: row.category,
    historicalText,
  });
  const heatPoints = Math.min(55, Math.log10(row.heatValue + 1) / 8 * 55);
  const trendPoints = row.trend === "rising" ? 10 : row.trend === "new" ? 8 : row.trend === "stable" ? 5 : 1;
  const rankingPoints = row.ranking ? Math.max(0, 6 - Math.min(6, (row.ranking - 1) * 0.3)) : 0;
  const hotScore = Math.round(Math.min(100, heatPoints + relevancePercent * 0.29 + trendPoints + rankingPoints));
  const keyword = row.keyword || row.topicName;
  const recommendedTopic = relevancePercent >= 70
    ? `独山子大峡谷×${keyword}：游客第一视角实拍`
    : `借势${keyword}，讲清独山子大峡谷的独特体验`;
  const videoDirection = relevancePercent >= 70
    ? "前三秒用峡谷全景或游客反应制造冲击，随后呈现路线、项目体验和实用提示，结尾设置评论互动问题。"
    : "提取热点的表达方式，不生硬套用事件本身；用峡谷风景、在地体验和真实游客反馈完成内容转化。";
  const publishTimeSuggestion = row.trend === "rising" || hotScore >= 80
    ? "建议今日 18:00—21:00 发布，最迟不超过 24 小时"
    : row.trend === "falling" ? "热度回落，不建议追发；可沉淀为常青选题" : "建议 24—48 小时内发布，优先安排午间或晚间活跃时段";
  const recommendation = relevancePercent >= 70
    ? `关联度较高，可围绕“${keyword}”快速制作景区内容。`
    : relevancePercent >= 50 ? `可借用“${keyword}”的内容结构，需强化新疆与峡谷场景。` : "与景区资源关联较弱，建议观察，不直接追热点。";

  return {
    relatedDegree: relevancePercent / 100,
    hotScore,
    recommendation,
    recommendedTopic,
    videoDirection,
    publishTimeSuggestion,
  };
}
