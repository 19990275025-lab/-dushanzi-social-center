import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { chinaToday, resolveDateRange } from "@/lib/date-range";
import { ruleBasedContentEngine, type AnalysisTopic } from "@/lib/content-analysis-engine";
import {
  buildBreakoutAnalysis,
  buildLowEfficiencyDiagnosis,
  interactionCount,
  percentage,
  type MonitorPost,
} from "@/lib/content-monitoring";

type PostRow = MonitorPost & {
  account_id: number;
  platform: string;
  fans_growth: number;
  hashtags: string;
  organic_views: number;
  paid_views: number;
  has_paid_traffic: number;
  data_availability_status: string;
  source_record_status: string;
};

type CommentRow = {
  post_id: number;
  captured_comments: number;
  positive_comments: number;
  negative_comments: number;
  keyword_text: string | null;
};

type FeedbackRow = {
  feedback_id: number;
  post_id: number;
  post_title: string;
  topic_id: number;
  topic_name: string;
  recommended_at: string;
  is_effective: number | null;
  effect_score: number | null;
  ai_summary: string | null;
};

const supportedPlatforms = new Set(["douyin", "kuaishou", "weibo"]);

function parseHashtags(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function topKeywords(value: string | null) {
  if (!value) return [];
  const counts = new Map<string, number>();
  for (const item of value.split("、").map((entry) => entry.trim()).filter(Boolean)) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([keyword]) => keyword);
}

