import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange } from "@/lib/date-range";

const platforms = ["douyin", "kuaishou", "weibo", "wechat_channels"] as const;
const contentTypeNames: Record<string, string> = {
  video: "短视频",
  image_text: "图文",
  text: "文字",
  article: "文章",
  live: "直播",
};

type PostRow = {
  id: number;
  platform: string;
  title: string;
  content_type: string;
  publish_time: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  fans_growth: number;
};

type AccountRow = { platform: string; followers_count: number };

function interactions(post: PostRow) {
  return post.likes + post.comments + post.favorites + post.shares;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const searchParams = new URL(request.url).searchParams;
  const range = resolveDateRange(searchParams);
  const requested = searchParams.get("platform") ?? "all";
  const platform = platforms.includes(requested as (typeof platforms)[number]) ? requested : "all";
  const d1 = getD1();

  const [postResult, accountResult] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, title, content_type, publish_time, views, likes,
        comments, favorites, shares, fans_growth
      FROM social_posts
      WHERE date(publish_time) BETWEEN date(?) AND date(?)
      ORDER BY publish_time DESC, id DESC
      LIMIT 500
    `).bind(range.from, range.to).all<PostRow>(),
    d1.prepare(`
      SELECT platform, followers_count
      FROM social_accounts
      WHERE status = 'active'
    `).all<AccountRow>(),
  ]);

  const allPosts = postResult.results;
  const selectedPosts = platform === "all"
    ? allPosts
    : allPosts.filter((post) => post.platform === platform);

  const platformOverview = platforms.map((item) => {
    const rows = allPosts.filter((post) => post.platform === item);
    return {
      platform: item,
      postCount: rows.length,
      totalViews: rows.reduce((sum, post) => sum + post.views, 0),
      interactions: rows.reduce((sum, post) => sum + interactions(post), 0),
      fansGrowth: rows.reduce((sum, post) => sum + post.fans_growth, 0),
      followers: accountResult.results
        .filter((account) => account.platform === item)
        .reduce((sum, account) => sum + account.followers_count, 0),
    };
  });

  const typeMap = new Map<string, { postCount: number; views: number; interactions: number; fansGrowth: number }>();
  for (const post of selectedPosts) {
    const current = typeMap.get(post.content_type) ?? { postCount: 0, views: 0, interactions: 0, fansGrowth: 0 };
    current.postCount += 1;
    current.views += post.views;
    current.interactions += interactions(post);
    current.fansGrowth += post.fans_growth;
    typeMap.set(post.content_type, current);
  }

  const contentTypes = [...typeMap.entries()]
    .map(([contentType, value]) => ({ contentType, ...value }))
    .sort((left, right) => right.views - left.views);
  const topPosts = [...selectedPosts]
    .sort((left, right) => right.views - left.views || interactions(right) - interactions(left))
    .slice(0, 10)
    .map((post) => ({ ...post, interactions: interactions(post) }));
  const totals = {
    postCount: selectedPosts.length,
    totalViews: selectedPosts.reduce((sum, post) => sum + post.views, 0),
    interactions: selectedPosts.reduce((sum, post) => sum + interactions(post), 0),
    fansGrowth: selectedPosts.reduce((sum, post) => sum + post.fans_growth, 0),
  };

  const bestType = contentTypes[0];
  const averageInteractionRate = totals.totalViews > 0 ? totals.interactions / totals.totalViews : 0;
  const suggestions = selectedPosts.length === 0
    ? ["该平台暂无作品数据，请先通过导入或采集中心补充真实作品。"]
    : [
        bestType
          ? `优先复用${contentTypeNames[bestType.contentType] ?? bestType.contentType}内容结构，该类型贡献当前最高播放量。`
          : "持续补充不同内容类型，以建立可比较的内容样本。",
        averageInteractionRate < 0.03
          ? "整体互动率偏低，建议在前三秒设置问题，并在结尾加入明确评论引导。"
          : "互动表现良好，可把高互动作品拆解为系列选题并保持固定更新节奏。",
        totals.fansGrowth <= 0
          ? "当前作品涨粉记录不足，后续采集需同步写入 fans_growth 以评估内容转粉。"
          : "围绕涨粉贡献最高的内容类型增加同主题、同镜头语言的连续发布。",
      ];

  return Response.json({
    platform,
    range,
    totals,
    platformOverview,
    contentTypes,
    topPosts,
    contentFanRelations: contentTypes.map((item) => ({
      ...item,
      fansPerTenThousandViews: item.views > 0
        ? Number(((item.fansGrowth / item.views) * 10000).toFixed(2))
        : 0,
    })),
    suggestions,
    sources: ["social_posts", "social_accounts"],
    engine: "content-user-rules-v1",
    updatedAt: new Date().toISOString(),
  });
}
