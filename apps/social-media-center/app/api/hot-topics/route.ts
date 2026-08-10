import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { calculateRelevance, ruleBasedTopicEngine, type TopicForAnalysis } from "@/lib/hot-topic-engine";

const platforms = new Set(["douyin", "kuaishou", "weibo", "web"]);
const topicTypes = new Set(["hot_rank", "planting_rank", "challenge_rank"]);
const trends = new Set(["rising", "stable", "falling", "new"]);
const statuses = new Set(["active", "paused", "archived"]);

type TopicRow = TopicForAnalysis & {
  id: number;
  ranking: number | null;
  ai_suggestion: string | null;
  status: string;
  collect_time: string;
  created_at: string;
  source_agent: string | null;
  topic_type: string;
  source: string;
  hot_score: number | null;
  recommended_topic: string | null;
  video_direction: string | null;
  publish_time_suggestion: string | null;
};

async function getHistoricalPosts() {
  const result = await getD1().prepare(`
    SELECT title, hashtags FROM social_posts
    WHERE platform IN ('douyin', 'kuaishou', 'weibo')
    ORDER BY publish_time DESC, id DESC LIMIT 200
  `).all<{ title: string; hashtags: string }>();
  return result.results;
}

function validatePayload(payload: Record<string, unknown>) {
  const platform = String(payload.platform ?? "").trim();
  const topicName = String(payload.topicName ?? "").trim();
  const keyword = String(payload.keyword ?? "").trim();
  const heatValue = Number(payload.heatValue);
  const trend = String(payload.trend ?? "new").trim();
  const category = String(payload.category ?? "").trim();
  const aiSuggestion = String(payload.aiSuggestion ?? "").trim();
  const status = String(payload.status ?? "active").trim();
  const topicType = String(payload.topicType ?? "hot_rank").trim();
  const source = String(payload.source ?? "手工录入").trim();

  if (!platforms.has(platform)) return { error: "请选择有效平台" } as const;
  if (!topicName || topicName.length > 500) return { error: "热点名称不能为空且不能超过 500 字" } as const;
  if (!keyword || keyword.length > 255) return { error: "关键词不能为空且不能超过 255 字" } as const;
  if (!Number.isFinite(heatValue) || heatValue < 0) return { error: "热度必须是非负数" } as const;
  if (!trends.has(trend) || !statuses.has(status)) return { error: "趋势或状态无效" } as const;
  if (!topicTypes.has(topicType)) return { error: "请选择有效榜单类型" } as const;
  if (!source || source.length > 255) return { error: "数据来源不能为空且不能超过 255 字" } as const;
  if (category.length > 128 || aiSuggestion.length > 2000) return { error: "分类或 AI 建议内容过长" } as const;
  return { value: { platform, topicName, keyword, heatValue, trend, category, aiSuggestion, status, topicType, source } } as const;
}

