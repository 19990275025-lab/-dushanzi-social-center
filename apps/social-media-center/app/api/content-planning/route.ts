import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { generateContentPlan, planningRecommendation, refreshContentPlanFeedback, type PlanningTopic } from "@/lib/content-planning";
import { beijingDate } from "@/lib/hot-topic-archive";

type PlanRow = {
  plan_id: number; hot_topic_id: number; task_id: number | null; related_post_id: number | null;
  platform: string; content_type: string; title: string; title_options: string; script: string;
  shot_list: string; cover_text: string; hashtags: string; recommended_topics: string;
  background_music: string | null; publish_time: string; live_theme: string | null;
  target_views: number; target_interaction_rate: number; target_fans_growth: number;
  status: string; created_time: string; topic_name: string; relevance_score: number;
  task_title: string | null; task_status: string | null; post_title: string | null; post_publish_time: string | null;
  views: number | null; likes: number | null; comments: number | null; favorites: number | null; shares: number | null;
  effect_score: number | null; ai_summary: string | null; evaluated_at: string | null;
};

const parseJson = <T,>(value: string, fallback: T): T => {
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

async function loadDashboard(d1: D1Database, recommendationDate = beijingDate()) {
  const [topicResult, planResult, baseline, postsResult, collectionFreshness] = await Promise.all([
    d1.prepare(`
      SELECT h.id, h.platform, h.topic_name, h.keyword, h.category, h.heat_value,
        a.relevance_score, a.recommend_follow, a.recommendation_reason,
        a.recommended_title, a.shooting_direction, a.live_theme,
        (SELECT MAX(f.effect_score) FROM hot_topic_feedback f WHERE f.hot_topic_id = h.id) AS prior_effect_score
      FROM hot_topics h
      JOIN hot_topic_analysis a ON a.id = (
        SELECT candidate.id FROM hot_topic_analysis candidate
        WHERE candidate.hot_topic_id = h.id ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
      )
      WHERE h.platform = 'douyin' AND h.status = 'active' AND h.collection_date = ?
      ORDER BY a.relevance_score DESC, h.heat_value DESC, COALESCE(h.ranking, 999), h.id DESC
      LIMIT 100
    `).bind(recommendationDate).all<PlanningTopic>(),
    d1.prepare(`
      SELECT cp.*, h.topic_name, a.relevance_score, t.task_title, t.status AS task_status,
        p.title AS post_title, p.publish_time AS post_publish_time,
        p.views, p.likes, p.comments, p.favorites, p.shares,
        f.effect_score, f.ai_summary, f.evaluated_at
      FROM content_plans cp
      JOIN hot_topics h ON h.id = cp.hot_topic_id
      JOIN hot_topic_analysis a ON a.id = (
        SELECT candidate.id FROM hot_topic_analysis candidate
        WHERE candidate.hot_topic_id = cp.hot_topic_id ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
      )
      LEFT JOIN content_tasks t ON t.id = cp.task_id
      LEFT JOIN social_posts p ON p.id = cp.related_post_id
      LEFT JOIN content_plan_feedback f ON f.plan_id = cp.plan_id
      ORDER BY cp.created_time DESC, cp.plan_id DESC
      LIMIT 100
    `).all<PlanRow>(),
    d1.prepare(`
      SELECT COALESCE(AVG(views), 0) AS average_views,
        COALESCE(AVG(CASE WHEN views > 0 THEN (likes + comments + favorites + shares) * 100.0 / views END), 0) AS average_interaction_rate,
        COALESCE(AVG(fans_growth), 0) AS average_fans_growth
      FROM social_posts WHERE platform = 'douyin'
    `).first<{ average_views: number; average_interaction_rate: number; average_fans_growth: number }>(),
    d1.prepare(`
      SELECT id, title, publish_time, views, likes, comments, favorites, shares
      FROM social_posts WHERE platform = 'douyin'
      ORDER BY publish_time DESC, id DESC LIMIT 100
    `).all(),
    d1.prepare(`
      SELECT collected_at, success_count FROM collection_logs
      WHERE platform = 'douyin' AND status IN ('confirmed','success','completed')
      ORDER BY COALESCE(collected_at, created_at) DESC, id DESC LIMIT 1
    `).first<{ collected_at: string | null; success_count: number }>(),
  ]);

  const topics = topicResult.results.map((topic) => ({ ...topic, ...planningRecommendation(topic) }))
    .filter((topic) => topic.recommendationLevel === "A")
    .sort((a, b) => b.recommendationIndex - a.recommendationIndex || b.relevanceScore - a.relevanceScore)
    .slice(0, 5);
  const plans = planResult.results.map((plan) => ({
    ...plan,
    title_options: parseJson<string[]>(plan.title_options, []),
    shot_list: parseJson<Array<Record<string, unknown>>>(plan.shot_list, []),
    hashtags: parseJson<string[]>(plan.hashtags, []),
    recommended_topics: parseJson<string[]>(plan.recommended_topics, []),
    review_due: plan.post_publish_time ? new Date(plan.post_publish_time).getTime() + 7 * 86400000 <= Date.now() : false,
  }));
  return {
    topics, plans, availablePosts: postsResult.results,
    recommendationDate,
    baseline: baseline ?? { average_views: 0, average_interaction_rate: 0, average_fans_growth: 0 },
    summary: {
      recommended: topics.length,
      plans: plans.length,
      tasks: plans.filter((plan) => plan.task_id).length,
      published: plans.filter((plan) => plan.related_post_id).length,
      reviewed: plans.filter((plan) => plan.effect_score !== null).length,
    },
    collectionFreshness: collectionFreshness ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  await refreshContentPlanFeedback(d1);
  const requestedDate = new URL(request.url).searchParams.get("date");
  const recommendationDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : beijingDate();
  return Response.json(await loadDashboard(d1, recommendationDate));
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await request.json() as { action?: string; hotTopicId?: number; planId?: number; dueDate?: string; postId?: number };
  const d1 = getD1();

  if (payload.action === "generate_plan") {
    const hotTopicId = Number(payload.hotTopicId);
    const topic = await d1.prepare(`
      SELECT h.id, h.platform, h.topic_name, h.keyword, h.category, h.heat_value,
        a.relevance_score, a.recommend_follow, a.recommendation_reason,
        a.recommended_title, a.shooting_direction, a.live_theme,
        (SELECT MAX(f.effect_score) FROM hot_topic_feedback f WHERE f.hot_topic_id = h.id) AS prior_effect_score
      FROM hot_topics h JOIN hot_topic_analysis a ON a.id = (
        SELECT candidate.id FROM hot_topic_analysis candidate WHERE candidate.hot_topic_id = h.id
        ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
      ) WHERE h.id = ? AND h.platform = 'douyin'
    `).bind(hotTopicId).first<PlanningTopic>();
    if (!topic || planningRecommendation(topic).recommendationLevel !== "A") {
      return Response.json({ error: "仅支持为抖音A级热点生成内容方案" }, { status: 400 });
    }
    const baseline = await d1.prepare(`
      SELECT COALESCE(AVG(views), 0) AS average_views,
        COALESCE(AVG(CASE WHEN views > 0 THEN (likes + comments + favorites + shares) * 100.0 / views END), 0) AS average_interaction_rate,
        COALESCE(AVG(fans_growth), 0) AS average_fans_growth
      FROM social_posts WHERE platform = 'douyin'
    `).first<{ average_views: number; average_interaction_rate: number; average_fans_growth: number }>();
    const plan = generateContentPlan(topic, baseline ?? { average_views: 0, average_interaction_rate: 0, average_fans_growth: 0 });
    const saved = await d1.prepare(`
      INSERT INTO content_plans
        (hot_topic_id, platform, content_type, title, title_options, script, shot_list, cover_text,
         hashtags, recommended_topics, background_music, publish_time, live_theme,
         target_views, target_interaction_rate, target_fans_growth, status)
      VALUES (?, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
      ON CONFLICT(hot_topic_id, platform) DO UPDATE SET content_type = excluded.content_type,
        title = excluded.title, title_options = excluded.title_options, script = excluded.script,
        shot_list = excluded.shot_list, cover_text = excluded.cover_text, hashtags = excluded.hashtags,
        recommended_topics = excluded.recommended_topics, background_music = excluded.background_music,
        publish_time = excluded.publish_time, live_theme = excluded.live_theme,
        target_views = excluded.target_views, target_interaction_rate = excluded.target_interaction_rate,
        target_fans_growth = excluded.target_fans_growth, updated_time = CURRENT_TIMESTAMP
      RETURNING plan_id
    `).bind(hotTopicId, plan.contentType, plan.title, JSON.stringify(plan.titleOptions), plan.script,
      JSON.stringify(plan.shotList), plan.coverText, JSON.stringify(plan.hashtags), JSON.stringify(plan.recommendedTopics),
      plan.backgroundMusic, plan.publishTime, plan.liveTheme, plan.targetViews, plan.targetInteractionRate, plan.targetFansGrowth).first<{ plan_id: number }>();
    return Response.json({ planId: saved?.plan_id, dashboard: await loadDashboard(d1) });
  }

  if (payload.action === "generate_task") {
    const planId = Number(payload.planId);
    const plan = await d1.prepare("SELECT plan_id, title, content_type, publish_time, hot_topic_id, task_id FROM content_plans WHERE plan_id = ?")
      .bind(planId).first<{ plan_id: number; title: string; content_type: string; publish_time: string; hot_topic_id: number; task_id: number | null }>();
    if (!plan) return Response.json({ error: "内容方案不存在" }, { status: 404 });
    if (plan.task_id) return Response.json({ taskId: plan.task_id, dashboard: await loadDashboard(d1) });
    const dueDate = payload.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate) ? payload.dueDate : plan.publish_time.slice(0, 10);
    const typeMap: Record<string, string> = { guide: "video", scenery: "video", visitor_experience: "video", challenge: "video", live: "live" };
    const task = await d1.prepare(`
      INSERT INTO content_tasks
        (task_date, platform, task_title, content_type, responsible_person, collaborators,
         source_type, source_id, priority, status, review_result, updated_at)
      VALUES (?, 'douyin', ?, ?, NULL, '[]', 'ai_content_plan', ?, 'high', 'planning', ?, CURRENT_TIMESTAMP)
      RETURNING id
    `).bind(dueDate, plan.title, typeMap[plan.content_type] ?? "video", planId,
      `任务来源：AI内容策划；来源热点ID：${plan.hot_topic_id}`).first<{ id: number }>();
    await d1.prepare("UPDATE content_plans SET task_id = ?, status = 'task_created', updated_time = CURRENT_TIMESTAMP WHERE plan_id = ?")
      .bind(task?.id, planId).run();
    return Response.json({ taskId: task?.id, dashboard: await loadDashboard(d1) });
  }

  if (payload.action === "link_post") {
    const planId = Number(payload.planId);
    const postId = Number(payload.postId);
    const post = await d1.prepare("SELECT id FROM social_posts WHERE id = ? AND platform = 'douyin'").bind(postId).first();
    if (!Number.isInteger(planId) || !post) return Response.json({ error: "请选择有效抖音作品" }, { status: 400 });
    const result = await d1.prepare(`
      UPDATE content_plans SET related_post_id = ?, status = 'published', updated_time = CURRENT_TIMESTAMP
      WHERE plan_id = ? RETURNING task_id
    `).bind(postId, planId).first<{ task_id: number | null }>();
    if (!result) return Response.json({ error: "内容方案不存在" }, { status: 404 });
    if (result.task_id) await d1.prepare(`
      UPDATE content_tasks SET status = 'published', related_post_id = ?,
        completed_at = (SELECT publish_time FROM social_posts WHERE id = ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(postId, postId, result.task_id).run();
    await refreshContentPlanFeedback(d1);
    return Response.json({ dashboard: await loadDashboard(d1) });
  }

  if (payload.action === "refresh_feedback") {
    const result = await refreshContentPlanFeedback(d1);
    return Response.json({ ...result, dashboard: await loadDashboard(d1) });
  }

  return Response.json({ error: "不支持的操作" }, { status: 400 });
}
