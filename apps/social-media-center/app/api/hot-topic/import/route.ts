import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  HOT_TOPIC_DATA,
  analyzeExternalHotTopic,
  normalizeExternalHotTopicRow,
  parseExternalHotTopicExcel,
  validateExternalHotTopics,
  type ExternalHotTopicRow,
} from "@/lib/external-hot-topic-import";

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const excelExtensions = new Set(["xlsx", "xls"]);

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-agent-key",
  };
}

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...corsHeaders(), ...init?.headers } });
}

function authorized(request: Request) {
  const apiKey = (env as unknown as { EXTERNAL_AGENT_API_KEY?: string }).EXTERNAL_AGENT_API_KEY?.trim();
  return !apiKey || request.headers.get("x-agent-key") === apiKey;
}

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

async function parseRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const formSourceAgent = String(form.get("source_agent") ?? form.get("sourceAgent") ?? "").trim();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name) throw new Error("请上传 Excel 文件");
    if (!excelExtensions.has(extensionOf(file.name)) || file.size > MAX_EXCEL_BYTES) {
      throw new Error("仅支持 5MB 以内的 XLSX/XLS 文件");
    }
    const parsedExcel = parseExternalHotTopicExcel(await file.arrayBuffer());
    if (parsedExcel.totalRows !== parsedExcel.rows.length) {
      throw new Error(`Excel 有 ${parsedExcel.totalRows - parsedExcel.rows.length} 行缺少平台、热点名称或有效热度`);
    }
    return { sourceAgent: formSourceAgent || parsedExcel.detectedSourceAgent, rows: parsedExcel.rows, inputCount: parsedExcel.totalRows, importType: "excel" as const, fileName: file.name };
  }

  if (!contentType.includes("application/json")) throw new Error("Content-Type 仅支持 application/json 或 multipart/form-data");
  const payload = await request.json() as Record<string, unknown> | Array<Record<string, unknown>>;
  const sourceAgent = Array.isArray(payload) ? "" : String(payload.source_agent ?? payload.sourceAgent ?? "").trim();
  const rawRows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data) ? payload.data
    : Array.isArray(payload.topics) ? payload.topics
    : [];
  const rows = rawRows
    .map((row, index) => row && typeof row === "object" ? normalizeExternalHotTopicRow(row as Record<string, unknown>, index + 1) : null)
    .filter((row): row is ExternalHotTopicRow => row !== null);
  if (rawRows.length !== rows.length) throw new Error(`有 ${rawRows.length - rows.length} 条数据缺少平台、热点名称或有效热度`);
  return { sourceAgent, rows, inputCount: rawRows.length, importType: "json" as const, fileName: null };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Agent 密钥无效" }, { status: 401 });
  return json({
    endpoint: "/api/hot-topic/import",
    method: "POST",
    dataset: "HOT_TOPIC_DATA",
    physicalTable: HOT_TOPIC_DATA,
    acceptedFormats: ["application/json", "multipart/form-data: XLSX/XLS"],
    platforms: ["douyin", "kuaishou", "weibo", "web"],
    required: ["source_agent", "platform", "topic_name", "heat_value"],
    optional: ["keyword", "ranking", "trend", "category", "collect_time", "source_url", "source_record_id"],
    example: {
      source_agent: "WorkBuddy抖音热点Agent",
      data: [{ platform: "douyin", topic_name: "新疆自驾旅行", keyword: "新疆旅游", heat_value: 9860000, ranking: 3, trend: "rising" }],
    },
    aiOutputs: ["hot_score", "related_degree", "recommended_topic", "video_direction", "publish_time_suggestion"],
    authentication: "配置 EXTERNAL_AGENT_API_KEY 后，请通过 x-agent-key 请求头传入密钥",
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "Agent 密钥无效" }, { status: 401 });
  await ensureDatabase();

  let parsed: Awaited<ReturnType<typeof parseRequest>>;
  try {
    parsed = await parseRequest(request);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "导入内容无法解析" }, { status: 400 });
  }

  const validationErrors = validateExternalHotTopics(parsed.rows, parsed.sourceAgent);
  if (validationErrors.length) return json({ error: "热点数据校验失败", errors: validationErrors }, { status: 400 });

  const d1 = getD1();
  const posts = await d1.prepare(`
    SELECT title, hashtags FROM social_posts
    WHERE platform IN ('douyin', 'kuaishou', 'weibo')
    ORDER BY publish_time DESC, id DESC LIMIT 300
  `).all<{ title: string; hashtags: string | null }>();
  const historicalText = posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`).join(" ");
  const analyzedRows = parsed.rows.map((row) => ({ row, analysis: analyzeExternalHotTopic(row, historicalText) }));

  try {
    await d1.batch(analyzedRows.map(({ row, analysis }) => d1.prepare(`
      INSERT INTO hot_topics
        (platform, topic_name, keyword, heat_value, ranking, trend, category,
         related_degree, ai_suggestion, hot_score, recommended_topic, video_direction,
         publish_time_suggestion, status, source_url, source_record_id, source_agent,
         raw_payload, collect_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(platform, topic_name) DO UPDATE SET
        keyword = excluded.keyword, heat_value = excluded.heat_value,
        ranking = excluded.ranking, trend = excluded.trend, category = excluded.category,
        related_degree = excluded.related_degree, ai_suggestion = excluded.ai_suggestion,
        hot_score = excluded.hot_score, recommended_topic = excluded.recommended_topic,
        video_direction = excluded.video_direction,
        publish_time_suggestion = excluded.publish_time_suggestion,
        status = 'active', source_url = excluded.source_url,
        source_record_id = COALESCE(excluded.source_record_id, hot_topics.source_record_id),
        source_agent = excluded.source_agent, raw_payload = excluded.raw_payload,
        collect_time = excluded.collect_time
    `).bind(
      row.platform, row.topicName, row.keyword, row.heatValue, row.ranking, row.trend,
      row.category, analysis.relatedDegree, analysis.recommendation, analysis.hotScore,
      analysis.recommendedTopic, analysis.videoDirection, analysis.publishTimeSuggestion,
      row.sourceUrl, row.sourceRecordId, parsed.sourceAgent,
      JSON.stringify(row.rawPayload).slice(0, 20_000), row.collectTime,
    )));
  } catch (error) {
    console.error("external hot-topic import failed", error);
    return json({ error: "热点批量写入失败，数据库未产生部分写入" }, { status: 500 });
  }

  return json({
    message: "外部 Agent 热点数据导入成功",
    dataset: "HOT_TOPIC_DATA",
    sourceAgent: parsed.sourceAgent,
    importType: parsed.importType,
    fileName: parsed.fileName,
    receivedCount: parsed.inputCount,
    successCount: analyzedRows.length,
    errorCount: 0,
    analysis: analyzedRows.map(({ row, analysis }) => ({
      platform: row.platform,
      topicName: row.topicName,
      hotScore: analysis.hotScore,
      relatedDegree: Math.round(analysis.relatedDegree * 100),
      recommendedTopic: analysis.recommendedTopic,
      videoDirection: analysis.videoDirection,
      publishTimeSuggestion: analysis.publishTimeSuggestion,
    })),
  }, { status: 201 });
}
