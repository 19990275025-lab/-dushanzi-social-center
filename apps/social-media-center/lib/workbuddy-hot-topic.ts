import * as XLSX from "xlsx";
import { calculateRelevance } from "@/lib/hot-topic-engine";

export const WORKBUDDY_SOURCE_AGENT = "WorkBuddy热点监测Agent";

export type WorkBuddyPlatform = "douyin" | "kuaishou" | "weibo" | "web";
export type WorkBuddyHotTopic = {
  rowNumber: number;
  platform: WorkBuddyPlatform;
  rank: number;
  topicTitle: string;
  heatValue: string;
  keyword: string;
  url: string | null;
  publishTime: string | null;
  category: string | null;
  sourceAgent: typeof WORKBUDDY_SOURCE_AGENT;
};

export type WorkBuddyAiResult = {
  relevanceScore: number;
  worthFollowing: boolean;
  worthFollowingLabel: string;
  analysis: string;
  shootingDirection: string;
  shortVideoTitle: string;
  liveTheme: string;
};

const platformMap: Record<string, WorkBuddyPlatform> = {
  抖音: "douyin", douyin: "douyin",
  快手: "kuaishou", kuaishou: "kuaishou",
  微博: "weibo", weibo: "weibo",
  全网: "web", web: "web", all: "web",
};

function value(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return row[key];
  return undefined;
}

export function normalizeWorkBuddyTopic(raw: Record<string, unknown>, rowNumber: number): WorkBuddyHotTopic | null {
  const platformText = String(value(raw, ["platform", "平台"]) ?? "").trim();
  const platform = platformMap[platformText] ?? platformMap[platformText.toLowerCase()];
  const rank = Number(value(raw, ["rank", "ranking", "排名"]));
  const topicTitle = String(value(raw, ["topic", "topic_title", "topicName", "热点标题", "热点名称"]) ?? "").trim();
  const heatValue = String(value(raw, ["heat_value", "heatValue", "热度"]) ?? "").trim();
  if (!platform || !Number.isInteger(rank) || rank <= 0 || !topicTitle || !heatValue) return null;
  return {
    rowNumber,
    platform,
    rank,
    topicTitle: topicTitle.slice(0, 500),
    heatValue: heatValue.slice(0, 255),
    keyword: String(value(raw, ["keyword", "关键词"]) ?? topicTitle).trim().slice(0, 500),
    url: String(value(raw, ["url", "链接", "来源链接"]) ?? "").trim().slice(0, 2000) || null,
    publishTime: String(value(raw, ["publish_time", "publishTime", "发布时间"]) ?? "").trim().slice(0, 128) || null,
    category: String(value(raw, ["category", "分类"]) ?? "").trim().slice(0, 128) || null,
    sourceAgent: WORKBUDDY_SOURCE_AGENT,
  };
}

export function parseWorkBuddyRows(rawRows: Array<Record<string, unknown>>) {
  const rows = rawRows.map((row, index) => normalizeWorkBuddyTopic(row, index + 1));
  const errors = rows.flatMap((row, index) => row ? [] : [{ rowNumber: index + 1, message: "平台、排名、热点标题或热度格式无效" }]);
  return { rows: rows.filter((row): row is WorkBuddyHotTopic => row !== null), errors, totalRows: rawRows.length };
}

export function parseWorkBuddyExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [], errors: [{ rowNumber: 0, message: "Excel 没有工作表" }], totalRows: 0 };
  return parseWorkBuddyRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
}

function heatSignal(raw: string) {
  const flames = (raw.match(/🔥/g) ?? []).length;
  let score = flames * 14;
  const numeric = raw.replace(/,/g, "").match(/([\d.]+)\s*(亿|千万|万)/);
  if (numeric) {
    const amount = Number(numeric[1]) * (numeric[2] === "亿" ? 100_000_000 : numeric[2] === "千万" ? 10_000_000 : 10_000);
    score = Math.max(score, Math.min(100, 25 + Math.log10(amount + 1) * 9));
  }
  if (/热搜|千万级|全网热/.test(raw)) score = Math.max(score, 92);
  else if (/高/.test(raw)) score = Math.max(score, 72);
  else if (/中高/.test(raw)) score = Math.max(score, 60);
  return Math.min(100, Math.round(score || 45));
}

export function analyzeWorkBuddyTopic(topic: WorkBuddyHotTopic, historicalText: string): WorkBuddyAiResult {
  const relevanceScore = calculateRelevance({
    topicName: topic.topicTitle,
    keyword: topic.keyword,
    category: topic.category,
    historicalText,
  });
  const signal = heatSignal(topic.heatValue);
  const worthFollowing = relevanceScore >= 62 && signal >= 55;
  const keyword = topic.keyword.split(/[,，、]/).filter(Boolean)[0] || topic.topicTitle;
  const analysis = relevanceScore >= 80
    ? "热点与独山子大峡谷、新疆旅游或景区核心资源高度相关，可快速跟进。"
    : relevanceScore >= 62
      ? "热点具备旅游场景转化空间，建议结合峡谷实景与游客体验跟进。"
      : "热点与景区资源关联有限，建议只借鉴表达方式，不直接追题。";
  return {
    relevanceScore,
    worthFollowing,
    worthFollowingLabel: worthFollowing ? "值得跟进" : "暂不直接跟进",
    analysis,
    shootingDirection: worthFollowing
      ? "前三秒呈现峡谷最具冲击力的航拍或游客反应，中段补充路线、项目和安全提示，结尾设置评论互动。"
      : "提取热点的标题结构与情绪钩子，替换为独山子大峡谷真实风景、项目体验和游客反馈。",
    shortVideoTitle: `在独山子大峡谷遇见${keyword}｜新疆旅行真实体验`,
    liveTheme: `独山子大峡谷云游直播：${keyword}与暑期游玩答疑`,
  };
}

