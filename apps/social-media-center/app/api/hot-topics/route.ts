import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { calculateRelevance, ruleBasedTopicEngine, type TopicForAnalysis } from "@/lib/hot-topic-engine";

const platforms = new Set(["douyin", "kuaishou", "weibo", "web"]);
const topicTypes = new Set(["hot_rank", "planting_rank", "challenge_rank"]);
const dataSources = new Set(["douyin_hot_rank", "douyin_seed_rank", "douyin_challenge_rank", "douyin_content_hot"]);
const officialDouyinSources = ["douyin_hot_rank", "douyin_seed_rank", "douyin_challenge_rank"] as const;
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
  data_source: string | null;
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
  const dataSource = String(payload.dataSource ?? "").trim();
  const source = String(payload.source ?? "手工录入").trim();

  if (!platforms.has(platform)) return { error: "请选择有效平台" } as const;
  if (!topicName || topicName.length > 500) return { error: "热点名称不能为空且不能超过 500 字" } as const;
  if (!keyword || keyword.length > 255) return { error: "关键词不能为空且不能超过 255 字" } as const;
  if (!Number.isFinite(heatValue) || heatValue < 0) return { error: "热度必须是非负数" } as const;
  if (!trends.has(trend) || !statuses.has(status)) return { error: "趋势或状态无效" } as const;
  if (!topicTypes.has(topicType)) return { error: "请选择有效榜单类型" } as const;
  if (platform === "douyin" && !dataSources.has(dataSource)) return { error: "请选择有效的抖音数据来源" } as const;
  if (dataSource && !dataSources.has(dataSource)) return { error: "数据来源类型无效" } as const;
  if (!source || source.length > 255) return { error: "数据来源不能为空且不能超过 255 字" } as const;
  if (category.length > 128 || aiSuggestion.length > 2000) return { error: "分类或 AI 建议内容过长" } as const;
  const resolvedTopicType = dataSource === "douyin_seed_rank" ? "planting_rank"
    : dataSource === "douyin_challenge_rank" ? "challenge_rank"
      : dataSource ? "hot_rank" : topicType;
  return { value: { platform, topicName, keyword, heatValue, trend, category, aiSuggestion, status, topicType: resolvedTopicType, dataSource: dataSource || null, source } } as const;
}

const platformAnalysisContent = {
  all: { title: "平台热点跟进判断", summary: "综合官方榜单热度、传播周期与景区关联度，判断热点是否值得跟进，并避免将搜索内容热度当作平台趋势。", focus: "官方来源、传播周期、景区关联度" },
  douyin: { title: "抖音热点跟进判断", summary: "仅分析已标记为抖音热点榜、种草榜或挑战榜的数据，判断能否自然转化为景区短视频选题。", focus: "官方榜单、跟进时效、内容适配" },
  kuaishou: { title: "快手热点跟进判断", summary: "结合快手平台热点与景区真实体验，判断是否适合通过互动、直播或游客关系内容跟进。", focus: "平台热点、互动承接、用户关系" },
  weibo: { title: "微博热点跟进判断", summary: "结合微博热搜的公共传播价值与品牌风险，判断是否适合形成独山子大峡谷品牌话题。", focus: "热搜来源、品牌关联、传播风险" },
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
  const viewMode = params.get("view") === "content" ? "content" : "platform";
  const requestedDataSource = params.get("dataSource") ?? "all";
  const selectedDataSource = selectedPlatform === "douyin" && officialDouyinSources.includes(requestedDataSource as typeof officialDouyinSources[number]) ? requestedDataSource : "all";
  const conditions = ["platform IN ('douyin', 'kuaishou', 'weibo', 'web')"];
  const bindings: string[] = [];
  if (selectedPlatform !== "all") { conditions.push("platform = ?"); bindings.push(selectedPlatform); }
  if (viewMode === "content") {
    conditions.push("data_source = 'douyin_content_hot'");
  } else if (selectedPlatform === "douyin") {
    if (selectedDataSource === "all") conditions.push("data_source IN ('douyin_hot_rank','douyin_seed_rank','douyin_challenge_rank')");
    else { conditions.push("data_source = ?"); bindings.push(selectedDataSource); }
  } else if (selectedPlatform === "all") {
    conditions.push("((platform = 'douyin' AND data_source IN ('douyin_hot_rank','douyin_seed_rank','douyin_challenge_rank')) OR platform IN ('kuaishou','weibo','web'))");
  }
  const topicStatement = d1.prepare(`
      SELECT id, platform, topic_type, data_source, source, topic_name, keyword, heat_value, trend, category,
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
  const contentKeywords = [...new Set(currentTopics.map((topic) => topic.keyword).filter(Boolean))].slice(0, 12);
  const contentViral = [...currentTopics]
    .sort((a, b) => (b.related_degree ?? 0) - (a.related_degree ?? 0) || b.heat_value - a.heat_value)
    .slice(0, 6);
  const analysis = viewMode === "content"
    ? { title: "视频制作方向", summary: "根据热门视频、搜索热词与爆款内容，输出可落地的画面结构、标题表达和互动设计，不将内容热度冒充平台官方榜单。", focus: "前三秒、拍摄方式、标题和评论反馈", mode: "video_direction" }
    : { ...(platformAnalysisContent[selectedPlatform as keyof typeof platformAnalysisContent] ?? platformAnalysisContent.all), mode: "follow_up" };

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
    selectedDataSource,
    viewMode,
    platformAnalysis: analysis,
    contentHeat: {
      popularVideos: [...currentTopics].sort((a, b) => b.heat_value - a.heat_value).slice(0, 10),
      searchKeywords: contentKeywords,
      viralContent: contentViral,
    },
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
        (platform, topic_type, data_source, source, topic_name, keyword, heat_value, trend, category, related_degree,
          ai_suggestion, status, collect_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, platform, topic_type, data_source, source, topic_name, keyword, heat_value, trend, category,
        related_degree, ai_suggestion, status, collect_time, created_at
    `).bind(value.platform, value.topicType, value.dataSource, value.source, value.topicName, value.keyword, value.heatValue, value.trend,
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
      UPDATE hot_topics SET platform = ?, topic_type = ?, data_source = ?, source = ?, topic_name = ?, keyword = ?, heat_value = ?,
        trend = ?, category = ?, related_degree = ?, ai_suggestion = ?, status = ?,
        collect_time = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING id, platform, topic_type, data_source, source, topic_name, keyword, heat_value, trend, category,
        related_degree, ai_suggestion, status, collect_time, created_at
    `).bind(value.platform, value.topicType, value.dataSource, value.source, value.topicName, value.keyword, value.heatValue, value.trend,
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
