import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { executionAnalysis, syncTaskPostAssociations, TASK_STATUSES } from "@/lib/task-management";

const platforms = new Set(["douyin", "kuaishou", "weibo"]);
const contentTypes = new Set(["video", "image_text", "text", "live", "article"]);
const sourceTypes = new Set(["hot_topic", "ai_content_plan", "manual", "festival"]);
const priorities = new Set(["urgent", "high", "normal", "low"]);
const statuses = new Set<string>(TASK_STATUSES);

function beijingDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function weekRange(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}

function collaborators(value: unknown) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[,，、]/);
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

async function loadTasks() {
  const d1 = getD1();
  const result = await d1.prepare(`
    SELECT t.id, t.task_date, t.platform, t.task_title, t.content_type,
      t.responsible_person, t.collaborators, t.source_type, t.source_id, t.priority,
      t.status, t.related_post_id, t.review_result, t.completed_at, t.created_at, t.updated_at,
      cp.plan_id, cp.hot_topic_id, cp.target_views, cp.target_interaction_rate, cp.target_fans_growth,
      h.topic_name AS source_topic_name,
      p.title AS post_title, p.publish_time AS post_publish_time, p.views AS post_views,
      p.likes AS post_likes, p.comments AS post_comments, p.favorites AS post_favorites,
      p.shares AS post_shares, p.fans_growth AS post_fans_growth,
      cpf.effect_score, cpf.ai_summary
    FROM content_tasks t
    LEFT JOIN content_plans cp ON cp.task_id = t.id
    LEFT JOIN hot_topics h ON h.id = COALESCE(cp.hot_topic_id,
      CASE WHEN t.source_type = 'hot_topic' THEN t.source_id END)
    LEFT JOIN social_posts p ON p.id = t.related_post_id
    LEFT JOIN content_plan_feedback cpf ON cpf.plan_id = cp.plan_id
    WHERE t.platform IN ('douyin', 'kuaishou', 'weibo')
    ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      t.task_date ASC, t.created_at DESC, t.id DESC
    LIMIT 500
  `).all<Record<string, unknown>>();
  return result.results.map((row) => {
    let parsedCollaborators: string[] = [];
    try { parsedCollaborators = collaborators(JSON.parse(String(row.collaborators ?? "[]"))); } catch { parsedCollaborators = []; }
    return { ...row, collaborators: parsedCollaborators, execution: executionAnalysis(row) };
  });
}

function buildWeeklyReport(tasks: Array<Record<string, unknown>>, averageViews: number, today: string) {
  const range = weekRange(today);
  const weekly = tasks.filter((task) => String(task.task_date) >= range.start && String(task.task_date) <= range.end);
  const completed = weekly.filter((task) => ["published", "reviewed"].includes(String(task.status)));
  const evaluated = completed.filter((task) => Number(task.related_post_id ?? 0) > 0);
  const reached = evaluated.filter((task) => (task.execution as { reachedTarget?: boolean | null }).reachedTarget === true);
  const viral = evaluated.filter((task) => Number(task.effect_score ?? 0) >= 80
    || Number(task.post_views ?? 0) >= Math.max(averageViews * 1.5, 1));
  const owners = new Map<string, { total: number; completed: number }>();
  for (const task of weekly) {
    const owner = String(task.responsible_person || "待分配");
    const item = owners.get(owner) ?? { total: 0, completed: 0 };
    item.total += 1;
    if (["published", "reviewed"].includes(String(task.status))) item.completed += 1;
    owners.set(owner, item);
  }
  return {
    range,
    total: weekly.length,
    completed: completed.length,
    completionRate: weekly.length ? Math.round(completed.length / weekly.length * 100) : 0,
    viralCount: viral.length,
    targetRate: evaluated.length ? Math.round(reached.length / evaluated.length * 100) : 0,
    owners: [...owners.entries()].map(([name, value]) => ({ name, ...value,
      completionRate: value.total ? Math.round(value.completed / value.total * 100) : 0 })),
  };
}

export async function GET() {
  await ensureDatabase();
  const d1 = getD1();
  const association = await syncTaskPostAssociations(d1);
  const [tasks, baseline, collectionFreshness] = await Promise.all([
    loadTasks(),
    d1.prepare("SELECT COALESCE(AVG(views), 0) AS average_views FROM social_posts WHERE platform = 'douyin'")
      .first<{ average_views: number }>(),
    d1.prepare("SELECT collected_at, source_name FROM collection_logs WHERE status = 'completed' ORDER BY COALESCE(collected_at, created_at) DESC LIMIT 1")
      .first<{ collected_at: string; source_name: string }>(),
  ]);
  const today = beijingDate();
  return Response.json({
    tasks,
    kanban: TASK_STATUSES,
    weeklyReport: buildWeeklyReport(tasks, Number(baseline?.average_views ?? 0), today),
    association,
    collectionFreshness,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as Record<string, unknown>;
  const taskDate = String(payload.taskDate ?? "").trim();
  const platform = String(payload.platform ?? "").trim();
  const taskTitle = String(payload.taskTitle ?? "").trim();
  const contentType = String(payload.contentType ?? "").trim();
  const responsiblePerson = String(payload.responsiblePerson ?? "").trim();
  const sourceType = String(payload.sourceType ?? "manual").trim();
  const sourceId = payload.sourceId ? Number(payload.sourceId) : null;
  const priority = String(payload.priority ?? "normal").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) return Response.json({ error: "请选择有效截止时间" }, { status: 400 });
  if (!platforms.has(platform) || !contentTypes.has(contentType) || !taskTitle) {
    return Response.json({ error: "请完整填写平台、任务名称和内容类型" }, { status: 400 });
  }
  if (!sourceTypes.has(sourceType) || !priorities.has(priority)) return Response.json({ error: "任务来源或优先级无效" }, { status: 400 });
  if (sourceId !== null && (!Number.isInteger(sourceId) || sourceId <= 0)) return Response.json({ error: "来源ID无效" }, { status: 400 });

  const task = await getD1().prepare(`
    INSERT INTO content_tasks
      (task_date, platform, task_title, content_type, responsible_person, collaborators,
       source_type, source_id, priority, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', CURRENT_TIMESTAMP)
    RETURNING *
  `).bind(taskDate, platform, taskTitle, contentType, responsiblePerson || null,
    JSON.stringify(collaborators(payload.collaborators)), sourceType, sourceId, priority).first();
  return Response.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as Record<string, unknown>;
  const id = Number(payload.id);
  const status = String(payload.status ?? "");
  if (!Number.isInteger(id) || id <= 0 || !statuses.has(status)) return Response.json({ error: "任务或状态无效" }, { status: 400 });

  const task = await getD1().prepare(`
    UPDATE content_tasks SET status = ?,
      completed_at = CASE WHEN ? = 'reviewed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? RETURNING *
  `).bind(status, status, id).first();
  if (!task) return Response.json({ error: "任务不存在" }, { status: 404 });
  const association = ["published", "reviewed"].includes(status)
    ? await syncTaskPostAssociations(getD1())
    : { linked: 0, pending: 0 };
  return Response.json({ task, association });
}

export async function PUT() {
  await ensureDatabase();
  return Response.json(await syncTaskPostAssociations(getD1()));
}