export async function GET(request: Request) {
  await ensureDatabase();
  const searchParams = new URL(request.url).searchParams;
  const range = resolveDateRange(searchParams);
  const platform = searchParams.get("platform") ?? "douyin";
  if (!supportedPlatforms.has(platform)) {
    return Response.json({ error: "仅支持抖音、快手和微博内容监测" }, { status: 400 });
  }
  const today = chinaToday().iso;
  const d1 = getD1();

  const [postResult, topicResult, commentResult, feedbackResult, todayResult] = await Promise.all([
    d1.prepare(`
      WITH ranked_snapshots AS (
        SELECT s.*, ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY snapshot_time DESC, id DESC) AS snapshot_rank
        FROM social_post_snapshots s
      )
      SELECT p.id, p.account_id, p.platform, p.title, p.content_type, p.publish_time,
        COALESCE(s.play_count, p.views) AS views,
        COALESCE(s.like_count, p.likes) AS likes,
        COALESCE(s.comment_overview_count, p.comments) AS comments,
        COALESCE(s.favorite_count, p.favorites) AS favorites,
        COALESCE(s.share_count, p.shares) AS shares,
        COALESCE(s.follower_gain, p.fans_growth) AS fans_growth,
        p.hashtags, COALESCE(p.duration_seconds, p.duration) AS duration,
        COALESCE(t.completion_rate, p.completion_rate) AS completion_rate,
        COALESCE(t.swipe_away_rate, p.skip_rate) AS skip_rate,
        COALESCE((SELECT SUM(pt.play_count) FROM social_post_paid_traffic pt WHERE pt.snapshot_id = s.id),
          (SELECT SUM(ts.traffic_value) FROM social_post_traffic_sources ts
            WHERE ts.snapshot_id = s.id AND ts.traffic_nature = 'paid'), 0) AS paid_views,
        CASE
          WHEN EXISTS (SELECT 1 FROM social_post_paid_traffic pt WHERE pt.snapshot_id = s.id AND pt.relationship_to_overview = 'additional')
            THEN COALESCE(s.play_count, p.views)
          WHEN EXISTS (SELECT 1 FROM social_post_paid_traffic pt WHERE pt.snapshot_id = s.id AND pt.relationship_to_overview = 'included')
            THEN MAX(0, COALESCE(s.play_count, p.views) - COALESCE((SELECT SUM(pt.play_count) FROM social_post_paid_traffic pt WHERE pt.snapshot_id = s.id), 0))
          ELSE MAX(0, COALESCE(s.play_count, p.views) - COALESCE((SELECT SUM(ts.traffic_value)
            FROM social_post_traffic_sources ts WHERE ts.snapshot_id = s.id AND ts.traffic_nature = 'paid'), 0))
        END AS organic_views,
        CASE WHEN EXISTS (SELECT 1 FROM social_post_paid_traffic pt WHERE pt.snapshot_id = s.id)
          OR EXISTS (SELECT 1 FROM social_post_traffic_sources ts WHERE ts.snapshot_id = s.id AND ts.traffic_nature = 'paid')
          THEN 1 ELSE 0 END AS has_paid_traffic,
        COALESCE(s.data_availability_status, p.data_availability_status, 'unavailable') AS data_availability_status
        , COALESCE(s.source_record_status, CASE WHEN p.post_status = '私密' THEN 'private' ELSE 'normal' END) AS source_record_status
      FROM social_posts p
      INNER JOIN social_accounts a ON a.id = p.account_id
      LEFT JOIN ranked_snapshots s ON s.post_id = p.id AND s.snapshot_rank = 1
      LEFT JOIN social_post_traffic t ON t.snapshot_id = s.id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'
        AND date(p.publish_time) BETWEEN date(?) AND date(?)
      ORDER BY p.publish_time DESC, p.id DESC
      LIMIT 500
    `).bind(platform, range.from, range.to).all<PostRow>(),
    d1.prepare(`
      SELECT platform, topic_name, keyword, heat_value, trend, related_degree, ai_suggestion
      FROM hot_topics
      WHERE platform = ? AND status = 'active'
      ORDER BY heat_value DESC LIMIT 100
    `).bind(platform).all<AnalysisTopic>(),
    d1.prepare(`
      SELECT c.post_id, COUNT(*) AS captured_comments,
        SUM(CASE WHEN c.sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_comments,
        SUM(CASE WHEN c.sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_comments,
        GROUP_CONCAT(NULLIF(TRIM(c.keyword), ''), '、') AS keyword_text
      FROM social_comments c
      INNER JOIN social_posts p ON p.id = c.post_id
      INNER JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'
        AND date(p.publish_time) BETWEEN date(?) AND date(?)
      GROUP BY c.post_id
    `).bind(platform, range.from, range.to).all<CommentRow>(),
    d1.prepare(`
      SELECT f.id AS feedback_id, COALESCE(f.related_post_id, f.social_post_id) AS post_id,
        p.title AS post_title, h.id AS topic_id, h.topic_name, f.recommended_at,
        f.is_effective, f.effect_score, f.ai_summary
      FROM hot_topic_feedback f
      INNER JOIN hot_topics h ON h.id = f.hot_topic_id
      INNER JOIN social_posts p ON p.id = COALESCE(f.related_post_id, f.social_post_id)
      WHERE p.platform = ? AND date(p.publish_time) BETWEEN date(?) AND date(?)
      ORDER BY f.recommended_at DESC, f.id DESC
    `).bind(platform, range.from, range.to).all<FeedbackRow>(),
    d1.prepare(`SELECT COUNT(*) AS count FROM social_posts p JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%' AND date(p.publish_time) = date(?)`)
      .bind(platform, today).first<{ count: number }>(),
  ]);

  const commentByPost = new Map(commentResult.results.map((row) => [row.post_id, row]));
  const analyticalRows = postResult.results.filter((post) => !["private", "failed", "unavailable"].includes(post.source_record_status));
  const analyzedPosts = ruleBasedContentEngine.analyzePosts(
    analyticalRows.map((post) => ({
      id: post.id,
      account_id: post.account_id,
      platform: post.platform,
      title: post.title,
      content_type: post.content_type,
      publish_time: post.publish_time,
      views: post.organic_views,
      likes: post.likes,
      comments: post.comments,
      favorites: post.favorites,
      shares: post.shares,
      fans_growth: post.fans_growth,
      hashtags: parseHashtags(post.hashtags),
      duration: post.duration,
    })),
    topicResult.results,
  );
  const scoreById = new Map(analyzedPosts.map((post) => [post.id, post.overallScore]));

  const posts = analyticalRows.map((post) => {
    const comment = commentByPost.get(post.id);
    return {
      ...post,
      interactions: interactionCount(post),
      interactionRate: percentage(interactionCount(post), post.views),
      aiScore: scoreById.get(post.id) ?? 0,
      capturedComments: Number(comment?.captured_comments ?? 0),
      positiveComments: Number(comment?.positive_comments ?? 0),
      negativeComments: Number(comment?.negative_comments ?? 0),
      topKeywords: topKeywords(comment?.keyword_text ?? null),
    };
  });

  const totals = posts.reduce((summary, post) => ({
    views: summary.views + post.views,
    likes: summary.likes + post.likes,
    comments: summary.comments + post.comments,
    favorites: summary.favorites + post.favorites,
    shares: summary.shares + post.shares,
    interactions: summary.interactions + post.interactions,
    capturedComments: summary.capturedComments + post.capturedComments,
  }), { views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, interactions: 0, capturedComments: 0 });
  const averageOrganicViews = posts.length ? posts.reduce((total, post) => total + post.organic_views, 0) / posts.length : 0;
  const rankedPosts = [...posts]
    .sort((a, b) => b.organic_views - a.organic_views || b.interactions - a.interactions || b.aiScore - a.aiScore)
    .slice(0, 10);

  const breakoutCandidates = rankedPosts
    .filter((post, index) => index === 0 || post.organic_views >= averageOrganicViews || post.aiScore >= 70)
    .slice(0, 3)
    .map((post) => buildBreakoutAnalysis(post, averageOrganicViews));

  const lowEfficiency = posts
    .filter((post) => post.organic_views < averageOrganicViews * 0.7 || post.interactionRate < 2 || post.aiScore < 60)
    .sort((a, b) => a.aiScore - b.aiScore || a.views - b.views)
    .slice(0, 5)
    .map((post) => buildLowEfficiencyDiagnosis(post, averageOrganicViews));

  const latestPost = posts.map((post) => post.publish_time).sort().at(-1) ?? null;
  const hotLinks = feedbackResult.results.map((row) => ({
    ...row,
    effectiveness: row.is_effective === 1 ? "有效" : row.is_effective === 0 ? "无效" : "待评估",
  }));

  return Response.json({
    platform,
    range,
    summary: {
      todayPublished: Number(todayResult?.count ?? 0),
      periodPublished: postResult.results.length,
      ...totals,
      paidViews: posts.reduce((total, post) => total + post.paid_views, 0),
      organicViews: posts.reduce((total, post) => total + post.organic_views, 0),
      interactionRate: percentage(totals.interactions, totals.views),
    },
    topPosts: rankedPosts,
    breakoutAnalysis: breakoutCandidates,
    lowEfficiency,
    hotLinks,
    sourceFreshness: { latestPost, capturedCommentCount: totals.capturedComments },
    sources: ["social_posts", "social_post_snapshots", "social_post_traffic_sources", "social_post_paid_traffic", "social_comments", "hot_topic_feedback"],
    engine: ruleBasedContentEngine.name,
    updatedAt: new Date().toISOString(),
  });
}
