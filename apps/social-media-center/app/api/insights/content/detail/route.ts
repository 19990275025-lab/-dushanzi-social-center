import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

type PostRow = {
  id: number;
  platform: string;
  platform_post_id: string | null;
  title: string;
  content_type: string;
  post_type: string | null;
  publish_time: string;
  post_url: string | null;
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
  duration_seconds: number | null;
  completion_rate: number | null;
  average_play_duration: number | null;
  ai_analysis: string | null;
  updated_at: string;
};

type SnapshotRow = {
  id: number;
  snapshot_time: string;
  play_count: number | null;
  like_count: number | null;
  comment_overview_count: number | null;
  actual_loaded_count: number | null;
  comment_rows_count: number;
  favorite_count: number | null;
  share_count: number | null;
  danmaku_count: number | null;
  follower_gain: number | null;
  follower_loss: number | null;
  post_age_days: number;
  data_availability_status: string;
  traffic_availability_status: string;
  traffic_sources_availability_status: string;
  audience_availability_status: string;
  comment_keywords_availability_status: string;
  comments_availability_status: string;
};

type TrafficRow = {
  completion_rate: number | null;
  average_play_duration_seconds: number | null;
  two_sec_bounce_rate: number | null;
  five_sec_completion_rate: number | null;
  average_play_ratio: number | null;
  cover_click_rate: number | null;
  swipe_away_rate: number | null;
  page_entry_rate: number | null;
  comment_entry_rate: number | null;
  text_expand_rate: number | null;
  text_completion_rate: number | null;
  average_images_viewed: number | null;
  like_rate: number | null;
  comment_rate: number | null;
  share_rate: number | null;
  favorite_rate: number | null;
  not_interested_rate: number | null;
  data_availability_status: string;
};

type SourceRow = { source_name: string; traffic_value: number | null; percentage: number | null; change_percentage: number | null; traffic_nature: "organic" | "paid" | "other" };
type AudienceRow = { dimension_type: string; dimension_name: string; dimension_value: number | null; percentage: number | null; ranking: number | null };
type LegacyAudienceRow = { gender_distribution: string; age_distribution: string; region_distribution: string; collected_at: string };
type KeywordRow = { keyword: string; ranking: number | null; occurrence_count: number | null; sentiment: string | null; category: string | null };
type CommentRow = { id: number; username: string; comment_text: string | null; comment_type: string; comment_time: string | null; comment_time_raw: string | null; likes: number; reply_count: number; is_author: number; author_replied: number | null; sentiment: string; keyword: string | null; user_need: string | null };

function percent(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(2)) : null;
}

function parseDistribution(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const row = item as { label?: unknown; value?: unknown };
      return { name: String(row.label ?? ""), rate: Number(row.value), value: null };
    }).filter((item) => item.name && Number.isFinite(item.rate) && item.rate >= 0);
  } catch {
    return [];
  }
}

