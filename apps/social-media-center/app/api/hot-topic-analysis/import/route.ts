import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { collectionApiAuthorized, collectionApiJson } from "@/lib/data-collection-api-v2";
import { WORKBUDDY_REPORT_SOURCE, type WorkBuddyReportAnalysis } from "@/lib/workbuddy-report-analysis";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type ImportPayload = {
  source_agent?: unknown;
  collection_date?: unknown;
  analysis_source?: unknown;
  analyses?: unknown;
};

function validAnalysis(value: unknown): value is WorkBuddyReportAnalysis {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.topic_name === "string" && row.topic_name.trim().length > 0
    && Number.isFinite(Number(row.relevance_score))
    && Number(row.relevance_score) >= 0 && Number(row.relevance_score) <= 100
    && typeof row.recommend_follow === "boolean"
    && ["recommendation_reason", "recommended_title", "shooting_direction", "live_theme"]
      .every((key) => typeof row[key] === "string" && String(row[key]).trim().length > 0);
}

export async function POST(request: Request) {
  if (!collectionApiAuthorized(request)) return collectionApiJson({ error: "采集接口密钥无效" }, { status: 401 });
  let payload: ImportPayload;
  try {
    payload = await request.json() as ImportPayload;
  } catch {
    return collectionApiJson({ error: "请提交JSON分析数据" }, { status: 400 });
  }
  const sourceAgent = String(payload.source_agent ?? "WorkBuddy热点监测Agent").trim();
  const collectionDate = String(payload.collection_date ?? "").trim();
  const analysisSource = String(payload.analysis_source ?? WORKBUDDY_REPORT_SOURCE).trim();
  const analyses = Array.isArray(payload.analyses) ? payload.analyses : [];
  if (!datePattern.test(collectionDate)) return collectionApiJson({ error: "collection_date必须为YYYY-MM-DD" }, { status: 400 });
  if (!sourceAgent || !analysisSource) return collectionApiJson({ error: "数据来源不能为空" }, { status: 400 });
  if (!analyses.length || analyses.some((row) => !validAnalysis(row))) {
    return collectionApiJson({ error: "分析数据为空或字段不完整" }, { status: 400 });
  }

  await ensureDatabase();
  const d1 = getD1();
  const topics = await d1.prepare(`
    SELECT id, topic_name FROM hot_topics
    WHERE collection_date = ? AND COALESCE(NULLIF(source_agent, ''), source) = ? AND status = 'active'
  `).bind(collectionDate, sourceAgent).all<{ id: number; topic_name: string }>();
  const topicIds = new Map<string, number[]>();
  for (const topic of topics.results) topicIds.set(topic.topic_name, [...(topicIds.get(topic.topic_name) ?? []), topic.id]);

  const statements: Array<ReturnType<typeof d1.prepare>> = [];
  const unmatchedTopics: string[] = [];
  let matchedAnalysisCount = 0;
  let recommendedCount = 0;
  for (const value of analyses) {
    const analysis = value as WorkBuddyReportAnalysis;
    const ids = topicIds.get(analysis.topic_name.trim()) ?? [];
    if (!ids.length) {
      unmatchedTopics.push(analysis.topic_name);
      continue;
    }
    matchedAnalysisCount += 1;
    if (analysis.recommend_follow) recommendedCount += 1;
    for (const hotTopicId of ids) {
      statements.push(d1.prepare(`
        INSERT OR IGNORE INTO hot_topic_analysis
          (hot_topic_id, relevance_score, recommend_follow, recommendation_reason,
           recommended_title, shooting_direction, live_theme, analysis_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        hotTopicId, analysis.relevance_score, analysis.recommend_follow ? 1 : 0,
        analysis.recommendation_reason, analysis.recommended_title,
        analysis.shooting_direction, analysis.live_theme, analysisSource,
      ));
    }
  }
  const results = statements.length ? await d1.batch(statements) : [];
  const insertedCount = results.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0);
  return collectionApiJson({
    sourceAgent,
    analysisSource,
    collectionDate,
    receivedCount: analyses.length,
    matchedAnalysisCount,
    insertedCount,
    recommendedCount,
    preservedCount: statements.length - insertedCount,
    unmatchedCount: unmatchedTopics.length,
    unmatchedTopics,
  });
}
