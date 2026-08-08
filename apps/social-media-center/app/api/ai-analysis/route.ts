import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange } from "@/lib/date-range";
import {
  ruleBasedContentEngine,
  scoreWeights,
  type AnalysisPost,
  type AnalysisTopic,
  type AnalyzedPost,
} from "@/lib/content-analysis-engine";

const platforms = ["douyin", "kuaishou", "weibo", "wechat_channels"] as const;

type AccountRow = { platform: string; followers: number; account_count: number };

function parseHashtags(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(/[,，#、]+/).filter(Boolean);
  }
}

const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

function platformAdvice(platform: string, posts: AnalyzedPost[], account?: AccountRow) {
  if (!posts.length) {
    return {
      platform,
      hasData: false,
      followers: Number(account?.followers ?? 0),
      postCount: 0,
      totalViews: 0,
      averageScore: 0,
      advantage: "暂无作品数据，暂不判断平台优势。",
      recommendation: "先通过数据导入中心补充作品，再形成平台基准。",
    };
  }
  const totals = posts.reduce((result, post) => ({ views: result.views + post.views, interactions: result.interactions + post.likes + post.comments + post.favorites + post.shares }), { views: 0, interactions: 0 });
  const avgScore = average(posts.map((post) => post.overallScore));
  const avgDimensions = Object.keys(posts[0].dimensions).map((key) => ({ key, score: average(posts.map((post) => post.dimensions[key as keyof typeof post.dimensions])) })).sort((a, b) => b.score - a.score);
  const advantage = `${avgDimensions[0].key === "visualAttraction" ? "视觉吸引力" : avgDimensions[0].key === "titleQuality" ? "标题质量" : avgDimensions[0].key === "interactionAbility" ? "互动能力" : avgDimensions[0].key === "propagationAbility" ? "传播能力" : "热点匹配度"}是当前最强维度，平均单篇播放 ${Math.round(totals.views / posts.length).toLocaleString("zh-CN")}。`;
  const tailored: Record<string, string> = {
    douyin: "保持竖屏强视觉开场，用挑战、第一视角和路线攻略提升完播与评论。",
    kuaishou: "增加真实游客与工作人员出镜，强化在地感、连续栏目和评论互动。",
    weibo: "用热点话题串联图文与短视频，补充可转发的路线、天气和攻略信息。",
    wechat_channels: "突出可信讲解和完整游览信息，适合系列化讲解及私域转发。",
  };
  return {
    platform,
    hasData: true,
    followers: Number(account?.followers ?? 0),
    postCount: posts.length,
    totalViews: totals.views,
    interactions: totals.interactions,
    averageScore: avgScore,
    advantage,
    recommendation: tailored[platform],
  };
}

function buildReport(kind: "daily" | "weekly", posts: AnalyzedPost[], platformRows: ReturnType<typeof platformAdvice>[], periodLabel: string, topicAction?: string) {
  const periodPosts = posts;
  const excellentPosts = periodPosts.slice(0, 3).map((post) => ({ id: post.id, title: post.title, platform: post.platform, score: post.overallScore, views: post.views }));
  const keys = ["visualAttraction", "titleQuality", "interactionAbility", "propagationAbility", "hotMatch"] as const;
  const averages = keys.map((key) => ({ key, score: average(periodPosts.map((post) => post.dimensions[key])) })).sort((a, b) => a.score - b.score);
  const weak = averages[0];
  const weakName = weak?.key === "visualAttraction" ? "视觉吸引力" : weak?.key === "titleQuality" ? "标题质量" : weak?.key === "interactionAbility" ? "互动能力" : weak?.key === "propagationAbility" ? "传播能力" : "热点匹配度";
  const actions = periodPosts.length ? [
    `优先改善${weakName}，下个周期至少安排 1 条对照内容验证。`,
    "复用最高分作品的开场、叙事和信息结构，保留单一变量进行测试。",
    topicAction || "从高关联热点中选择一个关键词形成下一条内容。",
  ] : ["本周期暂无作品，请先完成发布或通过数据导入中心补充数据。", "数据补齐后再生成可执行优化结论。"];

  return {
    kind,
    title: kind === "daily" ? "AI 日报" : "AI 周报",
    periodLabel,
    postCount: periodPosts.length,
    accountPerformance: platformRows.map((row) => ({ platform: row.platform, followers: row.followers, postCount: periodPosts.filter((post) => post.platform === row.platform).length, views: periodPosts.filter((post) => post.platform === row.platform).reduce((sum, post) => sum + post.views, 0) })),
    excellentPosts,
    problemAnalysis: periodPosts.length ? `${weakName}是本周期相对薄弱维度，平均 ${weak.score} 分。该结论基于现有作品样本，需持续积累数据验证。` : "本周期没有可分析作品，暂不输出表现判断。",
    actions,
  };
}

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const range = resolveDateRange(new URL(request.url).searchParams);
  const [postResult, topicResult, accountResult] = await Promise.all([
    d1.prepare(`
      SELECT id, account_id, platform, title, content_type, publish_time,
        views, likes, comments, favorites, shares, fans_growth, hashtags, duration
      FROM social_posts
      WHERE date(publish_time) BETWEEN date(?) AND date(?)
      ORDER BY publish_time DESC, id DESC
      LIMIT 300
    `).bind(range.from, range.to).all<Omit<AnalysisPost, "hashtags"> & { hashtags: string | null }>(),
    d1.prepare(`
      SELECT platform, topic_name, keyword, heat_value, trend, related_degree, ai_suggestion
      FROM hot_topics
      WHERE status = 'active'
      ORDER BY related_degree DESC, heat_value DESC
      LIMIT 100
    `).all<AnalysisTopic>(),
    d1.prepare(`
      SELECT platform, SUM(followers_count) AS followers, COUNT(*) AS account_count
      FROM social_accounts WHERE status = 'active' GROUP BY platform
    `).all<AccountRow>(),
  ]);

  const posts: AnalysisPost[] = postResult.results.map((post) => ({ ...post, hashtags: parseHashtags(post.hashtags) }));
  const analyzedPosts = ruleBasedContentEngine.analyzePosts(posts, topicResult.results);
  const ideas = ruleBasedContentEngine.recommendTopics(topicResult.results, analyzedPosts);
  const accountMap = new Map(accountResult.results.map((row) => [row.platform, row]));
  const platformAnalysis = platforms.map((platform) => platformAdvice(platform, analyzedPosts.filter((post) => post.platform === platform), accountMap.get(platform)));
  const dimensionAverages = analyzedPosts.length ? {
    visualAttraction: average(analyzedPosts.map((post) => post.dimensions.visualAttraction)),
    titleQuality: average(analyzedPosts.map((post) => post.dimensions.titleQuality)),
    interactionAbility: average(analyzedPosts.map((post) => post.dimensions.interactionAbility)),
    propagationAbility: average(analyzedPosts.map((post) => post.dimensions.propagationAbility)),
    hotMatch: average(analyzedPosts.map((post) => post.dimensions.hotMatch)),
  } : { visualAttraction: 0, titleQuality: 0, interactionAbility: 0, propagationAbility: 0, hotMatch: 0 };

  return Response.json({
    summary: {
      postCount: analyzedPosts.length,
      totalViews: analyzedPosts.reduce((sum, post) => sum + post.views, 0),
      averageScore: average(analyzedPosts.map((post) => post.overallScore)),
      breakoutCount: analyzedPosts.filter((post) => post.viralScore >= 80).length,
      bestPost: analyzedPosts[0] ? { id: analyzedPosts[0].id, title: analyzedPosts[0].title, score: analyzedPosts[0].overallScore } : null,
    },
    scoreModel: { total: 100, weights: scoreWeights, dimensionAverages, note: "V1.0 使用播放与互动指标作为视觉和内容质量的代理变量，不包含画面识别。" },
    posts: analyzedPosts,
    platformAnalysis,
    topicRecommendations: ideas,
    reports: {
      daily: buildReport("daily", analyzedPosts, platformAnalysis, range.label, ideas[0] ? `围绕“${ideas[0].sourceTopic}”制作下一条内容。` : undefined),
      weekly: buildReport("weekly", analyzedPosts, platformAnalysis, range.label, ideas[0] ? `围绕“${ideas[0].sourceTopic}”规划系列内容。` : undefined),
    },
    engine: ruleBasedContentEngine.name,
    futureAiEndpoint: "/api/v1/social/ai/content-analysis",
    sources: ["social_posts", "hot_topics", "social_accounts"],
    range,
    updatedAt: new Date().toISOString(),
  });
}
