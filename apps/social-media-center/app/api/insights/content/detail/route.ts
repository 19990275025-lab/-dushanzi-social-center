import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

type PostRow = {
  id: number;
  platform: string;
  title: string;
  content_type: string;
  publish_time: string;
  video_url: string | null;
  cover_url: string | null;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  fans_growth: number;
  hashtags: string;
  duration: number | null;
  ai_analysis: string | null;
  updated_at: string;
};

type CommentRow = {
  id: number;
  username: string;
  comment_text: string;
  comment_time: string;
  likes: number;
  sentiment: string;
  keyword: string | null;
  user_need: string | null;
};

function percent(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function parseList(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Imported data may store comma-separated keywords instead of JSON.
  }
  return value.split(/[,，、#\s]+/).map((item) => item.trim()).filter(Boolean);
}

export async function GET(request: Request) {
  await ensureDatabase();
  const rawId = new URL(request.url).searchParams.get("id");
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "作品编号无效" }, { status: 400 });

  const d1 = getD1();
  const [post, commentResult] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, title, content_type, publish_time, video_url, cover_url,
        views, likes, comments, favorites, shares, fans_growth, hashtags, duration,
        ai_analysis, updated_at
      FROM social_posts
      WHERE id = ?
      LIMIT 1
    `).bind(id).first<PostRow>(),
    d1.prepare(`
      SELECT id, username, comment_text, comment_time, likes, sentiment, keyword, user_need
      FROM social_comments
      WHERE post_id = ?
      ORDER BY likes DESC, comment_time DESC, id DESC
      LIMIT 100
    `).bind(id).all<CommentRow>(),
  ]);

  if (!post) return Response.json({ error: "未找到该作品" }, { status: 404 });

  const collectedComments = commentResult.results;
  const keywordCounts = new Map<string, number>();
  for (const keyword of parseList(post.hashtags)) keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
  for (const comment of collectedComments) {
    for (const keyword of parseList(comment.keyword)) keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
  }

  const interactions = post.likes + post.comments + post.favorites + post.shares;
  return Response.json({
    post: { ...post, interactions },
    metrics: {
      interactionRate: percent(interactions, post.views),
      likeRate: percent(post.likes, post.views),
      commentRate: percent(post.comments, post.views),
      favoriteRate: percent(post.favorites, post.views),
      shareRate: percent(post.shares, post.views),
      fanConversionRate: percent(post.fans_growth, post.views),
      collectedCommentCount: collectedComments.length,
    },
    keywords: [...keywordCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"))
      .slice(0, 20),
    comments: collectedComments,
    trafficSources: [],
    dataAvailability: {
      missing: ["完播率", "封面点击率", "主页进入率", "流量来源", "观众画像"],
      note: "当前采集数据不包含抖音创作者后台的专属流量与观众画像指标，相关位置显示待采集。",
    },
    sources: ["social_posts", "social_comments"],
    updatedAt: post.updated_at,
  });
}
