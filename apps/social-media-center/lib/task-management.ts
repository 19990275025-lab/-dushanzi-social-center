import { refreshContentPlanFeedback } from "@/lib/content-planning";

export const TASK_STATUSES = [
  "planning",
  "shoot_pending",
  "shooting",
  "edit_pending",
  "review_pending",
  "publish_pending",
  "published",
  "reviewed",
] as const;

export type TaskStatus = typeof TASK_STATUSES[number];

type LinkableTask = {
  id: number;
  task_date: string;
  platform: string;
  task_title: string;
  plan_id: number | null;
  plan_title: string | null;
  title_options: string | null;
  plan_related_post_id: number | null;
};

type CandidatePost = {
  id: number;
  platform: string;
  title: string;
  publish_time: string;
};

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/#[^#\s]+/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value: string) {
  const normalized = normalizeTitle(value);
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

export function titleSimilarity(left: string, right: string) {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shortest = Math.min(a.length, b.length);
  if (shortest >= 6 && (a.includes(b) || b.includes(a))) return 0.9;
  const aSet = bigrams(a);
  const bSet = bigrams(b);
  const intersection = [...aSet].filter((item) => bSet.has(item)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union ? intersection / union : 0;
}

function parseTitleOptions(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function dayDistance(left: string, right: string) {
  const a = Date.parse(`${left.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${right.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86_400_000 : Number.POSITIVE_INFINITY;
}

function bestCandidate(task: LinkableTask, posts: CandidatePost[]) {
  const titles = [task.task_title, task.plan_title ?? "", ...parseTitleOptions(task.title_options)].filter(Boolean);
  return posts
    .filter((post) => post.platform === task.platform && dayDistance(task.task_date, post.publish_time) <= 14)
    .map((post) => {
      const titleScore = Math.max(...titles.map((title) => titleSimilarity(title, post.title)));
      const distance = dayDistance(task.task_date, post.publish_time);
      const timeScore = distance <= 1 ? 0.08 : distance <= 7 ? 0.04 : 0;
      return { post, titleScore, score: titleScore + timeScore };
    })
    .filter((candidate) => candidate.titleScore >= 0.52)
    .sort((a, b) => b.score - a.score || a.post.id - b.post.id)[0];
}

export async function syncTaskPostAssociations(d1: D1Database) {
  const markReviewed = () => d1.prepare(`
    UPDATE content_tasks SET status = 'reviewed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'published' AND id IN (
      SELECT cp.task_id FROM content_plans cp
      JOIN content_plan_feedback cpf ON cpf.plan_id = cp.plan_id
      WHERE cp.task_id IS NOT NULL
    )
  `).run();
  await markReviewed();
  const tasks = await d1.prepare(`
    SELECT t.id, t.task_date, t.platform, t.task_title,
      cp.plan_id, cp.title AS plan_title, cp.title_options, cp.related_post_id AS plan_related_post_id
    FROM content_tasks t
    LEFT JOIN content_plans cp ON cp.task_id = t.id
    WHERE t.related_post_id IS NULL AND t.status IN ('published', 'reviewed')
    ORDER BY t.task_date DESC, t.id DESC
  `).all<LinkableTask>();
  if (!tasks.results.length) return { linked: 0, pending: 0 };

  const used = await d1.prepare("SELECT related_post_id FROM content_tasks WHERE related_post_id IS NOT NULL")
    .all<{ related_post_id: number }>();
  const usedIds = new Set(used.results.map((item) => item.related_post_id));
  const posts = await d1.prepare(`
    SELECT id, platform, title, publish_time FROM social_posts
    WHERE platform IN ('douyin', 'kuaishou', 'weibo')
    ORDER BY publish_time DESC, id DESC LIMIT 1000
  `).all<CandidatePost>();

  const links: Array<{ task: LinkableTask; post: CandidatePost }> = [];
  for (const task of tasks.results) {
    const direct = task.plan_related_post_id
      ? posts.results.find((post) => post.id === task.plan_related_post_id)
      : undefined;
    const candidate = direct && !usedIds.has(direct.id)
      ? { post: direct }
      : bestCandidate(task, posts.results.filter((post) => !usedIds.has(post.id)));
    if (!candidate) continue;
    usedIds.add(candidate.post.id);
    links.push({ task, post: candidate.post });
  }

  if (links.length) {
    const statements: D1PreparedStatement[] = [];
    for (const { task, post } of links) {
      statements.push(d1.prepare(`
        UPDATE content_tasks SET related_post_id = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND related_post_id IS NULL
      `).bind(post.id, post.publish_time, task.id));
      if (task.plan_id) {
        statements.push(d1.prepare(`
          UPDATE content_plans SET related_post_id = ?, status = 'published', updated_time = CURRENT_TIMESTAMP
          WHERE plan_id = ?
        `).bind(post.id, task.plan_id));
      }
    }
    await d1.batch(statements);
    await refreshContentPlanFeedback(d1);
    await markReviewed();
  }
  return { linked: links.length, pending: tasks.results.length - links.length };
}

export function executionAnalysis(row: Record<string, unknown>) {
  const postId = Number(row.related_post_id ?? 0);
  if (!postId) return { state: "waiting", label: "等待作品", onTime: null, reachedTarget: null };
  const views = Number(row.post_views ?? 0);
  const interactions = Number(row.post_likes ?? 0) + Number(row.post_comments ?? 0)
    + Number(row.post_favorites ?? 0) + Number(row.post_shares ?? 0);
  const interactionRate = views > 0 ? interactions / views * 100 : 0;
  const targetViews = Number(row.target_views ?? 0);
  const targetInteractionRate = Number(row.target_interaction_rate ?? 0);
  const targetFansGrowth = Number(row.target_fans_growth ?? 0);
  const fansGrowth = Number(row.post_fans_growth ?? 0);
  const viewAchievement = targetViews > 0 ? views / targetViews * 100 : null;
  const interactionAchievement = targetInteractionRate > 0 ? interactionRate / targetInteractionRate * 100 : null;
  const fansAchievement = targetFansGrowth > 0 ? fansGrowth / targetFansGrowth * 100 : null;
  const comparable = [viewAchievement, interactionAchievement, fansAchievement].filter((value): value is number => value !== null);
  const reachedTarget = comparable.length ? comparable.reduce((sum, value) => sum + Math.min(value, 120), 0) / comparable.length >= 100 : null;
  const publishDate = String(row.post_publish_time ?? "").slice(0, 10);
  const dueDate = String(row.task_date ?? "").slice(0, 10);
  return {
    state: "linked",
    label: reachedTarget === null ? "已关联" : reachedTarget ? "达到预期" : "待优化",
    onTime: Boolean(publishDate && dueDate && publishDate <= dueDate),
    reachedTarget,
    playAchievement: viewAchievement === null ? null : Math.round(viewAchievement),
    interactionAchievement: interactionAchievement === null ? null : Math.round(interactionAchievement),
    fansAchievement: fansAchievement === null ? null : Math.round(fansAchievement),
    effectScore: row.effect_score === null || row.effect_score === undefined ? null : Math.round(Number(row.effect_score)),
  };
}
