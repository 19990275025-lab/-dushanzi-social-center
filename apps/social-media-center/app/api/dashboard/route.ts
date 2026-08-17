import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange } from "@/lib/date-range";

const platforms = ["douyin", "kuaishou", "weibo"] as const;

type PlatformRow = {
  platform: string;
  followers: number;
  today_posts: number;
  views: number;
  interactions: number;
};

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const range = resolveDateRange(new URL(request.url).searchParams);

  const [accountResult, postResult, progressResult, topPostsResult, topicsResult, pendingResult] =
    await Promise.all([
      d1.prepare(`
        SELECT platform, COALESCE(SUM(followers_count), 0) AS followers
        FROM social_accounts
        WHERE status = 'active' AND platform IN ('douyin', 'kuaishou', 'weibo')
        GROUP BY platform
      `).all<{ platform: string; followers: number }>(),
      d1.prepare(`
        SELECT platform,
          COUNT(*) AS today_posts,
          COALESCE(SUM(views), 0) AS views,
          COALESCE(SUM(likes + comments + favorites + shares), 0) AS interactions
        FROM social_posts
        WHERE platform IN ('douyin', 'kuaishou', 'weibo')
          AND date(publish_time) BETWEEN date(?) AND date(?)
        GROUP BY platform
      `).bind(range.from, range.to).all<Omit<PlatformRow, "followers">>(),
      d1.prepare(`
        SELECT platform,
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('published', 'reviewed') THEN 1 ELSE 0 END) AS completed
        FROM content_tasks
        WHERE platform IN ('douyin', 'kuaishou', 'weibo')
          AND date(task_date) BETWEEN date(?) AND date(?)
        GROUP BY platform
      `).bind(range.from, range.to).all<{ platform: string; total: number; completed: number }>(),
      d1.prepare(`
        SELECT id, platform, title, views, likes, comments, ai_analysis
        FROM social_posts
        WHERE platform IN ('douyin', 'kuaishou', 'weibo')
          AND date(publish_time) BETWEEN date(?) AND date(?)
        ORDER BY views DESC, likes DESC, comments DESC
        LIMIT 5
      `).bind(range.from, range.to).all<{
        id: number;
        platform: string;
        title: string;
        views: number;
        likes: number;
        comments: number;
        ai_analysis: string | null;
      }>(),
      d1.prepare(`
        SELECT id, platform, topic_name, heat_value, trend, ai_suggestion
        FROM hot_topics
        WHERE platform IN ('douyin', 'kuaishou', 'weibo')
        ORDER BY related_degree DESC, heat_value DESC
        LIMIT 5
      `).all<{
        id: number;
        platform: string;
        topic_name: string;
        heat_value: number;
        trend: string;
        ai_suggestion: string | null;
      }>(),
      d1.prepare(`
        SELECT COUNT(*) AS count
        FROM content_tasks
        WHERE platform IN ('douyin', 'kuaishou', 'weibo')
          AND status NOT IN ('published', 'reviewed')
          AND date(task_date) BETWEEN date(?) AND date(?)
      `).bind(range.from, range.to).first<{ count: number }>(),
    ]);

  const accountMap = new Map(accountResult.results.map((row) => [row.platform, row]));
  const postMap = new Map(postResult.results.map((row) => [row.platform, row]));
  const progressMap = new Map(progressResult.results.map((row) => [row.platform, row]));

  const overview = platforms.map((platform) => {
    const account = accountMap.get(platform);
    const post = postMap.get(platform);
    return {
      platform,
      followers: Number(account?.followers ?? 0),
      todayPosts: Number(post?.today_posts ?? 0),
      views: Number(post?.views ?? 0),
      interactions: Number(post?.interactions ?? 0),
    };
  });

  const progress = platforms.map((platform) => {
    const row = progressMap.get(platform);
    const total = Number(row?.total ?? 0);
    const completed = Number(row?.completed ?? 0);
    return {
      platform,
      total,
      completed,
      rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  const topPosts = topPostsResult.results.map((post) => ({
    ...post,
    aiAnalysis: post.ai_analysis ? JSON.parse(post.ai_analysis) : null,
    ai_analysis: undefined,
  }));

  return Response.json({
    updatedAt: new Date().toISOString(),
    range,
    overview,
    today: {
      published: overview.reduce((sum, item) => sum + item.todayPosts, 0),
      pending: Number(pendingResult?.count ?? 0),
      progress,
    },
    topPosts,
    topics: topicsResult.results,
    aiSuggestions: [
      "增加新疆旅游攻略类内容，承接近期自驾搜索热度。",
      "加强游客第一视角拍摄，突出峡谷尺度与临场感。",
      "优化视频前三秒吸引力，优先展示强视觉画面。",
    ],
  });
}
