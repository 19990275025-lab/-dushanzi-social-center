import { normalizeKuaishouDaily, selectKuaishouSample, type KuaishouBatch, type KuaishouPost } from "./kuaishou-adapter";
import { platformEvaluationStrategies } from "./platform-evaluation-strategies";

export type KuaishouReceive = { rawText: string; sourceFile: string; sourcePath: string; selectedPostIds: string[] };
type SqlValue = string | number | null;
type Expr = { sql: string; values: SqlValue[] };
type RowValue = SqlValue | Expr;
const json = (v: unknown) => JSON.stringify(v);
export async function sha256Text(raw: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)))].map(n => n.toString(16).padStart(2, "0")).join("");
}
const expr = (sql: string, ...values: SqlValue[]): Expr => ({ sql, values });
function insert(d1: D1Database, table: string, row: Record<string, RowValue>, conflict = "") {
  const values: SqlValue[] = [];
  const placeholders = Object.values(row).map(v => {
    if (v !== null && typeof v === "object") { values.push(...v.values); return v.sql; }
    values.push(v); return "?";
  });
  return d1.prepare(`INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${placeholders.join(",")}) ${conflict}`).bind(...values);
}
function validateReceive(input: KuaishouReceive) {
  if (typeof input.rawText !== "string" || new TextEncoder().encode(input.rawText).length > 1_500_000) throw new Error("源文件为空或超过阶段3A单批上限");
  if (!/^kuaishou_daily_monitor_\d{8}(?:_r\d+)?\.json$/.test(input.sourceFile)) throw new Error("仅接收快手正式每日监测文件");
  if (!Array.isArray(input.selectedPostIds) || input.selectedPostIds.some(id => typeof id !== "string")) throw new Error("必须明确选择作品ID");
  const batch = normalizeKuaishouDaily(JSON.parse(input.rawText));
  if (!input.sourceFile.includes(batch.date.replaceAll("-", ""))) throw new Error("文件日期与JSON采集日期不符");
  const selected = selectKuaishouSample(batch, input.selectedPostIds);
  if (batch.fans === null) throw new Error("本阶段样本必须包含真实粉丝总量；缺失时不写默认0");
  // 旧作品主表仍为非空计数。仅允许本阶段两条具有完整基础指标的真实公开样本。
  // 其他记录只留原始文件，绝不为了通过兼容约束把未知指标转为0。
  if (selected.some(p => Object.entries(p.metrics).some(([k, v]) => k !== "actualLoaded" && v === null))) throw new Error("样本基础计数存在未知值，停止主表写入，不补0；原文件保留待后续适配");
  if (selected.reduce((n, p) => n + p.series.length + p.sources.length + p.comments.length, 0) > 700) throw new Error("样本明细超过单次原子事务上限，停止本批写入");
  return { batch, selected };
}
async function existingPosts(d1: D1Database, batch: KuaishouBatch) {
  return (await d1.prepare(`SELECT p.id, p.platform_post_id FROM social_posts p JOIN social_accounts a ON a.id=p.account_id
    WHERE p.platform='kuaishou' AND a.platform='kuaishou' AND a.account_id=?`).bind(batch.accountId).all<{ id: number; platform_post_id: string }>()).results;
}
function sampleSummary(batch: KuaishouBatch, selected: KuaishouPost[], existing: Array<{ platform_post_id: string }>) {
  return {
    platform: "kuaishou", collectionDate: batch.date, collectionBatch: batch.batch, collectionTime: batch.collectionTime,
    filePosts: batch.posts.length, selectedPosts: selected.length, excludedPosts: batch.posts.length - selected.length,
    sourceNewPosts: selected.filter(p => p.isNew).length, sourceMonitoredPosts: selected.filter(p => !p.isNew).length,
    databaseNewPosts: selected.filter(p => !existing.some(e => e.platform_post_id === p.id)).length,
    databaseExistingPosts: selected.filter(p => existing.some(e => e.platform_post_id === p.id)).length,
    series: selected.reduce((n, p) => n + p.series.length, 0), sources: selected.reduce((n, p) => n + p.sources.length, 0),
    comments: selected.reduce((n, p) => n + p.comments.length, 0), fans: batch.fans,
    paidWorks: selected.filter(p => p.paid.present === true).length, supportEnabledWorks: selected.filter(p => p.support.enabled).length,
    unavailable: selected.reduce((n, p) => n + Object.values(p.availability).filter(s => s === "unavailable").length, 0),
    noData: selected.reduce((n, p) => n + Object.values(p.availability).filter(s => s === "no_data").length, 0),
    posts: selected.map(p => ({ id: p.id, title: p.title, publishTime: p.publishTime, metrics: p.metrics, quality: p.quality,
      availability: p.availability, paid: p.paid, support: p.support, trends: p.series.length,
      sourceDimensions: [...new Set(p.sources.map(s => s.metricDimension))], commentFields: p.comments.map(c => c.availability) })),
    warnings: [...batch.warnings, "平台助推启用不代表已投放；自然播放不可计算", "未选3条留在原始文件，本文件不标记为全部处理完成"],
  };
}

