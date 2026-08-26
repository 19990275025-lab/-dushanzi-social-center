import { evaluateContentEffects, type ContentEffectEvaluation, type ContentEffectFact } from "@/lib/content-effect-evaluation";
import { DouyinEvaluationStrategy } from "@/lib/platform-evaluation-strategies";

type BaseRow = {
  id: number;
  account_id: number;
  platform: string;
  title: string;
  post_type: string | null;
  content_type: string;
  publish_time: string;
  duration_seconds: number | null;
  duration: number | null;
  master_views: number;
  master_likes: number;
  master_comments: number;
  master_favorites: number;
  master_shares: number;
  master_follower_gain: number;
  snapshot_id: number | null;
  snapshot_time: string | null;
  play_count: number | null;
  like_count: number | null;
  comment_overview_count: number | null;
  actual_loaded_count: number | null;
  comment_rows_count: number | null;
  favorite_count: number | null;
  share_count: number | null;
  follower_gain: number | null;
  source_record_status: string | null;
  data_availability_status: string | null;
  completion_rate: number | null;
  average_play_duration_seconds: number | null;
  two_sec_bounce_rate: number | null;
  five_sec_completion_rate: number | null;
  average_play_ratio: number | null;
  page_entry_rate: number | null;
  text_expand_rate: number | null;
  text_completion_rate: number | null;
  average_images_viewed: number | null;
};

type SourceRow = { post_id: number; source_name: string; percentage: number | null; traffic_value: number | null; traffic_nature: string };
type PaidRow = { post_id: number; campaign_type: string; play_count: number | null; relationship_to_overview: "additional" | "included" | "unknown"; data_availability_status: "available" | "partial" | "expired" | "unavailable" | "failed" };
type AudienceRow = { post_id: number; dimension_type: string; dimension_name: string; percentage: number | null; dimension_value: number | null };
type KeywordRow = { post_id: number; keyword: string; ranking: number | null };
type CommentRow = { post_id: number; comment_text: string | null; comment_type: string; likes: number | null; sentiment: string };
type SeriesRow = { post_id: number; metric_type: string; series_name: string; point_index: number; point_time: string | null; metric_value: number };

export type ContentEffectEvaluationResult = {
  evaluations: ContentEffectEvaluation[];
  summary: {
    participating: number;
    insufficient: number;
    paid: number;
    naturalBreakouts: number;
    paidAmplified: number;
    gradeCounts: Record<"S" | "A" | "B" | "C" | "D", number>;
  };
};

function groupBy<T extends { post_id: number }>(rows: T[]) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) grouped.set(row.post_id, [...(grouped.get(row.post_id) ?? []), row]);
  return grouped;
}

