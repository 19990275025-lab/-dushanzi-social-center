import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  WORKBUDDY_SOURCE_AGENT,
  analyzeWorkBuddyTopic,
  parseWorkBuddyExcel,
  parseWorkBuddyRows,
} from "@/lib/workbuddy-hot-topic";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const excelExtensions = new Set(["xlsx", "xls"]);

function headers() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-agent-key",
  };
}
function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...headers(), ...init?.headers } });
}

function authorized(request: Request) {
  const key = (env as unknown as { EXTERNAL_AGENT_API_KEY?: string }).EXTERNAL_AGENT_API_KEY?.trim();
  return !key || request.headers.get("x-agent-key") === key;
}

async function requestRows(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name) throw new Error("请上传 WorkBuddy JSON 或 Excel 文件");
    if (file.size > MAX_FILE_BYTES) throw new Error("文件不能超过 5MB");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "json") {
      const raw = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(raw)) throw new Error("WorkBuddy JSON 顶层必须是数组");
      return { ...parseWorkBuddyRows(raw as Array<Record<string, unknown>>), fileName: file.name, importType: "json" };
    }
    if (extension && excelExtensions.has(extension)) {
      return { ...parseWorkBuddyExcel(await file.arrayBuffer()), fileName: file.name, importType: "excel" };
    }
    throw new Error("仅支持 JSON、XLSX 或 XLS 文件");
  }

  if (!contentType.includes("application/json")) throw new Error("Content-Type 仅支持 application/json 或 multipart/form-data");
  const payload = await request.json() as unknown;
  const rawRows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: Array<Record<string, unknown>> }).data
      : [];
  return { ...parseWorkBuddyRows(rawRows as Array<Record<string, unknown>>), fileName: null, importType: "json" };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: headers() });
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Agent 密钥无效" }, { status: 401 });
  return json({
    service: "AI Agent数据接入中心 V1.0",
    endpoint: "/api/hot-topic/import",
    dataset: "HOT_TOPIC_DATA",
    sourceAgent: WORKBUDDY_SOURCE_AGENT,
    acceptedFiles: ["hot_topic_YYYYMMDD.json", "XLSX", "XLS"],
    fields: ["platform", "rank", "topic", "heat_value", "keyword", "url", "publish_time", "category"],
    aiFields: ["ai_relevance_score", "ai_analysis", "ai_recommendation"],
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "Agent 密钥无效" }, { status: 401 });
  await ensureDatabase();
  let parsed: Awaited<ReturnType<typeof requestRows>>;
  try {
    parsed = await requestRows(request);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "文件解析失败" }, { status: 400 });
  }
  if (!parsed.totalRows) return json({ error: "没有可导入的热点数据" }, { status: 400 });
  if (parsed.totalRows > 500) return json({ error: "单次最多导入 500 条热点" }, { status: 400 });
  if (parsed.errors.length) return json({ error: "热点数据校验失败，未写入数据库", errors: parsed.errors }, { status: 400 });

  const d1 = getD1();
  const posts = await d1.prepare(`
    SELECT title, hashtags FROM social_posts
    ORDER BY publish_time DESC, id DESC LIMIT 300
  `).all<{ title: string; hashtags: string | null }>();
  const historicalText = [
    ...posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`),
    ...parsed.rows.map((topic) => `${topic.topicTitle} ${topic.keyword} ${topic.category ?? ""}`),
  ].join(" ");
  const analyzed = parsed.rows.map((topic) => ({ topic, ai: analyzeWorkBuddyTopic(topic, historicalText) }));

  try {
    await d1.batch(analyzed.map(({ topic, ai }) => d1.prepare(`
      INSERT INTO HOT_TOPIC_DATA
        (platform, rank, topic_title, heat_value, keyword, url, publish_time,
         category, source_agent, ai_relevance_score, ai_analysis, ai_recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_agent, platform, topic_title, publish_time) DO UPDATE SET
        rank = excluded.rank, heat_value = excluded.heat_value, keyword = excluded.keyword,
        url = excluded.url, category = excluded.category,
        ai_relevance_score = excluded.ai_relevance_score,
        ai_analysis = excluded.ai_analysis, ai_recommendation = excluded.ai_recommendation
    `).bind(
      topic.platform, topic.rank, topic.topicTitle, topic.heatValue, topic.keyword,
      topic.url, topic.publishTime, topic.category, WORKBUDDY_SOURCE_AGENT,
      ai.relevanceScore,
      JSON.stringify({ worthFollowing: ai.worthFollowing, worthFollowingLabel: ai.worthFollowingLabel, analysis: ai.analysis }),
      JSON.stringify({ shootingDirection: ai.shootingDirection, shortVideoTitle: ai.shortVideoTitle, liveTheme: ai.liveTheme }),
    )));
  } catch (error) {
    console.error("WorkBuddy hot topic import failed", error);
    return json({ error: "WorkBuddy热点批量写入失败，未产生部分写入" }, { status: 500 });
  }

  return json({
    message: "WorkBuddy热点数据导入成功",
    dataset: "HOT_TOPIC_DATA",
    sourceAgent: WORKBUDDY_SOURCE_AGENT,
    fileName: parsed.fileName,
    importType: parsed.importType,
    receivedCount: parsed.totalRows,
    successCount: analyzed.length,
    errorCount: 0,
  }, { status: 201 });
}