export async function previewKuaishou(d1: D1Database, input: KuaishouReceive) {
  const { batch, selected } = validateReceive(input);
  const checksum = await sha256Text(input.rawText);
  const selectionHash = await sha256Text([...input.selectedPostIds].sort().join(","));
  const batchKey = `kuaishou:adapter-v1:${checksum}:${selectionHash}`;
  const existing = await existingPosts(d1, batch);
  const summary = sampleSummary(batch, selected, existing);
  const previous = await d1.prepare("SELECT id, status, raw_payload FROM collection_logs WHERE batch_key=?").bind(batchKey).first<{ id: number; status: string; raw_payload: string }>();
  if (previous?.status === "completed") return { status: "already_processed", checksum, logId: previous.id, summary, result: JSON.parse(previous.raw_payload).result };
  if (previous?.status === "processing") throw new Error("该样本正在处理，禁止并发确认");
  await d1.prepare(`INSERT INTO collection_logs (platform,source_type,source_name,entity_type,status,total_count,source_file,batch_key,unavailable_count,raw_payload,collected_at)
    VALUES ('kuaishou','api','WorkBuddy快手平台适配V1.0','kuaishou_sample_v1','pending',2,?,?,?,?,?)
    ON CONFLICT(batch_key) WHERE batch_key IS NOT NULL DO UPDATE SET status='pending', error_message=NULL, updated_at=CURRENT_TIMESTAMP WHERE collection_logs.status IN ('pending','failed')`)
    .bind(input.sourceFile, batchKey, summary.unavailable, json({ checksum, selection: input.selectedPostIds, summary }), batch.collectionTime).run();
  const log = await d1.prepare("SELECT id FROM collection_logs WHERE batch_key=?").bind(batchKey).first<{ id: number }>();
  if (!log) throw new Error("未能建立预览批次");
  await d1.batch([
    insert(d1, "content_collection_files", { file_name: input.sourceFile, full_path: input.sourcePath, checksum, file_size: new TextEncoder().encode(input.rawText).length,
      collection_date: batch.date, collection_time: batch.collectionTime, collection_batch: batch.batch, actual_post_count: batch.posts.length,
      status: "validated", validated_at: new Date().toISOString(), metadata: json({ platform: "kuaishou", accountId: batch.accountId, processedPostIds: [], totalPosts: batch.posts.length }) }, "ON CONFLICT(checksum) DO NOTHING"),
    insert(d1, "collection_staging_records", { collection_log_id: log.id, record_index: 0, data_type: "content", platform: "kuaishou", source: "workbuddy",
      raw_payload: json(input), normalized_payload: json(summary), validation_status: "valid" },
    "ON CONFLICT(collection_log_id,record_index) DO NOTHING"),
  ]);
  return { status: "preview", checksum, logId: log.id, summary };
}