function availabilityNote(status: string | undefined, label: string) {
  if (status === "expired") return `抖音平台已不再提供该作品的完整${label}数据`;
  if (status === "partial") return `${label}仅展示平台当前仍可读取的真实字段`;
  if (status === "unavailable") return `抖音平台暂未提供该作品的${label}数据`;
  return `${label}来自最近一次 WorkBuddy 真实采集快照`;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "作品编号无效" }, { status: 400 });

  const d1 = getD1();
  const [post, snapshot, traffic, sourceResult, commentResult, audienceResult, legacyAudience, keywordResult] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, platform_post_id, title, content_type, post_type, publish_time,
        post_url, video_url, cover_url, views, likes, comments, favorites, shares,
        fans_growth, hashtags, duration, duration_seconds, completion_rate,
        average_play_duration, ai_analysis, updated_at
      FROM social_posts WHERE id = ? AND platform IN ('douyin','kuaishou','weibo') LIMIT 1
    `).bind(id).first<PostRow>(),
    d1.prepare(`SELECT id, snapshot_time, play_count, like_count, comment_overview_count,
      actual_loaded_count, comment_rows_count, favorite_count, share_count, danmaku_count,
      follower_gain, follower_loss, post_age_days, data_availability_status,
      traffic_availability_status, traffic_sources_availability_status,
      audience_availability_status, comment_keywords_availability_status,
      comments_availability_status
      FROM social_post_snapshots WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1`
    ).bind(id).first<SnapshotRow>(),
    d1.prepare(`SELECT completion_rate, average_play_duration_seconds, two_sec_bounce_rate,
      five_sec_completion_rate, average_play_ratio, cover_click_rate, swipe_away_rate,
      page_entry_rate, comment_entry_rate, text_expand_rate, text_completion_rate,
      average_images_viewed, like_rate, comment_rate, share_rate, favorite_rate,
      not_interested_rate, data_availability_status
      FROM social_post_traffic WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1`
    ).bind(id).first<TrafficRow>(),
    d1.prepare(`SELECT source_name, traffic_value, percentage, change_percentage, traffic_nature
      FROM social_post_traffic_sources WHERE snapshot_id = (
        SELECT id FROM social_post_snapshots WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1
      ) ORDER BY CASE traffic_nature WHEN 'paid' THEN 0 WHEN 'organic' THEN 1 ELSE 2 END, percentage DESC, id`
    ).bind(id).all<SourceRow>(),
    d1.prepare(`SELECT id, username, comment_text, comment_type, comment_time, comment_time_raw,
      likes, reply_count, is_author, author_replied, sentiment, keyword, user_need
      FROM social_comments WHERE post_id = ?
      ORDER BY likes DESC, COALESCE(comment_time, snapshot_time) DESC, id DESC LIMIT 100`
    ).bind(id).all<CommentRow>(),
    d1.prepare(`SELECT dimension_type, dimension_name, dimension_value, percentage, ranking
      FROM content_audience_analysis WHERE snapshot_id = (
        SELECT id FROM social_post_snapshots WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1
      ) AND dimension_type IS NOT NULL
      ORDER BY dimension_type, COALESCE(ranking, 999), id`
    ).bind(id).all<AudienceRow>(),
    d1.prepare(`SELECT gender_distribution, age_distribution, region_distribution, collected_at
      FROM content_audience_analysis WHERE post_id = ? AND snapshot_id IS NULL ORDER BY collected_at DESC, id DESC LIMIT 1`
    ).bind(id).first<LegacyAudienceRow>(),
    d1.prepare(`SELECT keyword, ranking, occurrence_count, sentiment, category
      FROM social_post_comment_keywords WHERE snapshot_id = (
        SELECT id FROM social_post_snapshots WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1
      ) ORDER BY COALESCE(ranking, 999), id`
    ).bind(id).all<KeywordRow>(),
  ]);

  if (!post) return Response.json({ error: "未找到该作品" }, { status: 404 });
  const views = snapshot?.play_count ?? post.views;
  const likes = snapshot?.like_count ?? post.likes;
  const comments = snapshot?.comment_overview_count ?? post.comments;
  const favorites = snapshot ? snapshot.favorite_count : post.favorites;
  const shares = snapshot?.share_count ?? post.shares;
  const knownInteractions = likes + comments + (favorites ?? 0) + shares;
  const completeInteractions = favorites !== null;
  const paidViews = sourceResult.results.filter((source: SourceRow) => source.traffic_nature === "paid")
    .reduce((total: number, source: SourceRow) => total + (source.traffic_value ?? 0), 0);
  const organicViews = Math.max(0, views - paidViews);
  const group = (type: string) => audienceResult.results.filter((item: AudienceRow) => item.dimension_type === type)
    .map((item: AudienceRow) => ({
      name: item.dimension_name,
      rate: item.percentage,
      value: item.dimension_value,
    }));
  const hasGenericAudience = audienceResult.results.length > 0;
  const audience = {
    gender: hasGenericAudience ? group("gender") : parseDistribution(legacyAudience?.gender_distribution ?? null),
    age: hasGenericAudience ? group("age") : parseDistribution(legacyAudience?.age_distribution ?? null),
    region: hasGenericAudience ? group("region") : parseDistribution(legacyAudience?.region_distribution ?? null),
    interest: group("interest"),
    device: group("device"),
    other: group("other"),
  };

  return Response.json({
    post: {
      ...post,
      post_url: post.post_url ?? post.video_url,
      duration: post.duration_seconds ?? post.duration,
      views,
      likes,
      comments,
      favorites,
      shares,
      interactions: completeInteractions ? knownInteractions : null,
      hasPaidTraffic: paidViews > 0,
      paidViews,
      organicViews,
    },
    snapshot,
    traffic: traffic ?? {
      completion_rate: post.completion_rate,
      average_play_duration_seconds: post.average_play_duration,
      data_availability_status: snapshot?.traffic_availability_status ?? "unavailable",
    },
    metrics: {
      interactionRate: completeInteractions ? percent(knownInteractions, views) : null,
      likeRate: percent(likes, views),
      commentRate: percent(comments, views),
      favoriteRate: favorites === null ? null : percent(favorites, views),
      shareRate: percent(shares, views),
      fanConversionRate: percent(snapshot?.follower_gain ?? post.fans_growth, views),
      collectedCommentCount: commentResult.results.length,
      actualLoadedCount: snapshot?.actual_loaded_count ?? commentResult.results.length,
      commentOverviewCount: comments,
    },
    keywords: keywordResult.results.map((item: KeywordRow) => ({ name: item.keyword, count: item.occurrence_count, rank: item.ranking, sentiment: item.sentiment, category: item.category })),
    comments: commentResult.results,
    trafficSources: sourceResult.results.map((item: SourceRow) => ({ name: item.source_name, value: item.traffic_value, rate: item.percentage, change: item.change_percentage, nature: item.traffic_nature })),
    audience,
    dataAvailability: {
      postAgeDays: snapshot?.post_age_days ?? null,
      overall: snapshot?.data_availability_status ?? "unavailable",
      traffic: snapshot?.traffic_availability_status ?? "unavailable",
      trafficSources: snapshot?.traffic_sources_availability_status ?? "unavailable",
      audience: snapshot?.audience_availability_status ?? (legacyAudience ? "available" : "unavailable"),
      commentKeywords: snapshot?.comment_keywords_availability_status ?? "unavailable",
      comments: snapshot?.comments_availability_status ?? "unavailable",
      notes: {
        traffic: availabilityNote(snapshot?.traffic_availability_status, "流量分析"),
        trafficSources: availabilityNote(snapshot?.traffic_sources_availability_status, "流量来源"),
        audience: availabilityNote(snapshot?.audience_availability_status, "观众画像"),
        commentKeywords: availabilityNote(snapshot?.comment_keywords_availability_status, "评论热词"),
      },
    },
    sources: ["social_posts", "social_post_snapshots", "social_post_traffic", "social_post_traffic_sources", "content_audience_analysis", "social_post_comment_keywords", "social_comments"],
    updatedAt: snapshot?.snapshot_time ?? post.updated_at,
  });
}
