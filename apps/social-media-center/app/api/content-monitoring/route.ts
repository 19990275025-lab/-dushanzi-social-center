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
  const today = chinaToday().iso;
  const d1 = getD1();

  const [postResult, topicResult, commentResult, feedbackResult, todayResult] = await Promise.all([
    d1.prepare(`
      SELECT id, account_id, platform, title, content_type, publish_time, views, likes,
        comments, favorites, shares, fans_growth, hashtags, duration, completion_rate, skip_rate
      FROM social_posts
      WHERE platform = 'douyin' AND date(publish_time) BETWEEN date(?) AND date(?)
      ORDER BY publish_time DESC, id DESC
      LIMIT 500
    `).bind(range.from, range.to).all<PostRow>(),
    d1.prepare(`
      SELECT platform, topic_name, keyword, heat_value, trend, related_degree, ai_suggestion
      FROM hot_topics
      WHERE platform = 'douyin' AND status = 'active'
      ORDER BY heat_value DESC LIMIT 100
    `).all<AnalysisTopic>(),
    d1.prepare(`
      SELECT c.post_id, COUNT(*) AS captured_comments,
        SUM(CASE WHEN c.sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_comments,
        SUM(CASE WHEN c.sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_comments,
        GROUP_CONCAT(NULLIF(TRIM(c.keyword), ''), '、') AS keyword_text
      FROM social_comments c
      INNER JOIN social_posts p ON p.id = c.post_id
      WHERE p.platform = 'douyin' AND date(p.publish_time) BETWEEN date(?) AND date(?)
      GROUP BY c.post_id
    `).bind(range.from, range.to).all<CommentRow>(),
    d1.prepare(`
      SELECT f.id AS feedback_id, COALESCE(f.related_post_id, f.social_post_id) AS post_id,
        p.title AS post_title, h.id AS topic_id, h.topic_name, f.recommended_at,
        f.is_effective, f.effect_score, f.ai_summary
      FROM hot_topic_feedback f
      INNER JOIN hot_topics h ON h.id = f.hot_topic_id
      INNER JOIN social_posts p ON p.id = COALESCE(f.related_post_id, f.social_post_id)
      WHERE p.platform = 'douyin' AND date(p.publish_time) BETWEEN date(?) AND date(?)
      ORDER BY f.recommended_at DESC, f.id DESC
    `).bind(range.from, range.to).all<FeedbackRow>(),
    d1.prepare("SELECT COUNT(*) AS count FROM social_posts WHERE platform = 'douyin' AND date(publish_time) = date(?)")
      .bind(today).first<{ count: number }>(),
  ]);

  const commentByPost = new Map(commentResult.results.map((row) => [row.post_id, row]));
  const analyzedPosts = ruleBasedContentEngine.analyzePosts(
    postResult.results.map((post) => ({
      id: post.id,
      account_id: post.account_id,
      platform: post.platform,
      title: post.title,
      content_type: post.content_type,
      publish_time: post.publish_time,
      views: post.views,
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

  const posts = postResult.results.map((post) => {
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
  const averageViews = posts.length ? totals.views / posts.length : 0;
  const rankedPosts = [...posts]
    .sort((a, b) => b.views - a.views || b.interactions - a.interactions || b.aiScore - a.aiScore)
    .slice(0, 10);

  const breakoutCandidates = rankedPosts
    .filter((post, index) => index === 0 || post.views >= averageViews || post.aiScore >= 70)
    .slice(0, 3)
    .map((post) => buildBreakoutAnalysis(post, averageViews));

  const lowEfficiency = posts
    .filter((post) => post.views < averageViews * 0.7 || post.interactionRate < 2 || post.aiScore < 60)
    .sort((a, b) => a.aiScore - b.aiScore || a.views - b.views)
    .slice(0, 5)
    .map((post) => buildLowEfficiencyDiagnosis(post, averageViews));

  const latestPost = posts.map((post) => post.publish_time).sort().at(-1) ?? null;
  const hotLinks = feedbackResult.results.map((row) => ({
    ...row,
    effectiveness: row.is_effective === 1 ? "有效" : row.is_effective === 0 ? "无效" : "待评估",
  }));

  return Response.json({
    platform: "douyin",
    range,
    summary: {
      todayPublished: Number(todayResult?.count ?? 0),
      periodPublished: posts.length,
      ...totals,
      interactionRate: percentage(totals.interactions, totals.views),
    },
    topPosts: rankedPosts,
    breakoutAnalysis: breakoutCandidates,
    lowEfficiency,
    hotLinks,
    sourceFreshness: { latestPost, capturedCommentCount: totals.capturedComments },
    sources: ["social_posts", "social_comments", "hot_topic_feedback"],
    engine: ruleBasedContentEngine.name,
    updatedAt: new Date().toISOString(),
  });
}