export async function confirmKuaishou(d1: D1Database, logId: number, checksum: string) {
  const log = await d1.prepare("SELECT status, raw_payload FROM collection_logs WHERE id=? AND platform='kuaishou' AND entity_type='kuaishou_sample_v1'")
    .bind(logId).first<{ status: string; raw_payload: string }>();
  if (!log) throw new Error("未找到已校验快手预览");
  const metadata = JSON.parse(log.raw_payload);
  if (metadata.checksum !== checksum) throw new Error("确认checksum与预览不一致");
  if (log.status === "completed") return { status: "already_processed", ...metadata.result };
  const staging = await d1.prepare("SELECT raw_payload FROM collection_staging_records WHERE collection_log_id=? AND record_index=0 AND platform='kuaishou'").bind(logId).first<{ raw_payload: string }>();
  if (!staging) throw new Error("预览原始文件不存在");
  const input = JSON.parse(staging.raw_payload) as KuaishouReceive;
  if (await sha256Text(input.rawText) !== checksum) throw new Error("暂存源文件校验和异常，未写入");
  const { batch, selected } = validateReceive(input);
  const existing = await existingPosts(d1, batch);
  const before = await kuaishouCounts(d1);
  const claim = await d1.prepare("UPDATE collection_logs SET status='processing' WHERE id=? AND status IN ('pending','failed')").bind(logId).run();
  if (Number(claim.meta.changes) !== 1) throw new Error("批次已锁定，禁止重复确认");
  try {
    const statements: D1PreparedStatement[] = [];
    const account = expr("(SELECT id FROM social_accounts WHERE platform='kuaishou' AND account_id=?)", batch.accountId);
    statements.push(insert(d1, "social_accounts", { platform: "kuaishou", account_id: batch.accountId, account_name: batch.accountName, followers_count: batch.fans },
      "ON CONFLICT(platform,account_id) DO NOTHING"));
    const historyRows = (await d1.prepare(`SELECT s.raw_payload FROM social_post_snapshots s JOIN social_posts p ON p.id=s.post_id JOIN social_accounts a ON a.id=p.account_id
      WHERE p.platform='kuaishou' AND a.account_id=? AND s.snapshot_time<=? ORDER BY s.snapshot_time`).bind(batch.accountId, batch.collectionTime).all<{ raw_payload: string }>()).results;
    const byId = new Map<string, KuaishouPost>();
    for (const row of historyRows) {
      const raw = JSON.parse(row.raw_payload);
      if (raw.normalized?.accountId === batch.accountId) byId.set(raw.normalized.id, raw.normalized);
    }
    for (const p of selected) byId.set(p.id, p);
    for (const p of selected) {
      const post = expr("(SELECT p.id FROM social_posts p WHERE p.platform='kuaishou' AND p.account_id="+account.sql+" AND p.platform_post_id=?)", ...account.values, p.id);
      const snapshot = expr("(SELECT id FROM social_post_snapshots WHERE platform='kuaishou' AND post_id="+post.sql+" AND snapshot_time=?)", ...post.values, p.collectionTime);
      const oldSnapshot = await d1.prepare(`SELECT s.id, s.raw_payload FROM social_post_snapshots s JOIN social_posts p ON p.id=s.post_id JOIN social_accounts a ON a.id=p.account_id
        WHERE p.platform='kuaishou' AND a.account_id=? AND p.platform_post_id=? AND (s.snapshot_time=? OR (s.snapshot_date=? AND s.collection_batch=?))`)
        .bind(batch.accountId, p.id, p.collectionTime, batch.date, batch.batch).first<{ id: number; raw_payload: string }>();
      if (oldSnapshot) {
        const raw = JSON.parse(oldSnapshot.raw_payload);
        if (json(raw.source) !== json(p.raw)) throw new Error(`${p.id}: 同一快照已有不同内容，禁止覆盖历史事实`);
        continue;
      }
      const base = { account_id: account, platform: "kuaishou", source: "workbuddy", platform_post_id: p.id, title: p.title, content_type: p.postType,
        publish_time: p.publishTime, post_url: p.url, views: p.metrics.plays, likes: p.metrics.likes, comments: p.metrics.comments, favorites: p.metrics.favorites, shares: p.metrics.shares,
        fans_growth: p.metrics.followers, duration_seconds: p.durationSeconds, post_type: p.postType, post_status: p.status,
        content_metadata: json({ sourcePlatform: "kuaishou", originalStatus: p.status, metadata: p.raw.metadata ?? null, diagnosis: p.raw.diagnosis ?? null, availability: p.availability }),
        data_availability_status: "partial", collection_log_id: logId };
      statements.push(insert(d1, "social_posts", base, `ON CONFLICT(platform,account_id,platform_post_id) DO UPDATE SET
        title=excluded.title, post_url=excluded.post_url, post_type=excluded.post_type, post_status=excluded.post_status,
        views=excluded.views,likes=excluded.likes,comments=excluded.comments,favorites=excluded.favorites,shares=excluded.shares,fans_growth=excluded.fans_growth,
        duration_seconds=excluded.duration_seconds,content_metadata=excluded.content_metadata,collection_log_id=excluded.collection_log_id,updated_at=CURRENT_TIMESTAMP
        WHERE NOT EXISTS (SELECT 1 FROM social_post_snapshots prior WHERE prior.post_id=social_posts.id AND prior.snapshot_time > '${p.collectionTime.replaceAll("'", "''")}')`));
      statements.push(insert(d1, "social_post_snapshots", { post_id: post, platform: "kuaishou", snapshot_time: p.collectionTime, collection_time: p.collectionTime,
        snapshot_date: batch.date, collection_batch: batch.batch, play_count: p.metrics.plays, like_count: p.metrics.likes, comment_overview_count: p.metrics.comments,
        actual_loaded_count: p.metrics.actualLoaded, comment_rows_count: p.comments.length, favorite_count: p.metrics.favorites, share_count: p.metrics.shares, follower_gain: p.metrics.followers,
        data_availability_status: "partial", traffic_availability_status: Object.values(p.quality).every(v => v !== null) ? "available" : "partial",
        traffic_sources_availability_status: p.sources.length ? "available" : "unavailable", audience_availability_status: "unavailable", comment_keywords_availability_status: "unavailable",
        comments_availability_status: Array.isArray((p.raw.comments as Record<string, unknown>)?.list) ? "available" : "unavailable",
        post_age_days: Math.floor((Date.parse(p.collectionTime) - Date.parse(p.publishTime)) / 86400000), source_record_status: "normal", source_file: input.sourceFile,
        raw_payload: json({ source: p.raw, normalized: p, checksum }), collection_log_id: logId }));
      const common = { post_id: post, snapshot_id: snapshot, snapshot_time: p.collectionTime, collection_log_id: logId };
      statements.push(insert(d1, "social_post_traffic", { ...common, completion_rate: p.quality.completion, average_play_duration_seconds: p.quality.avgSeconds,
        two_sec_bounce_rate: p.quality.bounce2s, five_sec_completion_rate: p.quality.completion5s, cover_click_rate: p.quality.coverClick,
        data_availability_status: Object.values(p.quality).every(v => v !== null) ? "available" : "partial", raw_payload: json(p.raw.content_quality ?? {}) }));
      for (const s of p.series) statements.push(insert(d1, "social_post_metric_series", { ...common, source_platform: "kuaishou", metric_type: s.metricType, series_name: s.seriesName,
        point_index: s.pointIndex, point_time: s.pointTime, point_label: s.pointLabel, metric_value: s.value, unit: s.unit, source_path: s.sourcePath, raw_value: json(s.raw), data_availability_status: "available" }, "ON CONFLICT DO NOTHING"));
      for (const s of p.sources) statements.push(insert(d1, "social_post_traffic_sources", { ...common, source_type: s.sourceType, metric_dimension: s.metricDimension, source_name: s.sourceName,
        traffic_value: s.value, percentage: null, traffic_nature: s.nature, raw_value: json({ source: s.raw, update_time: (p.raw.traffic_source as Record<string, unknown>)?.update_time ?? null, window: "platform_reported_source_window" }) }));
      for (const promotion of [{ type: "paid", source: "kuaishou_fentiao", value: p.paid }, { type: "platform_support", source: "kuaishou_platform_support", value: p.support }]) {
        statements.push(insert(d1, "social_post_paid_traffic", { ...common, campaign_type: promotion.source, promotion_type: promotion.type, promotion_source: promotion.source,
          promotion_present: promotion.value.present === null ? null : Number(promotion.value.present), play_count: null, relationship_to_overview: "unknown",
          detail_available: null, data_availability_status: promotion.value.present === null ? "unavailable" : "partial", raw_payload: json(promotion.value.raw) }));
      }
      for (const c of p.comments) {
        const fingerprint = c.sourceId ? `kuaishou:${c.sourceId}` : await sha256Text(json([p.id, c.authorId, c.content, c.publishTime, c.raw]));
        statements.push(insert(d1, "social_comments", { ...common, platform: "kuaishou", source: "workbuddy", source_comment_id: c.sourceId,
          comment_fingerprint: fingerprint, username: c.author, comment_text: c.content, comment_type: c.content ? "text" : "other", comment_time: c.publishTime,
          comment_time_raw: typeof c.raw.comment_time === "string" ? c.raw.comment_time : null, likes: c.likes, reply_count: c.replies,
          likes_availability_status: c.availability.like_count, likes_raw_value: json(c.raw.liked_count ?? null), author_replied: null,
          field_availability: json(c.availability), data_availability_status: Object.values(c.availability).every(v => v === "available") ? "available" : "partial",
          raw_payload: json(c.raw) }, `ON CONFLICT(post_id,comment_fingerprint) WHERE comment_fingerprint IS NOT NULL DO UPDATE SET
            likes=excluded.likes,reply_count=excluded.reply_count,likes_availability_status=excluded.likes_availability_status,
            snapshot_id=excluded.snapshot_id,snapshot_time=excluded.snapshot_time,field_availability=excluded.field_availability,raw_payload=excluded.raw_payload
            WHERE social_comments.snapshot_time IS NULL OR social_comments.snapshot_time <= excluded.snapshot_time`));
      }
      const evaluation = platformEvaluationStrategies.kuaishou.evaluate(p, [...byId.values()]);
      statements.push(insert(d1, "social_post_evaluations", { post_id: post, snapshot_id: snapshot, collection_log_id: logId, platform: "kuaishou", model_version: evaluation.modelVersion, evaluation_date: batch.date,
        total_score: evaluation.totalScore, grade: evaluation.grade, propagation_score: evaluation.dimensions.propagation.score,
        interaction_score: evaluation.dimensions.interaction.score, attraction_score: null, efficiency_score: null,
        viewing_score: evaluation.dimensions.viewing.score, follower_score: evaluation.dimensions.followers.score,
        confidence: evaluation.confidence, douyin_paid_status: "not_applicable", promotion_type: evaluation.promotionType, promotion_status: evaluation.promotionStatus,
        natural_performance_confidence: evaluation.naturalPerformanceConfidence, data_completeness: evaluation.dataCompleteness, raw_evaluation: json(evaluation) }));
    }
    if (batch.fans !== null) statements.push(insert(d1, "social_fans", { account_id: account, platform: "kuaishou", account_name: batch.accountName,
      snapshot_date: batch.date, fans_count: batch.fans, collection_time: batch.collectionTime, collected_at: batch.collectionTime, source_type: "api",
      source_record_id: `kuaishou:${batch.accountId}:${batch.batch}`, raw_payload: json({ source: "account.fans_count_at_collection", fans_count_at_collection: batch.fans, sourceFile: input.sourceFile, checksum,
        availability: { gender: "unavailable", age: "unavailable", region: "unavailable", interest: "unavailable", device: "unavailable", activity: "unavailable" } }), collection_log_id: logId }, "ON CONFLICT(platform,source_record_id) DO NOTHING"));
    statements.push(d1.prepare("UPDATE collection_staging_records SET confirmed_at=CURRENT_TIMESTAMP WHERE collection_log_id=?").bind(logId));
    // Keep the file eligible for stage3B; completed applies only when ALL source posts have snapshots.
    statements.push(d1.prepare(`UPDATE content_collection_files SET processed_at=CURRENT_TIMESTAMP,
      status=CASE WHEN (SELECT COUNT(DISTINCT p.platform_post_id) FROM social_post_snapshots s JOIN social_posts p ON p.id=s.post_id JOIN social_accounts a ON a.id=p.account_id
        WHERE p.platform='kuaishou' AND a.account_id=? AND s.collection_batch=?) >= actual_post_count THEN 'completed' ELSE 'validated' END,
      metadata=json_set(COALESCE(metadata,'{}'),'$.partial',json('true'),'$.lastSampleLogId',?),updated_at=CURRENT_TIMESTAMP WHERE checksum=?`)
      .bind(batch.accountId, batch.batch, logId, checksum));
    // Mark complete in the SAME atomic transaction as every business row. A crash cannot replay the writes.
    statements.push(d1.prepare("UPDATE collection_logs SET status='completed', success_count=2,comment_count=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(selected.reduce((n, p) => n + p.comments.length, 0), logId));
    await d1.batch(statements);
    const after = await kuaishouCounts(d1);
    const changes = Object.fromEntries(Object.entries(after).map(([k, n]) => [k, n - before[k]]));
    const result = { checksum, logId, changes, summary: sampleSummary(batch, selected, existing) };
    await d1.prepare("UPDATE collection_logs SET raw_payload=? WHERE id=?").bind(json({ ...metadata, result }), logId).run();
    return { status: "completed", ...result };
  } catch (e) {
    // A completed business transaction must never become retryable if only the diagnostic response failed.
    await d1.prepare("UPDATE collection_logs SET status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing'")
      .bind(e instanceof Error ? e.message : "未知写入失败", logId).run();
    throw e;
  }
}

export async function kuaishouCounts(d1: D1Database) {
  const counts: Record<string, number> = {};
  for (const t of ["social_posts", "social_post_snapshots", "social_post_metric_series", "social_post_traffic", "social_post_traffic_sources", "social_post_paid_traffic", "social_post_evaluations", "social_comments", "social_post_audience", "social_post_comment_keywords", "social_fans"]) {
    const sql = t === "social_posts" || t === "social_fans" ? `SELECT COUNT(*) AS n FROM ${t} WHERE platform='kuaishou'`
      : `SELECT COUNT(*) AS n FROM ${t} t JOIN social_posts p ON p.id=t.post_id WHERE p.platform='kuaishou'`;
    counts[t] = Number((await d1.prepare(sql).first<{ n: number }>())?.n ?? 0);
  }
  return counts;
}
