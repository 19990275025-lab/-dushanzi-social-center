import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange } from "@/lib/date-range";
import { ruleBasedContentEngine, type AnalysisPost, type AnalysisTopic } from "@/lib/content-analysis-engine";

const platforms = ["douyin", "kuaishou", "weibo"] as const;
const contentTypeNames: Record<string, string> = { video: "短视频", image_text: "图文", text: "文字", article: "文章", live: "直播" };
const viralCategoryLabels = { tourism: "旅游类爆款", scenic: "景区类爆款", xinjiang: "新疆旅游爆款", nature: "自然风景爆款" } as const;

type PostRow = Omit<AnalysisPost, "hashtags"> & { hashtags: string };
type AccountRow = { platform: string; followers_count: number };
type ViralVideoRow = {
  id: number; platform: string; category: keyof typeof viralCategoryLabels; account_name: string | null;
  title: string; publish_time: string; video_url: string | null; views: number; likes: number;
  comments: number; favorites: number; shares: number; video_structure: string | null;
  title_pattern: string | null; first_three_seconds: string | null; shooting_method: string | null;
  interaction_method: string | null; comment_feedback: string | null; breakout_reason: string | null;
  replicable_elements: string | null; dushanzi_suggestion: string | null;
};

const interactionCount = (post: Pick<PostRow, "likes" | "comments" | "favorites" | "shares">) => post.likes + post.comments + post.favorites + post.shares;
const percent = (value: number, total: number) => total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;

