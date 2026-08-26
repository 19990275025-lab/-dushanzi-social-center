import type { DateRange } from "./date-range";
import type { KuaishouEvaluation } from "./kuaishou-evaluation";

type RecordRow = Record<string, unknown>;
const parse = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : null; } catch { return null; } };
const numeric = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const total = (rows: RecordRow[], key: string) => !rows.length || rows.some(r => numeric(r[key]) === null) ? null : rows.reduce((n, r) => n + Number(r[key]), 0);

/** Read-only adapter contract. Frozen Douyin formulas are never called for Kuaishou. */
export async function readKuaishouContent(d1: D1Database, range: DateRange) {
  const result = await d1.prepare(`WITH latest AS (
      SELECT s.*,ROW_NUMBER() OVER(PARTITION BY post_id ORDER BY snapshot_time DESC,id DESC) AS rn FROM social_post_snapshots s WHERE platform='kuaishou')
    SELECT p.id,p.platform,p.account_id,p.platform_post_id,p.title,p.publish_time,p.post_type,p.post_status,p.cover_url,p.duration_seconds,
      s.id AS snapshot_id,s.snapshot_time,s.play_count AS views,s.like_count AS likes,s.comment_overview_count AS comments,
      s.favorite_count AS favorites,s.share_count AS shares,s.follower_gain AS fans_growth,s.actual_loaded_count,s.raw_payload,
      e.raw_evaluation FROM social_posts p JOIN social_accounts a ON a.id=p.account_id
      LEFT JOIN latest s ON s.post_id=p.id AND s.rn=1 LEFT JOIN social_post_evaluations e ON e.snapshot_id=s.id AND e.platform='kuaishou'
    WHERE p.platform='kuaishou' AND a.platform='kuaishou' AND a.account_id NOT LIKE 'test_%'
      AND substr(p.publish_time,1,10) BETWEEN ? AND ? ORDER BY p.publish_time DESC,p.id DESC`).bind(range.from, range.to).all<RecordRow>();
  const posts = result.results.map(r => {
    const evaluation = parse(r.raw_evaluation) as KuaishouEvaluation | null;
    const raw = parse(r.raw_payload);
    const { raw_payload: _raw, raw_evaluation: _evaluation, ...post } = r;
    void _raw; void _evaluation;
    const values = [r.likes, r.comments, r.favorites, r.shares].map(numeric);
    const interactions = values.every(v => v !== null) ? values.reduce<number>((n, v) => n + v!, 0) : null;
    return { ...post, post_status: r.post_status, publish_time: r.publish_time, content_type: r.post_type, interactions,
      interactionRate: interactions !== null && numeric(r.views) !== null && Number(r.views) > 0 ? interactions / Number(r.views) * 100 : null,
      aiScore: evaluation?.totalScore ?? null, platformEvaluation: evaluation, effectEvaluation: null,
      organic_views: null, paid_views: null, has_paid_traffic: raw?.normalized?.paid?.present === true ? 1 : raw?.normalized?.paid?.present === false ? 0 : null,
      availability: raw?.normalized?.availability ?? {}, capturedComments: raw?.normalized?.comments?.length ?? null,
      promotionStatus: evaluation?.promotionStatus ?? "unknown", topKeywords: [], keywordStatus: "unavailable" };
  });
  const published = posts.filter(p => p.post_status === "published");
  const views = total(published, "views"), interactions = total(published, "interactions");
  const summary = { periodPublished: published.length, postCount: published.length, totalViews: views, views,
    likes: total(published, "likes"), comments: total(published, "comments"), favorites: total(published, "favorites"), shares: total(published, "shares"),
    interactions, fansGrowth: total(published, "fans_growth"), capturedComments: total(published, "capturedComments"), paidViews: null, organicViews: null,
    interactionRate: views !== null && views > 0 && interactions !== null ? interactions / views * 100 : null };
  return { platform: "kuaishou", range, summary, totals: summary, monitoredPosts: posts, posts,
    topPosts: [...published].sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1)).slice(0, 10),
    engine: "kuaishou-content-v0.5", effectEvaluationSummary: null, breakoutAnalysis: [], lowEfficiency: [], hotLinks: [],
    platformOverview: [{ platform: "kuaishou", ...summary }], contentTypes: [], contentCategories: [], contentFanRelations: [], viralVideos: [], viralCategoryComparison: [],
    suggestions: ["阶段3A只接入两个真实样本；完整运营页面由阶段3B接入。", "当前没有可核实的自然播放拆分，不宣称自然爆款。"],
    sourceFreshness: { latestPost: posts[0]?.publish_time ?? null, capturedCommentCount: summary.capturedComments },
    sources: ["social_posts", "social_post_snapshots", "social_post_evaluations"], updatedAt: new Date().toISOString() };
}

