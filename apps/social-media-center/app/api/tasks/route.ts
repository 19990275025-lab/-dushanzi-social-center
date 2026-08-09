import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";

const platforms = new Set(["douyin", "kuaishou", "weibo"]);
const contentTypes = new Set(["video", "image_text", "text", "live", "article"]);
const statuses = new Set([
  "idea",
  "approved",
  "in_production",
  "review",
  "scheduled",
  "published",
  "blocked",
  "done",
  "cancelled",
]);

export async function GET() {
  await ensureDatabase();
  const result = await getD1()
    .prepare(`
      SELECT id, task_date, platform, task_title, content_type,
        responsible_person, status, review_result, created_at
      FROM content_tasks
      WHERE platform IN ('douyin', 'kuaishou', 'weibo')
      ORDER BY task_date DESC, created_at DESC, id DESC
      LIMIT 200
    `)
    .all();

  return Response.json({ tasks: result.results, updatedAt: new Date().toISOString() });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as Record<string, unknown>;
  const taskDate = String(payload.taskDate ?? "").trim();
  const platform = String(payload.platform ?? "").trim();
  const taskTitle = String(payload.taskTitle ?? "").trim();
  const contentType = String(payload.contentType ?? "").trim();
  const responsiblePerson = String(payload.responsiblePerson ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
    return Response.json({ error: "请选择有效任务日期" }, { status: 400 });
  }
  if (!platforms.has(platform) || !contentTypes.has(contentType) || !taskTitle) {
    return Response.json({ error: "请完整填写平台、任务内容和内容类型" }, { status: 400 });
  }

  const task = await getD1()
    .prepare(`
      INSERT INTO content_tasks
        (task_date, platform, task_title, content_type, responsible_person, status)
      VALUES (?, ?, ?, ?, ?, 'idea')
      RETURNING id, task_date, platform, task_title, content_type,
        responsible_person, status, review_result, created_at
    `)
    .bind(taskDate, platform, taskTitle, contentType, responsiblePerson || null)
    .first();

  return Response.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as Record<string, unknown>;
  const id = Number(payload.id);
  const status = String(payload.status ?? "");

  if (!Number.isInteger(id) || id <= 0 || !statuses.has(status)) {
    return Response.json({ error: "任务或状态无效" }, { status: 400 });
  }

  const task = await getD1()
    .prepare(`
      UPDATE content_tasks
      SET status = ?
      WHERE id = ?
      RETURNING id, task_date, platform, task_title, content_type,
        responsible_person, status, review_result, created_at
    `)
    .bind(status, id)
    .first();

  if (!task) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }

  return Response.json({ task });
}
