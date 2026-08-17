import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { recommendationLevel } from "@/lib/hot-topic-action-score";

type TopicRow = {
  id: number; platform: string; topic_name: string; heat_value: number; collection_date: string;
  relevance_score: number; recommend_follow: number; recommendation_reason: string;
  recommended_title: string; shooting_direction: string;
};
type TaskRow = {
  id: number; task_date: string; task_title: string; platform: string; content_type: string;
  responsible_person: string | null; priority: string; status: string; source_type: string;
};
type CalendarEvent = { id: string; date: string; type: "publish" | "live" | "campaign" | "holiday" | "hot"; title: string; meta: string; href: string };

function beijingDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function holidayEvents(year: string): CalendarEvent[] {
  return [
    [`${year}-01-01`, "元旦"], [`${year}-05-01`, "劳动节"], [`${year}-10-01`, "国庆节"],
  ].map(([date, title]) => ({ id: `holiday-${date}`, date, type: "holiday", title, meta: "系统内置固定节日", href: "/marketing-operations" }));
}

function percentage(actual: number, target: number) {
  return target > 0 ? Math.round(actual / target * 100) : null;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const d1 = getD1();
  const today = beijingDate();
  const yesterday = addDays(today, -1);
  const requestedMonth = new URL(request.url).searchParams.get("month") ?? today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7);
  const monthStart = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

  const [todayTopics, todoTasks, calendarTasks, calendarTopics, goalTasks, growth, planTargets, actualPosts,
    yesterdayBest, collectionFreshness] = await Promise.all([
    d1.prepare(`
      SELECT h.id, h.platform, h.topic_name, h.heat_value, h.collection_date,
        a.relevance_score, a.recommend_follow, a.recommendation_reason,
        a.recommended_title, a.shooting_direction
      FROM hot_topics h JOIN hot_topic_analysis a ON a.id = (
        SELECT candidate.id FROM hot_topic_analysis candidate WHERE candidate.hot_topic_id = h.id
        ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1)
      WHERE h.collection_date = ? AND h.status = 'active'
      ORDER BY a.relevance_score DESC, h.heat_value DESC, COALESCE(h.ranking, 999) LIMIT 50
    `).bind(today).all<TopicRow>(),
    d1.prepare(`
      SELECT id, task_date, task_title, platform, content_type, responsible_person,
        priority, status, source_type FROM content_tasks
      WHERE status NOT IN ('reviewed') AND (
        date(task_date) = date(?) OR date(task_date) < date(?) OR status = 'published')
      ORDER BY date(task_date), CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, id
      LIMIT 200
    `).bind(today, today).all<TaskRow>(),
    d1.prepare(`
      SELECT id, task_date, task_title, platform, content_type, responsible_person,
        priority, status, source_type FROM content_tasks
      WHERE date(task_date) BETWEEN date(?) AND date(?) ORDER BY task_date, id LIMIT 500
    `).bind(monthStart, monthEnd).all<TaskRow>(),
    d1.prepare(`
      SELECT h.id, h.platform, h.topic_name, h.collection_date,
        a.relevance_score, a.recommend_follow
      FROM hot_topics h JOIN hot_topic_analysis a ON a.id = (
        SELECT candidate.id FROM hot_topic_analysis candidate WHERE candidate.hot_topic_id = h.id
        ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1)
      WHERE h.collection_date BETWEEN ? AND ? AND a.recommend_follow = 1
      ORDER BY h.collection_date, a.relevance_score DESC LIMIT 100
    `).bind(monthStart, monthEnd).all<{ id: number; platform: string; topic_name: string; collection_date: string; relevance_score: number; recommend_follow: number }>(),
    d1.prepare(`
      SELECT content_type, status, COUNT(*) AS count FROM content_tasks
      WHERE date(task_date) BETWEEN date(?) AND date(?) GROUP BY content_type, status
    `).bind(monthStart, monthEnd).all<{ content_type: string; status: string; count: number }>(),
    d1.prepare(`SELECT COUNT(*) AS records, COALESCE(SUM(net_growth), 0) AS actual FROM fan_growth_records
      WHERE date(record_date) BETWEEN date(?) AND date(?)`).bind(monthStart, monthEnd).first<{ records: number; actual: number }>(),
    d1.prepare(`SELECT COALESCE(SUM(target_views), 0) AS target_views,
      COALESCE(SUM(target_fans_growth), 0) AS target_fans
      FROM content_plans WHERE date(publish_time) BETWEEN date(?) AND date(?)`)
      .bind(monthStart, monthEnd).first<{ target_views: number; target_fans: number }>(),
    d1.prepare(`SELECT COUNT(*) AS posts, COALESCE(SUM(views), 0) AS views,
      COALESCE(SUM(fans_growth), 0) AS post_fans FROM social_posts
      WHERE date(publish_time) BETWEEN date(?) AND date(?)`)
      .bind(monthStart, monthEnd).first<{ posts: number; views: number; post_fans: number }>(),
    d1.prepare(`SELECT id, platform, title, views, likes, comments, favorites, shares,
      CASE WHEN views > 0 THEN ROUND((likes + comments + favorites + shares) * 100.0 / views, 2) ELSE 0 END AS interaction_rate
      FROM social_posts WHERE date(publish_time) = date(?)
      ORDER BY views DESC, likes + comments + favorites + shares DESC LIMIT 1`)
      .bind(yesterday).first<Record<string, unknown>>(),
    d1.prepare(`SELECT source_name, status, success_count, error_count,
      COALESCE(collected_at, created_at) AS collected_at,
      date(datetime(COALESCE(collected_at, created_at), '+8 hours')) AS collected_date FROM collection_logs
      ORDER BY COALESCE(collected_at, created_at) DESC, id DESC LIMIT 1`)
      .first<Record<string, unknown>>(),
  ]);

  const recommendedHotspots = todayTopics.results.map((topic) => ({
    ...topic,
    level: recommendationLevel({ relevanceScore: Number(topic.relevance_score), recommendFollow: Boolean(topic.recommend_follow), recommendationReason: topic.recommendation_reason }),
  })).filter((topic) => topic.level === "A").slice(0, 5);
  const tasks = todoTasks.results;
  const todos = {
    recommendedHotspots,
    shooting: tasks.filter((task) => task.task_date === today && ["shoot_pending", "shooting"].includes(task.status)),
    publishing: tasks.filter((task) => task.task_date === today && task.status === "publish_pending"),
    overdue: tasks.filter((task) => task.task_date < today && !["published", "reviewed"].includes(task.status)),
    review: tasks.filter((task) => task.status === "published"),
  };

  const taskEvents: CalendarEvent[] = calendarTasks.results.map((task) => ({
    id: `task-${task.id}`, date: task.task_date,
    type: task.source_type === "festival" ? "campaign" : task.content_type === "live" ? "live" : "publish",
    title: task.task_title,
    meta: `${task.platform} · ${task.responsible_person || "待分配"}`,
    href: "/tasks",
  }));
  const hotEvents: CalendarEvent[] = calendarTopics.results.map((topic) => ({
    id: `hot-${topic.id}`, date: topic.collection_date, type: "hot", title: topic.topic_name,
    meta: `${topic.platform} · 关联度 ${Math.round(Number(topic.relevance_score))}%`, href: "/hot-topics",
  }));
  const calendar = [...taskEvents, ...hotEvents, ...holidayEvents(month.slice(0, 4)).filter((item) => item.date.startsWith(month))]
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  const goalRows = goalTasks.results;
  const completeStatuses = new Set(["published", "reviewed"]);
  const workTotal = goalRows.filter((row) => row.content_type !== "live").reduce((sum, row) => sum + Number(row.count), 0);
  const workComplete = goalRows.filter((row) => row.content_type !== "live" && completeStatuses.has(row.status)).reduce((sum, row) => sum + Number(row.count), 0);
  const liveTotal = goalRows.filter((row) => row.content_type === "live").reduce((sum, row) => sum + Number(row.count), 0);
  const liveComplete = goalRows.filter((row) => row.content_type === "live" && completeStatuses.has(row.status)).reduce((sum, row) => sum + Number(row.count), 0);
  const actualFans = Number(growth?.records ?? 0) > 0 ? Number(growth?.actual ?? 0) : Number(actualPosts?.post_fans ?? 0);
  const goals = {
    works: { label: "本月作品完成率", actual: workComplete, target: workTotal, rate: percentage(workComplete, workTotal), unit: "项" },
    lives: { label: "本月直播完成率", actual: liveComplete, target: liveTotal, rate: percentage(liveComplete, liveTotal), unit: "场" },
    fans: { label: "粉丝增长完成率", actual: actualFans, target: Number(planTargets?.target_fans ?? 0), rate: percentage(actualFans, Number(planTargets?.target_fans ?? 0)), unit: "人" },
    views: { label: "播放目标完成率", actual: Number(actualPosts?.views ?? 0), target: Number(planTargets?.target_views ?? 0), rate: percentage(Number(actualPosts?.views ?? 0), Number(planTargets?.target_views ?? 0)), unit: "次" },
  };

  const latestDate = String(collectionFreshness?.collected_date ?? "");
  const risks: string[] = [];
  if (!recommendedHotspots.length) risks.push("今日尚无 A 级推荐热点，请检查 WorkBuddy 今日数据是否已导入并完成分析。");
  if (todos.overdue.length) risks.push(`当前有 ${todos.overdue.length} 项逾期任务，需要优先明确负责人和完成时间。`);
  if (!collectionFreshness || latestDate < today) risks.push(`最近采集日期为 ${latestDate || "未知"}，今日运营判断可能缺少最新平台数据。`);
  if (!yesterdayBest) risks.push("昨日没有已入库作品，无法生成最佳作品对比。");
  const suggestions = [
    recommendedHotspots[0] ? `优先围绕“${recommendedHotspots[0].topic_name}”评估短视频方案，并在任务中心明确负责人。` : "先补充今日热点数据，再确定借势内容，避免使用过期热点。",
    todos.shooting.length ? `今日有 ${todos.shooting.length} 项拍摄任务，建议上午完成脚本和机位确认。` : "今日暂无待拍任务，可补充常青攻略或游客第一视角内容储备。",
    todos.publishing.length ? `今日有 ${todos.publishing.length} 项待发布内容，发布前复核标题、封面和互动问题。` : "今日暂无待发布任务，建议检查本周内容节奏是否存在空档。",
  ];

  return Response.json({
    today, yesterday, month, todos, calendar, goals,
    brief: {
      todayHotspots: recommendedHotspots.slice(0, 3),
      yesterdayBest: yesterdayBest ?? null,
      todayAdvice: suggestions[0], risks, suggestions,
    },
    freshness: collectionFreshness ?? null,
    sources: ["hot_topics", "hot_topic_analysis", "content_tasks", "content_plans", "content_plan_feedback", "social_posts", "fan_growth_records", "collection_logs"],
    updatedAt: new Date().toISOString(),
  });
}