const platformAnalysisContent = {
  all: { title: "互联网趋势分析", summary: "综合观察抖音、快手、微博与全网热点，优先选择可自然连接新疆旅行、峡谷风景和游客体验的跨平台趋势。", focus: "跨平台热度、传播周期、景区关联度" },
  douyin: { title: "短视频内容机会", summary: "重点关注前三秒画面冲击力、挑战参与门槛和可收藏的新疆旅行信息，快速把热点转化为短视频选题。", focus: "短视频结构、种草表达、挑战参与" },
  kuaishou: { title: "互动运营建议", summary: "优先选择适合真实游客互动、直播连麦和评论接龙的话题，强化账号与用户之间的持续关系。", focus: "评论互动、直播承接、用户关系" },
  weibo: { title: "品牌传播建议", summary: "围绕新疆文旅事件、权威媒体话题和地域文化建立传播叙事，提升独山子大峡谷的品牌声量。", focus: "热点借势、品牌话题、媒体传播" },
} as const;

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE")) return Response.json({ error: "同一平台已存在同名热点" }, { status: 409 });
  console.error("hot-topics database error", error);
  return Response.json({ error: "热点数据保存失败" }, { status: 500 });
}

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const params = new URL(request.url).searchParams;
  const requestedPlatform = params.get("platform") ?? "all";
  const selectedPlatform = requestedPlatform === "all" || platforms.has(requestedPlatform) ? requestedPlatform : "all";
  const requestedTopicType = params.get("topicType") ?? "all";
  const selectedTopicType = selectedPlatform === "douyin" && topicTypes.has(requestedTopicType) ? requestedTopicType : "all";
  const conditions = ["platform IN ('douyin', 'kuaishou', 'weibo', 'web')"];
  const bindings: string[] = [];
  if (selectedPlatform !== "all") { conditions.push("platform = ?"); bindings.push(selectedPlatform); }
  if (selectedTopicType !== "all") { conditions.push("topic_type = ?"); bindings.push(selectedTopicType); }
  const topicStatement = d1.prepare(`
      SELECT id, platform, topic_type, source, topic_name, keyword, heat_value, trend, category,
        ranking, related_degree, ai_suggestion, status, source_agent, hot_score,
        recommended_topic, video_direction, publish_time_suggestion,
        collect_time, created_at
      FROM hot_topics
      WHERE ${conditions.join(" AND ")}
      ORDER BY CASE WHEN ranking IS NULL THEN 1 ELSE 0 END, ranking ASC, heat_value DESC, created_at DESC, id DESC
      LIMIT 300
    `);
  const [topicResult, posts] = await Promise.all([
    (bindings.length ? topicStatement.bind(...bindings) : topicStatement).all<TopicRow>(),
    getHistoricalPosts(),
  ]);
  const topics = topicResult.results;
  const activeTopics = topics.filter((topic) => topic.status === "active");
  const currentTopics = activeTopics.some((topic) => topic.ranking !== null)
    ? activeTopics.filter((topic) => topic.ranking !== null)
    : activeTopics;
  const postTitles = posts.map((post) => post.title);

  return Response.json({
    topics,
    ranking: [...currentTopics].sort((a, b) =>
      (a.ranking ?? Number.MAX_SAFE_INTEGER) - (b.ranking ?? Number.MAX_SAFE_INTEGER)
      || b.heat_value - a.heat_value).slice(0, 10),
    relationAnalysis: [...currentTopics]
      .sort((a, b) => (b.related_degree ?? 0) - (a.related_degree ?? 0))
      .slice(0, 8),
    recommendations: ruleBasedTopicEngine.generate(currentTopics, postTitles),
    recommendationEngine: ruleBasedTopicEngine.name,
    futureAiEndpoint: "/api/v1/social/ai/topic-recommendations",
    selectedPlatform,
    selectedTopicType,
    platformAnalysis: platformAnalysisContent[selectedPlatform as keyof typeof platformAnalysisContent] ?? platformAnalysisContent.all,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const parsed = validatePayload((await request.json()) as Record<string, unknown>);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const value = parsed.value;
  const posts = await getHistoricalPosts();
  const historicalText = posts.map((post) => `${post.title} ${post.hashtags ?? ""}`).join(" ");
  const relatedDegree = calculateRelevance({ ...value, historicalText }) / 100;

  try {
    const topic = await getD1().prepare(`
      INSERT INTO hot_topics
        (platform, topic_type, source, topic_name, keyword, heat_value, trend, category, related_degree,
          ai_suggestion, status, collect_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, platform, topic_type, source, topic_name, keyword, heat_value, trend, category,
        related_degree, ai_suggestion, status, collect_time, created_at
    `).bind(value.platform, value.topicType, value.source, value.topicName, value.keyword, value.heatValue, value.trend,
      value.category || null, relatedDegree, value.aiSuggestion || null, value.status).first();
    return Response.json({ topic }, { status: 201 });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PATCH(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as Record<string, unknown>;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "热点编号无效" }, { status: 400 });
  const parsed = validatePayload(payload);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const value = parsed.value;
  const posts = await getHistoricalPosts();
  const historicalText = posts.map((post) => `${post.title} ${post.hashtags ?? ""}`).join(" ");
  const relatedDegree = calculateRelevance({ ...value, historicalText }) / 100;

  try {
    const topic = await getD1().prepare(`
      UPDATE hot_topics SET platform = ?, topic_type = ?, source = ?, topic_name = ?, keyword = ?, heat_value = ?,
        trend = ?, category = ?, related_degree = ?, ai_suggestion = ?, status = ?,
        collect_time = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING id, platform, topic_type, source, topic_name, keyword, heat_value, trend, category,
        related_degree, ai_suggestion, status, collect_time, created_at
    `).bind(value.platform, value.topicType, value.source, value.topicName, value.keyword, value.heatValue, value.trend,
      value.category || null, relatedDegree, value.aiSuggestion || null, value.status, id).first();
    if (!topic) return Response.json({ error: "热点不存在" }, { status: 404 });
    return Response.json({ topic });
  } catch (error) {
    return databaseError(error);
  }
}

export async function DELETE(request: Request) {
  await ensureDatabase();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "热点编号无效" }, { status: 400 });
  const topic = await getD1().prepare("DELETE FROM hot_topics WHERE id = ? RETURNING id, topic_name")
    .bind(id).first();
  if (!topic) return Response.json({ error: "热点不存在" }, { status: 404 });
  return Response.json({ topic });
}