export async function loadContentEffectEvaluations(
  d1: D1Database,
  options: { platform: string; from?: string; to?: string; postId?: number },
): Promise<ContentEffectEvaluationResult> {
  const [baseResult, sourceResult, paidResult, audienceResult, keywordResult, commentResult, seriesResult] = await Promise.all([
    d1.prepare(`WITH latest_snapshots AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.post_id ORDER BY s.snapshot_time DESC, s.id DESC) AS rn
      FROM social_post_snapshots s
    )
    SELECT p.id, p.account_id, p.platform, p.title, p.post_type, p.content_type, p.publish_time,
      p.duration_seconds, p.duration, p.views AS master_views, p.likes AS master_likes,
      p.comments AS master_comments, p.favorites AS master_favorites, p.shares AS master_shares,
      p.fans_growth AS master_follower_gain, s.id AS snapshot_id, s.snapshot_time,
      s.play_count, s.like_count, s.comment_overview_count, s.actual_loaded_count,
      s.comment_rows_count, s.favorite_count, s.share_count, s.follower_gain,
      s.source_record_status, COALESCE(s.data_availability_status, p.data_availability_status) AS data_availability_status,
      t.completion_rate, t.average_play_duration_seconds, t.two_sec_bounce_rate,
      t.five_sec_completion_rate, t.average_play_ratio, t.page_entry_rate,
      t.text_expand_rate, t.text_completion_rate, t.average_images_viewed
    FROM social_posts p
    INNER JOIN social_accounts a ON a.id = p.account_id
    LEFT JOIN latest_snapshots s ON s.post_id = p.id AND s.rn = 1
    LEFT JOIN social_post_traffic t ON t.snapshot_id = s.id
    WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'
    ORDER BY p.publish_time DESC, p.id DESC`).bind(options.platform).all<BaseRow>(),
    d1.prepare(`WITH latest_snapshots AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.post_id ORDER BY s.snapshot_time DESC, s.id DESC) AS rn
      FROM social_post_snapshots s
    ) SELECT p.id AS post_id, ts.source_name, ts.percentage, ts.traffic_value, ts.traffic_nature
      FROM social_posts p JOIN latest_snapshots s ON s.post_id = p.id AND s.rn = 1
      JOIN social_post_traffic_sources ts ON ts.snapshot_id = s.id
      JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'`).bind(options.platform).all<SourceRow>(),
    d1.prepare(`WITH latest_snapshots AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.post_id ORDER BY s.snapshot_time DESC, s.id DESC) AS rn
      FROM social_post_snapshots s
    ) SELECT p.id AS post_id, pt.campaign_type, pt.play_count, pt.relationship_to_overview, pt.data_availability_status
      FROM social_posts p JOIN latest_snapshots s ON s.post_id = p.id AND s.rn = 1
      JOIN social_post_paid_traffic pt ON pt.snapshot_id = s.id
      JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'`).bind(options.platform).all<PaidRow>(),
    d1.prepare(`WITH latest_snapshots AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.post_id ORDER BY s.snapshot_time DESC, s.id DESC) AS rn
      FROM social_post_snapshots s
    ) SELECT p.id AS post_id, au.dimension_type, au.dimension_name, au.percentage, au.dimension_value
      FROM social_posts p JOIN latest_snapshots s ON s.post_id = p.id AND s.rn = 1
      JOIN social_post_audience au ON au.snapshot_id = s.id
      JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'`).bind(options.platform).all<AudienceRow>(),
    d1.prepare(`WITH latest_snapshots AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.post_id ORDER BY s.snapshot_time DESC, s.id DESC) AS rn
      FROM social_post_snapshots s
    ) SELECT p.id AS post_id, k.keyword, k.ranking
      FROM social_posts p JOIN latest_snapshots s ON s.post_id = p.id AND s.rn = 1
      JOIN social_post_comment_keywords k ON k.snapshot_id = s.id
      JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'`).bind(options.platform).all<KeywordRow>(),
    d1.prepare(`WITH latest_snapshots AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.post_id ORDER BY s.snapshot_time DESC, s.id DESC) AS rn
      FROM social_post_snapshots s
    ) SELECT p.id AS post_id, c.comment_text, c.comment_type,
      CASE WHEN c.likes_availability_status = 'available' THEN c.likes ELSE NULL END AS likes,
      c.sentiment FROM social_posts p JOIN social_comments c ON c.post_id = p.id
      LEFT JOIN latest_snapshots s ON s.post_id = p.id AND s.rn = 1
      JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'
        AND ((s.id IS NOT NULL AND c.snapshot_id = s.id)
          OR (s.id IS NULL AND c.snapshot_id IS NULL))`).bind(options.platform).all<CommentRow>(),
    d1.prepare(`WITH latest_snapshots AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.post_id ORDER BY s.snapshot_time DESC, s.id DESC) AS rn
      FROM social_post_snapshots s
    ) SELECT p.id AS post_id, ms.metric_type, ms.series_name, ms.point_index, ms.point_time, ms.metric_value
      FROM social_posts p JOIN latest_snapshots s ON s.post_id = p.id AND s.rn = 1
      JOIN social_post_metric_series ms ON ms.snapshot_id = s.id
      JOIN social_accounts a ON a.id = p.account_id
      WHERE p.platform = ? AND a.account_id NOT LIKE 'test_%'`).bind(options.platform).all<SeriesRow>(),
  ]);

  const sources = groupBy(sourceResult.results);
  const paid = groupBy(paidResult.results);
  const audience = groupBy(audienceResult.results);
  const keywords = groupBy(keywordResult.results);
  const comments = groupBy(commentResult.results);
  const series = groupBy(seriesResult.results);

  const facts: ContentEffectFact[] = baseResult.results.map((row) => {
    const recordStatus = row.source_record_status ?? "normal";
    const unavailable = ["private", "failed", "unavailable"].includes(recordStatus);
    return {
      id: row.id,
      accountId: row.account_id,
      platform: row.platform,
      title: row.title,
      postType: row.post_type ?? row.content_type,
      contentType: row.content_type,
      publishTime: row.publish_time,
      snapshotTime: row.snapshot_time,
      sourceRecordStatus: recordStatus,
      dataAvailabilityStatus: row.data_availability_status ?? (row.snapshot_id ? "partial" : "unavailable"),
      views: unavailable ? null : row.snapshot_id ? row.play_count : row.master_views,
      likes: unavailable ? null : row.snapshot_id ? row.like_count : row.master_likes,
      comments: unavailable ? null : row.snapshot_id ? row.comment_overview_count : row.master_comments,
      favorites: unavailable ? null : row.snapshot_id ? row.favorite_count : row.master_favorites,
      shares: unavailable ? null : row.snapshot_id ? row.share_count : row.master_shares,
      followerGain: unavailable ? null : row.snapshot_id ? row.follower_gain : row.master_follower_gain,
      durationSeconds: row.duration_seconds ?? row.duration,
      actualLoadedCount: row.actual_loaded_count,
      commentRowsCount: row.comment_rows_count ?? 0,
      traffic: {
        completionRate: row.completion_rate,
        averagePlayDurationSeconds: row.average_play_duration_seconds,
        twoSecBounceRate: row.two_sec_bounce_rate,
        fiveSecCompletionRate: row.five_sec_completion_rate,
        averagePlayRatio: row.average_play_ratio,
        pageEntryRate: row.page_entry_rate,
        textExpandRate: row.text_expand_rate,
        textCompletionRate: row.text_completion_rate,
        averageImagesViewed: row.average_images_viewed,
      },
      trafficSources: (sources.get(row.id) ?? []).map((item) => ({ name: item.source_name, percentage: item.percentage, value: item.traffic_value, nature: item.traffic_nature })),
      paidTraffic: (paid.get(row.id) ?? []).map((item) => ({ campaignType: item.campaign_type, playCount: item.play_count, relationshipToOverview: item.relationship_to_overview, availability: item.data_availability_status })),
      audience: (audience.get(row.id) ?? []).map((item) => ({ dimensionType: item.dimension_type, dimensionName: item.dimension_name, percentage: item.percentage, value: item.dimension_value })),
      commentKeywords: (keywords.get(row.id) ?? []).map((item) => ({ keyword: item.keyword, rank: item.ranking })),
      commentSamples: (comments.get(row.id) ?? []).map((item) => ({ text: item.comment_text, type: item.comment_type, likes: item.likes, sentiment: item.sentiment })),
      metricSeries: (series.get(row.id) ?? []).map((item) => ({ metricType: item.metric_type, seriesName: item.series_name, pointIndex: item.point_index, pointTime: item.point_time, value: item.metric_value })),
    };
  });

  const selectedIds = new Set(facts.filter((post) => {
    if (options.postId) return post.id === options.postId;
    if (!options.from || !options.to) return true;
    const date = post.publishTime.slice(0, 10);
    return date >= options.from && date <= options.to;
  }).map((post) => post.id));

  const evaluations: ContentEffectEvaluation[] = [];
  const byAccount = new Map<number, ContentEffectFact[]>();
  for (const post of facts) byAccount.set(post.accountId, [...(byAccount.get(post.accountId) ?? []), post]);
  for (const accountPosts of byAccount.values()) {
    // Kuaishou reads are dispatched before this legacy loader. Other old platform
    // callers keep their existing contract; this change must not refactor Weibo.
    evaluations.push(...(options.platform === "douyin"
      ? DouyinEvaluationStrategy.evaluate(accountPosts, selectedIds)
      : evaluateContentEffects(accountPosts, selectedIds)));
  }
  const rankable = evaluations.filter((item) => item.grade !== null);
  const gradeCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const item of rankable) gradeCounts[item.grade as keyof typeof gradeCounts] += 1;
  return {
    evaluations,
    summary: {
      participating: rankable.length,
      insufficient: rankable.filter((item) => item.labels.includes("数据不足")).length,
      paid: rankable.filter((item) => item.labels.includes("含付费流量")).length,
      naturalBreakouts: rankable.filter((item) => item.isNaturalBreakout).length,
      paidAmplified: rankable.filter((item) => item.isPaidAmplifiedHighPlay).length,
      gradeCounts,
    },
  };
}