export async function readKuaishouDetail(d1: D1Database, id: number) {
  const post = await d1.prepare("SELECT * FROM social_posts WHERE id=? AND platform='kuaishou'").bind(id).first<RecordRow>();
  if (!post) return null;
  const snapshots = (await d1.prepare("SELECT * FROM social_post_snapshots WHERE post_id=? AND platform='kuaishou' ORDER BY snapshot_time DESC,id DESC").bind(id).all<RecordRow>()).results;
  const snapshot = snapshots[0] ?? null;
  if (!snapshot) return { platform: "kuaishou", post, snapshot: null, status: "unavailable" };
  const data: Record<string, unknown> = { platform: "kuaishou", post, snapshot: { ...snapshot, raw_payload: undefined }, snapshotHistory: snapshots.map(s => ({ ...s, raw_payload: undefined })),
    availability: parse(snapshot.raw_payload)?.normalized?.availability ?? {}, sources: ["social_post_snapshots", "social_post_metric_series"] };
  for (const [key, table] of Object.entries({ traffic: "social_post_traffic", trafficSources: "social_post_traffic_sources", promotions: "social_post_paid_traffic", metricSeries: "social_post_metric_series", comments: "social_comments", evaluations: "social_post_evaluations" })) {
    const rows = (await d1.prepare(`SELECT t.* FROM ${table} t JOIN social_posts p ON p.id=t.post_id WHERE p.platform='kuaishou' AND t.post_id=? AND t.snapshot_id=? ORDER BY t.id`).bind(id, Number(snapshot.id)).all<RecordRow>()).results;
    data[key] = rows.map(r => ({ ...r, raw_payload: undefined, raw_evaluation: key === "evaluations" ? parse(r.raw_evaluation) : undefined }));
  }
  // Earlier platform time points may be deduplicated against an older snapshot; expose the entire true series separately.
  data.metricSeries = (await d1.prepare(`SELECT metric_type,series_name,point_time,point_label,metric_value,source_platform,source_path,snapshot_id FROM social_post_metric_series
    WHERE post_id=? AND source_platform='kuaishou' ORDER BY metric_type,point_time,point_index`).bind(id).all<RecordRow>()).results;
  data.evaluationHistory = (await d1.prepare("SELECT * FROM social_post_evaluations WHERE platform='kuaishou' AND post_id=? ORDER BY evaluation_date,snapshot_id").bind(id).all<RecordRow>()).results.map(r => ({ ...r, raw_evaluation: parse(r.raw_evaluation) }));
  data.audience = { status: "unavailable", data: null };
  data.commentKeywords = { status: "unavailable", data: null };
  return data;
}

export async function readKuaishouFans(d1: D1Database) {
  const rows = (await d1.prepare(`SELECT f.id,f.account_id,f.fans_count,f.snapshot_date,f.collection_time FROM social_fans f JOIN social_accounts a ON a.id=f.account_id
    WHERE f.platform='kuaishou' AND a.platform='kuaishou' AND a.account_id NOT LIKE 'test_%' ORDER BY f.collection_time,f.id`).all<RecordRow>()).results;
  const accounts = [...new Set(rows.map(r => r.account_id))].map(accountId => {
    const snapshots = rows.filter(r => r.account_id === accountId);
    return { accountId, snapshots, fansCount: snapshots.at(-1)?.fans_count ?? null,
      trendStatus: snapshots.length >= 2 ? "available" : "insufficient_history" };
  });
  return { platform: "kuaishou", accounts, snapshots: rows,
    fansCount: total(accounts as RecordRow[], "fansCount"),
    trendStatus: accounts.some(a => a.trendStatus === "available") ? "available" : "insufficient_history", profile: null, profileStatus: "unavailable",
    message: "当前平台未提供该维度真实数据。粉丝变化只比较本账号真实采集快照，不生成平台每日新增/流失。" };
}
