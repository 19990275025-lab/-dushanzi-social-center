import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { loadContentEffectEvaluations } from "@/lib/content-effect-evaluation-server";

type PostRow = {
  id: number;
  platform: string;
  platform_post_id: string | null;
  title: string;
  content_type: string;
  post_type: string | null;
  post_status: string | null;
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
  source_record_status: string;
  source_failure_reason: string | null;
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

type SourceRow = { source_name: string; traffic_value: number | null; percentage: number | null; change_percentage: number | null; traffic_nature: "organic" | "other" };
type AudienceRow = { dimension_type: string; dimension_name: string; dimension_value: number | null; percentage: number | null; ranking: number | null };
type LegacyAudienceRow = { gender_distribution: string; age_distribution: string; region_distribution: string; collected_at: string };
type KeywordRow = { keyword: string; ranking: number | null; occurrence_count: number | null; sentiment: string | null; category: string | null };
type CommentRow = { id: number; username: string; comment_text: string | null; comment_type: string; comment_time: string | null; comment_time_raw: string | null; likes: number | null; likes_availability_status: string; reply_count: number; is_author: number; author_replied: number | null; sentiment: string; keyword: string | null; user_need: string | null };
type PaidTrafficRow = { campaign_type: string; play_count: number | null; relationship_to_overview: "unknown" | "included" | "additional"; detail_available: number | null; data_availability_status: string };
type SeriesRow = { metric_type: string; series_name: string; point_index: number; point_time: string | null; point_label: string | null; metric_value: number; unit: string | null };

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

function availabilityNote(status: string | undefined, label: string, recordStatus?: string) {
  if (recordStatus === "private") return `该作品为私密作品，抖音不提供${label}数据`;
  if (recordStatus === "failed") return `${label}采集失败，系统保留真实失败状态且不写入 0`;
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
  const [post, snapshot, traffic, sourceResult, paidTraffic, seriesResult, commentResult, audienceResult, legacyAudience, keywordResult] = await Promise.all([
    d1.prepare(`
      SELECT id, platform, platform_post_id, title, content_type, post_type, post_status, publish_time,
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
      comments_availability_status, source_record_status, source_failure_reason
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
      ) ORDER BY CASE traffic_nature WHEN 'organic' THEN 0 ELSE 1 END, percentage DESC, id`
    ).bind(id).all<SourceRow>(),
    d1.prepare(`SELECT campaign_type, play_count, relationship_to_overview, detail_available, data_availability_status
      FROM social_post_paid_traffic WHERE snapshot_id = (
        SELECT id FROM social_post_snapshots WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1
      ) ORDER BY id`).bind(id).all<PaidTrafficRow>(),
    d1.prepare(`SELECT metric_type, series_name, point_index, point_time, point_label, metric_value, unit
      FROM social_post_metric_series WHERE snapshot_id = (
        SELECT id FROM social_post_snapshots WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1
      ) ORDER BY metric_type, series_name, point_index`).bind(id).all<SeriesRow>(),
    d1.prepare(`SELECT id, username, comment_text, comment_type, comment_time, comment_time_raw,
      CASE WHEN likes_availability_status = 'available' THEN likes ELSE NULL END AS likes,
      likes_availability_status, reply_count, is_author, author_replied, sentiment, keyword, user_need
      FROM social_comments WHERE post_id = ?
        AND ((snapshot_id IS NOT NULL AND snapshot_id = (
          SELECT id FROM social_post_snapshots WHERE post_id = ? ORDER BY snapshot_time DESC, id DESC LIMIT 1
        )) OR (snapshot_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM social_post_snapshots WHERE post_id = ?
        )))
      ORDER BY likes DESC, COALESCE(comment_time, snapshot_time) DESC, id DESC LIMIT 100`
    ).bind(id, id, id).all<CommentRow>(),
    d1.prepare(`SELECT dimension_type, dimension_name, dimension_value, percentage, ranking
      FROM social_post_audience WHERE snapshot_id = (
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
  const effectEvaluation = post.platform === "douyin"
    ? (await loadContentEffectEvaluations(d1, { platform: "douyin", postId: post.id })).evaluations[0] ?? null
    : null;
  const unavailableRecord = ["private", "failed", "unavailable"].includes(snapshot?.source_record_status ?? "");
  const views = unavailableRecord ? null : snapshot?.play_count ?? post.views;
  const likes = unavailableRecord ? null : snapshot?.like_count ?? post.likes;
  const comments = unavailableRecord ? null : snapshot?.comment_overview_count ?? post.comments;
  const favorites = unavailableRecord ? null : snapshot ? snapshot.favorite_count : post.favorites;
  const shares = unavailableRecord ? null : snapshot?.share_count ?? post.shares;
  const knownInteractions = (likes ?? 0) + (comments ?? 0) + (favorites ?? 0) + (shares ?? 0);
  const completeInteractions = likes !== null && comments !== null && favorites !== null && shares !== null;
  const paidViews = paidTraffic.results.reduce((total, row) => total + (row.play_count ?? 0), 0);
  const paidRelationship = paidTraffic.results.some((row) => row.relationship_to_overview === "included")
    ? "included" : paidTraffic.results.some((row) => row.relationship_to_overview === "additional") ? "additional" : "unknown";
  const organicViews = views === null ? null : paidViews === 0 ? views : paidRelationship === "additional" ? views : null;
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
    activity: group("activity"),
    attentionKeyword: group("attention_keyword"),
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
      paidTrafficRelationship: paidRelationship,
      totalExposure: paidRelationship === "additional" && views !== null ? views + paidViews : null,
    },
    snapshot,
    traffic: traffic ?? {
      completion_rate: post.completion_rate,
      average_play_duration_seconds: post.average_play_duration,
      data_availability_status: snapshot?.traffic_availability_status ?? "unavailable",
    },
    metrics: {
      interactionRate: completeInteractions && views !== null ? percent(knownInteractions, views) : null,
      likeRate: likes === null || views === null ? null : percent(likes, views),
      commentRate: comments === null || views === null ? null : percent(comments, views),
      favoriteRate: favorites === null || views === null ? null : percent(favorites, views),
      shareRate: shares === null || views === null ? null : percent(shares, views),
      fanConversionRate: views === null ? null : percent(snapshot?.follower_gain ?? post.fans_growth, views),
      collectedCommentCount: commentResult.results.length,
      actualLoadedCount: unavailableRecord ? null : snapshot?.actual_loaded_count ?? commentResult.results.length,
      commentOverviewCount: comments,
    },
    keywords: keywordResult.results.map((item: KeywordRow) => ({ name: item.keyword, count: item.occurrence_count, rank: item.ranking, sentiment: item.sentiment, category: item.category })),
    comments: commentResult.results,
    trafficSources: sourceResult.results.map((item: SourceRow) => ({ name: item.source_name, value: item.traffic_value, rate: item.percentage, change: item.change_percentage, nature: item.traffic_nature })),
    audience,
    metricSeries: seriesResult.results,
    effectEvaluation,
    paidTraffic: paidTraffic.results,
    dataAvailability: {
      postAgeDays: snapshot?.post_age_days ?? null,
      overall: snapshot?.data_availability_status ?? "unavailable",
      traffic: snapshot?.traffic_availability_status ?? "unavailable",
      trafficSources: snapshot?.traffic_sources_availability_status ?? "unavailable",
      audience: snapshot?.audience_availability_status ?? (legacyAudience ? "available" : "unavailable"),
      commentKeywords: snapshot?.comment_keywords_availability_status ?? "unavailable",
      comments: snapshot?.comments_availability_status ?? "unavailable",
      notes: {
        traffic: availabilityNote(snapshot?.traffic_availability_status, "流量分析", snapshot?.source_record_status),
        trafficSources: availabilityNote(snapshot?.traffic_sources_availability_status, "流量来源", snapshot?.source_record_status),
        audience: availabilityNote(snapshot?.audience_availability_status, "观众画像", snapshot?.source_record_status),
        commentKeywords: availabilityNote(snapshot?.comment_keywords_availability_status, "评论热词", snapshot?.source_record_status),
      },
    },
    sources: ["social_posts", "social_post_snapshots", "social_post_metric_series", "social_post_traffic", "social_post_traffic_sources", "social_post_paid_traffic", "social_post_audience", "social_post_comment_keywords", "social_comments", "social_comment_replies"],
    updatedAt: snapshot?.snapshot_time ?? post.updated_at,
  });
}
