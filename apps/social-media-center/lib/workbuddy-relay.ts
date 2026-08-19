import { archiveObjectKey, generateAndStoreDailyArchive } from "@/lib/hot-topic-archive";
import { planningRecommendation, type PlanningTopic } from "@/lib/content-planning";
import { analyzeWorkBuddyTopic, type WorkBuddyPlatform } from "@/lib/workbuddy-hot-topic";

export const WORKBUDDY_RELAY_SOURCE = "WorkBuddy热点自动接力";
export const WORKBUDDY_RELAY_ENTITY = "workbuddy_relay";
export const WORKBUDDY_RELAY_ANALYSIS_SOURCE = "系统规则分析V1.0";

type RelayStage = "detect" | "validate" | "standardize" | "receive" | "confirm" | "ai_analysis" | "archive" | "content_planning" | "complete";

type RelaySummary = {
  fileName: string;
  fileDate: string;
  stage: RelayStage;
  originalCount: number;
  standardizedCount: number;
  importedCount: number;
  analysisCount: number;
  gradeACount: number;
  archiveGenerated: boolean;
  archiveFileName: string | null;
  contentPlanningUpdated: boolean;
  contentPlanningTop5: Array<{ id: number; topicName: string; recommendationIndex: number }>;
  batchIds: number[];
  failedReason: string | null;
};

type TopicRow = {
  id: number;
  platform: WorkBuddyPlatform;
  ranking: number;
  topic_name: string;
  heat_value: number;
  keyword: string;
  source_url: string | null;
  collect_time: string;
  category: string | null;
};

type PlanningRow = PlanningTopic & { collection_date: string };

type RelayLogRow = {
  id: number;
  source_url: string | null;
  status: string;
  total_count: number;
  success_count: number;
  comment_count: number;
  error_count: number;
  error_message: string | null;
  collected_at: string | null;
  created_at: string;
  updated_at: string;
};

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function blankSummary(fileName: string, fileDate: string): RelaySummary {
  return {
    fileName,
    fileDate,
    stage: "detect",
    originalCount: 0,
    standardizedCount: 0,
    importedCount: 0,
    analysisCount: 0,
    gradeACount: 0,
    archiveGenerated: false,
    archiveFileName: null,
    contentPlanningUpdated: false,
    contentPlanningTop5: [],
    batchIds: [],
    failedReason: null,
  };
}

export function workBuddyFileDate(fileName: string) {
  const match = /^hot_topic_(\d{4})(\d{2})(\d{2})\.(json|xlsx|xls)$/i.exec(fileName);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? date : null;
}