function parseHashtags(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function contentCategory(post: Pick<PostRow, "title" | "content_type">) {
  const text = `${post.title} ${post.content_type}`;
  if (/攻略|路线|交通|门票|怎么玩|打卡|自驾|停车|行程/.test(text)) return "攻略内容";
  if (/挑战|玻璃桥|项目|体验|达瓦孜|漂流|穿越/.test(text)) return "项目体验";
  if (/游客|第一视角|问答|评论|互动|导游|相册|大家/.test(text)) return "游客互动";
  if (/活动|大赛|比赛|开幕|节庆|直播|优惠|招募|宣传/.test(text)) return "活动宣传";
  return "风景展示";
}

export async function GET(request: Request) {
  await ensureDatabase();
  const searchParams = new URL(request.url).searchParams;
  const range = resolveDateRange(searchParams);
  const requested = searchParams.get("platform") ?? "all";
  const platform = platforms.includes(requested as (typeof platforms)[number]) ? requested : "all";
  const d1 = getD1();

  const [postResult, accountResult, topicResult, viralResult] = await Promise.all([
    d1.prepare(`
      SELECT id, account_id, platform, title, content_type, publish_time, views, likes,
        comments, favorites, shares, fans_growth, hashtags, duration
      FROM social_posts
      WHERE date(publish_time) BETWEEN date(?) AND date(?)
      ORDER BY publish_time DESC, id DESC
      LIMIT 500
    `).bind(range.from, range.to).all<PostRow>(),
    d1.prepare("SELECT platform, followers_count FROM social_accounts WHERE status = 'active'").all<AccountRow>(),
    d1.prepare(`
      SELECT platform, topic_name, keyword, heat_value, trend, related_degree, ai_suggestion
      FROM hot_topics
      WHERE status = 'active' AND platform IN ('douyin', 'kuaishou', 'weibo')
      ORDER BY heat_value DESC LIMIT 100
    `).all<AnalysisTopic>(),
    d1.prepare(`
      SELECT id, platform, category, account_name, title, publish_time, video_url, views, likes,
        comments, favorites, shares, video_structure, title_pattern, first_three_seconds,
        shooting_method, interaction_method, comment_feedback, breakout_reason,
        replicable_elements, dushanzi_suggestion
      FROM viral_videos
      WHERE date(publish_time) BETWEEN date(?) AND date(?)
      ORDER BY views DESC, publish_time DESC, id DESC LIMIT 1000
    `).bind(range.from, range.to).all<ViralVideoRow>(),
  ]);

  const allPosts = postResult.results.filter((post) => platforms.includes(post.platform as (typeof platforms)[number]));
  const selectedPosts = platform === "all" ? allPosts : allPosts.filter((post) => post.platform === platform);
  const analyzed = ruleBasedContentEngine.analyzePosts(selectedPosts.map((post) => ({ ...post, hashtags: parseHashtags(post.hashtags) })), topicResult.results);
  const scoreById = new Map(analyzed.map((post) => [post.id, post]));

  const platformOverview = platforms.map((item) => {
    const rows = allPosts.filter((post) => post.platform === item);
    return {
      platform: item,
      postCount: rows.length,
      totalViews: rows.reduce((sum, post) => sum + post.views, 0),
      interactions: rows.reduce((sum, post) => sum + interactionCount(post), 0),
      fansGrowth: rows.reduce((sum, post) => sum + post.fans_growth, 0),
      followers: accountResult.results.filter((account) => account.platform === item).reduce((sum, account) => sum + account.followers_count, 0),
    };
  });

  const typeMap = new Map<string, { postCount: number; views: number; interactions: number; fansGrowth: number }>();
  const categoryMap = new Map<string, { postCount: number; views: number; interactions: number }>();
  for (const post of selectedPosts) {
    const type = typeMap.get(post.content_type) ?? { postCount: 0, views: 0, interactions: 0, fansGrowth: 0 };
    type.postCount += 1; type.views += post.views; type.interactions += interactionCount(post); type.fansGrowth += post.fans_growth;
    typeMap.set(post.content_type, type);
    const categoryName = contentCategory(post);
    const category = categoryMap.get(categoryName) ?? { postCount: 0, views: 0, interactions: 0 };
    category.postCount += 1; category.views += post.views; category.interactions += interactionCount(post);
    categoryMap.set(categoryName, category);
  }

  const contentTypes = [...typeMap.entries()].map(([contentType, value]) => ({ contentType, ...value })).sort((a, b) => b.views - a.views);
  const categoryOrder = ["风景展示", "项目体验", "游客互动", "攻略内容", "活动宣传"];
  const contentCategories = categoryOrder.map((category) => {
    const value = categoryMap.get(category) ?? { postCount: 0, views: 0, interactions: 0 };
    return { category, ...value, ratio: percent(value.postCount, selectedPosts.length) };
  });

  const totals = {
    postCount: selectedPosts.length,
    totalViews: selectedPosts.reduce((sum, post) => sum + post.views, 0),
    likes: selectedPosts.reduce((sum, post) => sum + post.likes, 0),
    comments: selectedPosts.reduce((sum, post) => sum + post.comments, 0),
    favorites: selectedPosts.reduce((sum, post) => sum + post.favorites, 0),
    shares: selectedPosts.reduce((sum, post) => sum + post.shares, 0),
    interactions: selectedPosts.reduce((sum, post) => sum + interactionCount(post), 0),
    fansGrowth: selectedPosts.reduce((sum, post) => sum + post.fans_growth, 0),
  };
  const interactionRate = percent(totals.interactions, totals.totalViews);
  const monitoredPosts = selectedPosts.map((post) => ({
    ...post,
    hashtags: parseHashtags(post.hashtags),
    category: contentCategory(post),
    interactions: interactionCount(post),
    interactionRate: percent(interactionCount(post), post.views),
    aiScore: scoreById.get(post.id)?.overallScore ?? 0,
  })).sort((a, b) => b.aiScore - a.aiScore || b.views - a.views);
  const topPosts = [...monitoredPosts].sort((a, b) => b.views - a.views || b.interactions - a.interactions).slice(0, 10);

  const bestType = contentTypes[0];
  const suggestions = selectedPosts.length === 0 ? ["该平台暂无作品数据，请先通过数据采集中心补充真实作品。"] : [
    bestType ? `优先复用${contentTypeNames[bestType.contentType] ?? bestType.contentType}内容结构，该类型贡献当前最高播放量。` : "持续补充不同内容类型，建立可比较样本。",
    interactionRate < 3 ? "整体互动率偏低，建议在前三秒设置问题，并在结尾加入明确评论引导。" : "互动表现良好，可把高互动作品拆解为系列选题并保持固定更新节奏。",
    totals.fansGrowth <= 0 ? "同步采集作品涨粉，建立内容效果与粉丝变化的关联。" : "围绕涨粉贡献最高的内容类型增加同主题连续发布。",
  ];

  const viralVideos = viralResult.results
    .filter((row) => platforms.includes(row.platform as (typeof platforms)[number]))
    .filter((row) => platform === "all" || row.platform === platform)
    .map((row) => ({
      ...row,
      categoryLabel: viralCategoryLabels[row.category],
      interactions: interactionCount(row),
      interactionRate: percent(interactionCount(row), row.views),
    }));
  const viralCategoryComparison = Object.entries(viralCategoryLabels).map(([category, label]) => {
    const rows = viralVideos.filter((row) => row.category === category);
    const views = rows.reduce((sum, row) => sum + row.views, 0);
    const interactions = rows.reduce((sum, row) => sum + row.interactions, 0);
    const first = (field: keyof ViralVideoRow) => rows.map((row) => row[field]).find((value) => typeof value === "string" && value.trim()) as string | undefined;
    return {
      category, label, sampleCount: rows.length, averageViews: rows.length ? Math.round(views / rows.length) : 0,
      interactionRate: percent(interactions, views), topVideo: rows[0] ? { id: rows[0].id, title: rows[0].title, views: rows[0].views } : null,
      videoStructure: first("video_structure"), titlePattern: first("title_pattern"), firstThreeSeconds: first("first_three_seconds"),
      shootingMethod: first("shooting_method"), interactionMethod: first("interaction_method"), commentFeedback: first("comment_feedback"),
      breakoutReason: first("breakout_reason"), replicableElements: first("replicable_elements"), dushanziSuggestion: first("dushanzi_suggestion"),
      status: rows.length ? "已接入" : "待采集",
    };
  });

  const bestPost = monitoredPosts[0];
  const dailyReport = {
    title: `${range.to} 内容监测报告`,
    excellentPost: bestPost ? { id: bestPost.id, title: bestPost.title, score: bestPost.aiScore, reason: bestPost.aiScore >= 75 ? "综合评分和传播表现领先" : "当前样本中相对表现最佳" } : null,
    problems: [totals.postCount === 0 ? "筛选周期内没有发布记录" : totals.postCount < 3 ? "发布样本较少，难以形成稳定判断" : "发布节奏基本稳定", interactionRate < 3 ? "互动率低于 3%" : "互动率达到基础健康线"],
    causes: [totals.postCount < 3 ? "内容频次不足，平台学习样本有限" : "需继续比较不同内容分类的持续表现", interactionRate < 3 ? "评论引导和可收藏信息不足" : "高互动结构尚需系列化验证"],
    suggestions,
  };

  return Response.json({
    platform, range, totals: { ...totals, interactionRate }, platformOverview, contentTypes, contentCategories,
    monitoredPosts, topPosts,
    contentFanRelations: contentTypes.map((item) => ({ ...item, fansPerTenThousandViews: item.views > 0 ? Number(((item.fansGrowth / item.views) * 10000).toFixed(2)) : 0 })),
    viralVideos, viralCategoryComparison, suggestions, dailyReport,
    sources: ["social_posts", "social_accounts", "hot_topics", "viral_videos"],
    engine: ruleBasedContentEngine.name,
    viralLibraryImportApi: "/api/imports",
    updatedAt: new Date().toISOString(),
  });
}