export async function startWorkBuddyRelay(
  d1: D1Database,
  input: { fileName: string; fileDate: string; originalCount: number; standardizedCount: number },
) {
  const parsedDate = workBuddyFileDate(input.fileName);
  if (!parsedDate || parsedDate !== input.fileDate) throw new Error("文件名日期与采集日期不一致");
  if (!Number.isInteger(input.originalCount) || input.originalCount <= 0) throw new Error("原始热点文件为空");
  if (input.standardizedCount !== input.originalCount) throw new Error("标准化数量与原始数量不一致");

  const existing = await d1.prepare(`
    SELECT id, status, error_message,
      CASE WHEN status = 'processing' AND datetime(updated_at) <= datetime('now', '-30 minutes') THEN 1 ELSE 0 END AS stale
    FROM collection_logs
    WHERE source_name = ? AND entity_type = ? AND source_url = ?
      AND status IN ('processing','success')
    ORDER BY id DESC LIMIT 1
  `).bind(WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY, input.fileName)
    .first<{ id: number; status: string; error_message: string | null; stale: number }>();
  if (existing) {
    if (existing.status === "processing" && existing.stale) {
      const staleSummary = {
        ...blankSummary(input.fileName, input.fileDate),
        ...safeJson<Partial<RelaySummary>>(existing.error_message, {}),
        stage: "receive" as const,
        archiveGenerated: false,
        contentPlanningUpdated: false,
        failedReason: "自动接力进程超过30分钟未完成，已标记为中断并重新处理",
      };
      await d1.prepare("UPDATE collection_logs SET status = 'failed', error_count = 1, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(JSON.stringify(staleSummary), existing.id).run();
    } else {
      return {
        relayLogId: existing.id,
        created: false,
        alreadyProcessed: existing.status === "success",
        processing: existing.status === "processing",
        summary: safeJson(existing.error_message, blankSummary(input.fileName, input.fileDate)),
      };
    }
  }

  const summary: RelaySummary = {
    ...blankSummary(input.fileName, input.fileDate),
    stage: "receive",
    originalCount: input.originalCount,
    standardizedCount: input.standardizedCount,
  };
  const inserted = await d1.prepare(`
    INSERT INTO collection_logs
      (platform, source_type, source_name, source_url, entity_type, status,
       total_count, success_count, error_count, comment_count, error_message,
       collected_at, updated_at)
    SELECT 'douyin', 'api', ?, ?, ?, 'processing', ?, 0, 0, 0, ?, ?, CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1 FROM collection_logs WHERE source_name = ? AND entity_type = ?
        AND source_url = ? AND status IN ('processing','success')
    )
    RETURNING id
  `).bind(
    WORKBUDDY_RELAY_SOURCE, input.fileName, WORKBUDDY_RELAY_ENTITY,
    input.originalCount, JSON.stringify(summary), `${input.fileDate}T08:00:00+08:00`,
    WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY, input.fileName,
  ).first<{ id: number }>();
  if (!inserted) {
    const active = await d1.prepare(`SELECT id, status, error_message FROM collection_logs
      WHERE source_name = ? AND entity_type = ? AND source_url = ? AND status IN ('processing','success')
      ORDER BY id DESC LIMIT 1`)
      .bind(WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY, input.fileName)
      .first<{ id: number; status: string; error_message: string | null }>();
    if (active) return {
      relayLogId: active.id,
      created: false,
      alreadyProcessed: active.status === "success",
      processing: active.status === "processing",
      summary: safeJson(active.error_message, blankSummary(input.fileName, input.fileDate)),
    };
    throw new Error("无法创建自动接力批次");
  }
  return { relayLogId: inserted.id, created: true, alreadyProcessed: false, processing: true, summary };
}

export async function failWorkBuddyRelay(
  d1: D1Database,
  input: { relayLogId?: number | null; fileName: string; fileDate: string; stage: RelayStage; reason: string; originalCount?: number; standardizedCount?: number },
) {
  const current = input.relayLogId
    ? await d1.prepare("SELECT error_message FROM collection_logs WHERE id = ? AND source_name = ? AND entity_type = ?")
      .bind(input.relayLogId, WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY).first<{ error_message: string | null }>()
    : null;
  const summary: RelaySummary = {
    ...blankSummary(input.fileName, input.fileDate),
    ...safeJson<Partial<RelaySummary>>(current?.error_message ?? null, {}),
    fileName: input.fileName,
    fileDate: input.fileDate,
    stage: input.stage,
    originalCount: input.originalCount ?? 0,
    standardizedCount: input.standardizedCount ?? 0,
    archiveGenerated: false,
    contentPlanningUpdated: false,
    failedReason: input.reason.slice(0, 1000),
  };
  if (input.relayLogId && current) {
    await d1.prepare(`UPDATE collection_logs SET status = 'failed', error_count = CASE WHEN total_count > 0 THEN total_count ELSE 1 END,
      error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(JSON.stringify(summary), input.relayLogId).run();
    return { relayLogId: input.relayLogId, summary };
  }
  const previousFailure = await d1.prepare(`SELECT id FROM collection_logs
    WHERE source_name = ? AND entity_type = ? AND source_url = ? AND status = 'failed'
      AND json_extract(error_message, '$.stage') = ?
    ORDER BY id DESC LIMIT 1`)
    .bind(WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY, input.fileName, input.stage)
    .first<{ id: number }>();
  if (previousFailure) {
    await d1.prepare(`UPDATE collection_logs SET total_count = ?, error_count = ?, error_message = ?,
      collected_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(input.originalCount ?? 0, Math.max(input.originalCount ?? 0, 1), JSON.stringify(summary),
        `${input.fileDate}T08:00:00+08:00`, previousFailure.id).run();
    return { relayLogId: previousFailure.id, summary };
  }
  const inserted = await d1.prepare(`
    INSERT INTO collection_logs
      (platform, source_type, source_name, source_url, entity_type, status,
       total_count, success_count, error_count, comment_count, error_message,
       collected_at, updated_at)
    VALUES ('douyin', 'api', ?, ?, ?, 'failed', ?, 0, ?, 0, ?, ?, CURRENT_TIMESTAMP)
    RETURNING id
  `).bind(
    WORKBUDDY_RELAY_SOURCE, input.fileName, WORKBUDDY_RELAY_ENTITY,
    input.originalCount ?? 0, Math.max(input.originalCount ?? 0, 1), JSON.stringify(summary),
    `${input.fileDate}T08:00:00+08:00`,
  ).first<{ id: number }>();
  return { relayLogId: inserted?.id ?? null, summary };
}

export async function preflightWorkBuddyRelay(
  d1: D1Database,
  input: { relayLogId: number; fileName: string; fileDate: string; standardizedCount: number; batchIds: number[] },
) {
  const batchIds = [...new Set(input.batchIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!batchIds.length) throw new Error("没有可核验的数据接收批次");
  const relay = await d1.prepare(`SELECT id FROM collection_logs
    WHERE id = ? AND source_name = ? AND entity_type = ? AND source_url = ? AND status = 'processing'`)
    .bind(input.relayLogId, WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY, input.fileName).first();
  if (!relay) throw new Error("自动接力批次不存在或状态不可预检");
  const batches = await d1.prepare(`SELECT id, status, source_name, source_url, entity_type, total_count
    FROM collection_logs WHERE id IN (${batchIds.map(() => "?").join(",")})`)
    .bind(...batchIds).all<{ id: number; status: string; source_name: string; source_url: string | null; entity_type: string; total_count: number }>();
  if (batches.results.length !== batchIds.length || batches.results.some((batch) =>
    batch.status !== "pending_confirmation" || batch.entity_type !== "hot_topic" ||
    batch.source_name !== "WorkBuddy热点监测Agent" || batch.source_url !== input.fileName)) {
    throw new Error("暂存批次未全部通过校验，已停止正式入库");
  }
  const staged = await d1.prepare(`SELECT normalized_payload, validation_status FROM collection_staging_records
    WHERE collection_log_id IN (${batchIds.map(() => "?").join(",")}) ORDER BY collection_log_id, record_index`)
    .bind(...batchIds).all<{ normalized_payload: string | null; validation_status: string }>();
  if (staged.results.length !== input.standardizedCount || staged.results.some((row) => row.validation_status !== "valid" || !row.normalized_payload)) {
    throw new Error("暂存数量或校验状态异常，已停止正式入库");
  }
  const incomingKeys = new Set<string>();
  for (const row of staged.results) {
    const record = safeJson<Record<string, unknown> | null>(row.normalized_payload, null);
    const collectDate = String(record?.collect_time ?? "").slice(0, 10);
    const key = `${collectDate}|${record?.platform}|${record?.topic_type}|${record?.topic_name}|${record?.ranking}`;
    if (collectDate !== input.fileDate || incomingKeys.has(key)) throw new Error("暂存数据日期异常或批次内存在重复热点");
    incomingKeys.add(key);
  }
  const existing = await d1.prepare(`SELECT collection_date, platform, topic_type, topic_name, ranking
    FROM hot_topics WHERE collection_date = ?`)
    .bind(input.fileDate).all<{ collection_date: string; platform: string; topic_type: string; topic_name: string; ranking: number }>();
  const existingKeys = new Set(existing.results.map((row) =>
    `${row.collection_date}|${row.platform}|${row.topic_type}|${row.topic_name}|${row.ranking}`));
  const duplicateCount = [...incomingKeys].filter((key) => existingKeys.has(key)).length;
  if (duplicateCount) throw new Error(`检测到${duplicateCount}条热点已经入库，整批停止以防重复`);
  const current = await d1.prepare("SELECT error_message FROM collection_logs WHERE id = ?")
    .bind(input.relayLogId).first<{ error_message: string | null }>();
  const summary = {
    ...blankSummary(input.fileName, input.fileDate),
    ...safeJson<Partial<RelaySummary>>(current?.error_message ?? null, {}),
    stage: "confirm" as const,
    batchIds,
  };
  await d1.prepare("UPDATE collection_logs SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(JSON.stringify(summary), input.relayLogId).run();
  return { relayLogId: input.relayLogId, duplicateCount: 0, stagedCount: staged.results.length, batchIds };
}

function analysisStatement(d1: D1Database, topic: TopicRow, historicalText: string) {
  const ai = analyzeWorkBuddyTopic({
    rowNumber: topic.ranking,
    platform: topic.platform,
    rank: topic.ranking,
    topicTitle: topic.topic_name,
    heatValue: String(topic.heat_value),
    keyword: topic.keyword,
    url: topic.source_url,
    publishTime: topic.collect_time,
    category: topic.category,
    sourceAgent: "WorkBuddy热点监测Agent",
  }, historicalText);
  return {
    ai,
    statement: d1.prepare(`
      INSERT INTO hot_topic_analysis
        (hot_topic_id, relevance_score, recommend_follow, recommendation_reason,
         recommended_title, shooting_direction, live_theme, analysis_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hot_topic_id, analysis_source) DO UPDATE SET
        relevance_score = excluded.relevance_score,
        recommend_follow = excluded.recommend_follow,
        recommendation_reason = excluded.recommendation_reason,
        recommended_title = excluded.recommended_title,
        shooting_direction = excluded.shooting_direction,
        live_theme = excluded.live_theme,
        created_at = CURRENT_TIMESTAMP
    `).bind(
      topic.id, ai.relevanceScore, ai.worthFollowing ? 1 : 0, ai.analysis,
      ai.shortVideoTitle, ai.shootingDirection, ai.liveTheme, WORKBUDDY_RELAY_ANALYSIS_SOURCE,
    ),
  };
}

async function relayPlanningTop5(d1: D1Database, fileDate: string) {
  const result = await d1.prepare(`
    SELECT h.id, h.platform, h.topic_name, h.keyword, h.category, h.heat_value,
      h.collection_date, a.relevance_score, a.recommend_follow, a.recommendation_reason,
      a.recommended_title, a.shooting_direction, a.live_theme,
      (SELECT MAX(f.effect_score) FROM hot_topic_feedback f WHERE f.hot_topic_id = h.id) AS prior_effect_score
    FROM hot_topics h
    JOIN hot_topic_analysis a ON a.id = (
      SELECT candidate.id FROM hot_topic_analysis candidate
      WHERE candidate.hot_topic_id = h.id ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
    )
    WHERE h.platform = 'douyin' AND h.status = 'active' AND h.collection_date = ?
    ORDER BY a.relevance_score DESC, h.heat_value DESC, COALESCE(h.ranking, 999), h.id DESC
  `).bind(fileDate).all<PlanningRow>();
  const recommended = result.results.map((topic) => ({ ...topic, ...planningRecommendation(topic) }))
    .filter((topic) => topic.recommendationLevel === "A")
    .sort((a, b) => b.recommendationIndex - a.recommendationIndex || b.relevanceScore - a.relevanceScore);
  return {
    gradeACount: recommended.length,
    top5: recommended.slice(0, 5).map((topic) => ({
      id: topic.id,
      topicName: topic.topic_name,
      recommendationIndex: topic.recommendationIndex,
    })),
  };
}

export async function finalizeWorkBuddyRelay(
  d1: D1Database,
  uploads: R2Bucket,
  input: { relayLogId: number; fileName: string; fileDate: string; originalCount: number; standardizedCount: number; batchIds: number[] },
) {
  const relay = await d1.prepare(`SELECT id, status, error_message FROM collection_logs
    WHERE id = ? AND source_name = ? AND entity_type = ? AND source_url = ?`)
    .bind(input.relayLogId, WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY, input.fileName)
    .first<{ id: number; status: string; error_message: string | null }>();
  if (!relay || relay.status !== "processing") throw new Error("自动接力批次不存在或状态不可完成");
  const batchIds = [...new Set(input.batchIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!batchIds.length) throw new Error("没有可核验的数据接收批次");

  const batches = await d1.prepare(`
    SELECT id, status, entity_type, source_name, source_url, success_count
    FROM collection_logs WHERE id IN (${batchIds.map(() => "?").join(",")})
  `).bind(...batchIds).all<{ id: number; status: string; entity_type: string; source_name: string; source_url: string | null; success_count: number }>();
  if (batches.results.length !== batchIds.length || batches.results.some((batch) =>
    batch.status !== "completed" || batch.entity_type !== "hot_topic" ||
    batch.source_name !== "WorkBuddy热点监测Agent" || batch.source_url !== input.fileName)) {
    throw new Error("数据接收批次未全部完成，已停止AI分析与归档");
  }

  const topics = await d1.prepare(`
    SELECT id, platform, ranking, topic_name, heat_value, keyword, source_url, collect_time, category
    FROM hot_topics
    WHERE collection_log_id IN (${batchIds.map(() => "?").join(",")}) AND collection_date = ? AND status = 'active'
    ORDER BY platform, ranking, id
  `).bind(...batchIds, input.fileDate).all<TopicRow>();
  if (topics.results.length !== input.standardizedCount) {
    throw new Error(`正式入库数量${topics.results.length}与标准化数量${input.standardizedCount}不一致`);
  }

  const [posts, historicalTopics] = await Promise.all([
    d1.prepare("SELECT title, hashtags FROM social_posts ORDER BY publish_time DESC, id DESC LIMIT 300")
      .all<{ title: string; hashtags: string | null }>(),
    d1.prepare("SELECT topic_name, keyword, category FROM hot_topics WHERE status = 'active' ORDER BY id DESC LIMIT 1000")
      .all<{ topic_name: string; keyword: string; category: string | null }>(),
  ]);
  const historicalText = [
    ...posts.results.map((post) => `${post.title} ${post.hashtags ?? ""}`),
    ...historicalTopics.results.map((topic) => `${topic.topic_name} ${topic.keyword} ${topic.category ?? ""}`),
  ].join(" ");
  const analyzed = topics.results.map((topic) => analysisStatement(d1, topic, historicalText));
  try {
    for (let offset = 0; offset < analyzed.length; offset += 50) {
      await d1.batch(analyzed.slice(offset, offset + 50).map((item) => item.statement));
    }
  } catch (error) {
    throw new Error(`AI分析失败：${error instanceof Error ? error.message : "批量写入异常"}`);
  }
  const analysisCountRow = await d1.prepare(`
    SELECT COUNT(*) AS count FROM hot_topic_analysis a
    JOIN hot_topics h ON h.id = a.hot_topic_id
    WHERE h.collection_log_id IN (${batchIds.map(() => "?").join(",")})
      AND a.analysis_source = ?
  `).bind(...batchIds, WORKBUDDY_RELAY_ANALYSIS_SOURCE).first<{ count: number }>();
  const analysisCount = Number(analysisCountRow?.count ?? 0);
  if (analysisCount !== topics.results.length) throw new Error("AI分析数量与入库热点数量不一致");

  let planning: Awaited<ReturnType<typeof relayPlanningTop5>>;
  try {
    planning = await relayPlanningTop5(d1, input.fileDate);
  } catch (error) {
    throw new Error(`内容策划联动失败：${error instanceof Error ? error.message : "选题计算异常"}`);
  }
  let archive: Awaited<ReturnType<typeof generateAndStoreDailyArchive>>;
  let archiveObject: R2Object | null;
  try {
    archive = await generateAndStoreDailyArchive(d1, uploads, input.fileDate);
    archiveObject = await uploads.head(archiveObjectKey(input.fileDate));
  } catch (error) {
    throw new Error(`热点档案生成失败：${error instanceof Error ? error.message : "R2写入异常"}`);
  }
  if (!archiveObject || archive.archivedCount < topics.results.length) throw new Error("热点档案未完整生成");

  const summary: RelaySummary = {
    fileName: input.fileName,
    fileDate: input.fileDate,
    stage: "complete",
    originalCount: input.originalCount,
    standardizedCount: input.standardizedCount,
    importedCount: topics.results.length,
    analysisCount,
    gradeACount: planning.gradeACount,
    archiveGenerated: true,
    archiveFileName: archive.fileName,
    contentPlanningUpdated: true,
    contentPlanningTop5: planning.top5,
    batchIds,
    failedReason: null,
  };
  await d1.prepare(`UPDATE collection_logs SET status = 'success', success_count = ?, error_count = 0,
    comment_count = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(topics.results.length, analysisCount, JSON.stringify(summary), input.relayLogId).run();
  return { relayLogId: input.relayLogId, summary };
}

function relayPublicStatus(row: RelayLogRow | null) {
  if (!row) return null;
  const summary = safeJson<Partial<RelaySummary>>(row.error_message, {});
  return {
    relayLogId: row.id,
    status: row.status,
    fileName: summary.fileName ?? row.source_url,
    fileDate: summary.fileDate ?? null,
    stage: summary.stage ?? null,
    originalCount: summary.originalCount ?? row.total_count,
    standardizedCount: summary.standardizedCount ?? 0,
    importedCount: summary.importedCount ?? row.success_count,
    analysisCount: summary.analysisCount ?? row.comment_count,
    gradeACount: summary.gradeACount ?? 0,
    archiveGenerated: summary.archiveGenerated ?? false,
    archiveFileName: summary.archiveFileName ?? null,
    contentPlanningUpdated: summary.contentPlanningUpdated ?? false,
    contentPlanningTop5: summary.contentPlanningTop5 ?? [],
    failedReason: summary.failedReason ?? null,
    collectedAt: row.collected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getWorkBuddyRelayStatus(d1: D1Database, today: string) {
  const columns = `id, source_url, status, total_count, success_count, comment_count,
    error_count, error_message, collected_at, created_at, updated_at`;
  const [todayRow, latestSuccess] = await Promise.all([
    d1.prepare(`SELECT ${columns} FROM collection_logs
      WHERE source_name = ? AND entity_type = ? AND substr(COALESCE(collected_at, created_at), 1, 10) = ?
      ORDER BY id DESC LIMIT 1`)
      .bind(WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY, today).first<RelayLogRow>(),
    d1.prepare(`SELECT ${columns} FROM collection_logs
      WHERE source_name = ? AND entity_type = ? AND status = 'success'
      ORDER BY updated_at DESC, id DESC LIMIT 1`)
      .bind(WORKBUDDY_RELAY_SOURCE, WORKBUDDY_RELAY_ENTITY).first<RelayLogRow>(),
  ]);
  return {
    today,
    todayStatus: relayPublicStatus(todayRow),
    latestSuccess: relayPublicStatus(latestSuccess),
  };
}
