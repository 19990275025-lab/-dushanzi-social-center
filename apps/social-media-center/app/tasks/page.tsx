"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, platformLabel } from "@/lib/format";

type Execution = {
  state: "waiting" | "linked";
  label: string;
  onTime: boolean | null;
  reachedTarget: boolean | null;
  playAchievement?: number | null;
  interactionAchievement?: number | null;
  fansAchievement?: number | null;
  effectScore?: number | null;
};
type Task = {
  id: number; task_date: string; platform: string; task_title: string; content_type: string;
  responsible_person: string | null; collaborators: string[]; source_type: string; source_id: number | null;
  source_topic_name: string | null; priority: string; status: string; related_post_id: number | null;
  post_title: string | null; post_views: number | null; post_likes: number | null; post_comments: number | null;
  review_result: string | null; execution: Execution;
};
type WeeklyReport = {
  range: { start: string; end: string }; total: number; completed: number; completionRate: number;
  viralCount: number; targetRate: number;
  owners: Array<{ name: string; total: number; completed: number; completionRate: number }>;
};
type TaskData = {
  tasks: Task[]; kanban: string[]; weeklyReport: WeeklyReport;
  association: { linked: number; pending: number };
  collectionFreshness: { collected_at: string; source_name: string } | null;
};

const statusNames: Record<string, string> = {
  planning: "待策划", shoot_pending: "待拍摄", shooting: "拍摄中", edit_pending: "待剪辑",
  review_pending: "待审核", publish_pending: "待发布", published: "已发布", reviewed: "已复盘",
};
const sourceNames: Record<string, string> = {
  hot_topic: "热点监测中心", ai_content_plan: "AI内容策划中心", manual: "人工创建", festival: "节日活动",
};
const priorityNames: Record<string, string> = { urgent: "紧急", high: "高", normal: "普通", low: "低" };
const typeNames: Record<string, string> = { video: "短视频", image_text: "图文", text: "文字", live: "直播", article: "长文" };

function achievement(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

export default function TasksPage() {
  const [data, setData] = useState<TaskData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks");
      if (!response.ok) throw new Error("任务数据读取失败");
      setData(await response.json() as TaskData);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "任务数据读取失败"); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void loadTasks(), 0); return () => window.clearTimeout(timer); }, [loadTasks]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) { setError(result.error ?? "新增任务失败"); return; }
    setShowForm(false); setError(""); setMessage("任务已进入待策划看板"); await loadTasks();
  }

  async function updateStatus(id: number, status: string) {
    if (!data || !statusNames[status]) return;
    const previous = data;
    setData({ ...data, tasks: data.tasks.map((task) => task.id === id ? { ...task, status } : task) });
    const response = await fetch("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!response.ok) { setData(previous); setError("状态更新失败，请稍后重试"); return; }
    setMessage(`任务已移动到“${statusNames[status]}”`); await loadTasks();
  }

  async function syncPosts() {
    setSyncing(true); setMessage("");
    const response = await fetch("/api/tasks", { method: "PUT" });
    const result = await response.json() as { linked?: number; pending?: number };
    setSyncing(false);
    if (!response.ok) { setError("自动关联检查失败"); return; }
    setMessage(result.linked ? `已自动关联 ${result.linked} 条发布作品` : `关联检查完成，${result.pending ?? 0} 项仍等待匹配作品`);
    await loadTasks();
  }

  function startDrag(event: DragEvent<HTMLElement>, taskId: number) {
    event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/task-id", String(taskId)); setDragging(taskId);
  }
  function dropTask(event: DragEvent<HTMLElement>, status: string) {
    event.preventDefault();
    const taskId = Number(event.dataTransfer.getData("text/task-id") || dragging);
    setDragging(null);
    if (Number.isInteger(taskId)) void updateStatus(taskId, status);
  }

  const summary = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const active = tasks.filter((task) => !["published", "reviewed"].includes(task.status)).length;
    const completed = tasks.filter((task) => ["published", "reviewed"].includes(task.status)).length;
    const linked = tasks.filter((task) => task.related_post_id).length;
    return { total: tasks.length, active, completed, linked };
  }, [data]);

  if (!data) return <div className={error ? "error-panel" : "loading-panel"}>{error || "正在读取任务生产流程…"}</div>;
  const weekly = data.weeklyReport;

  return <div className="page-stack task-management-page">
    <header className="page-heading compact-heading">
      <div><p className="eyebrow">CONTENT PRODUCTION · V2.0</p><h1>任务管理中心</h1><p>用八阶段看板管理策划、制作、发布和复盘，发布后由系统自动关联作品。</p></div>
      <div className="task-heading-actions"><button className="secondary-button" onClick={() => void syncPosts()} disabled={syncing}>{syncing ? "检查中…" : "↻ 自动关联作品"}</button><button className="primary-button" onClick={() => setShowForm((value) => !value)}>{showForm ? "收起表单" : "＋ 新增任务"}</button></div>
    </header>

    <section className="task-summary-grid">
      <article><span>全部任务</span><strong>{summary.total}</strong><small>content_tasks</small></article>
      <article><span>生产中</span><strong>{summary.active}</strong><small>策划至待发布</small></article>
      <article><span>已发布 / 复盘</span><strong>{summary.completed}</strong><small>进入效果验证</small></article>
      <article><span>已关联作品</span><strong>{summary.linked}</strong><small>自动匹配 social_posts</small></article>
    </section>

    {showForm && <section className="panel task-form-panel">
      <div className="panel-heading"><div><span className="section-kicker">NEW TASK</span><h2>创建内容生产任务</h2></div><span className="section-note">新任务默认进入“待策划”</span></div>
      <form className="task-form task-v2-form" onSubmit={createTask}>
        <label>截止时间<input name="taskDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>平台<select name="platform" required><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="weibo">微博</option></select></label>
        <label>内容类型<select name="contentType" required><option value="video">短视频</option><option value="image_text">图文</option><option value="live">直播</option><option value="article">长文</option></select></label>
        <label>任务来源<select name="sourceType" required><option value="manual">人工创建</option><option value="hot_topic">热点监测中心</option><option value="ai_content_plan">AI内容策划中心</option><option value="festival">节日活动</option></select></label>
        <label>来源ID<input name="sourceId" inputMode="numeric" placeholder="可选" /></label>
        <label>优先级<select name="priority" required><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option><option value="low">低</option></select></label>
        <label>负责人<input name="responsiblePerson" placeholder="待分配" /></label>
        <label>协助人<input name="collaborators" placeholder="多人用逗号分隔" /></label>
        <label className="task-title-field">任务名称<input name="taskTitle" placeholder="例如：暑期峡谷第一视角体验" required /></label>
        <button className="primary-button" disabled={saving}>{saving ? "保存中…" : "创建任务"}</button>
      </form>
    </section>}

    {message && <div className="planning-message">{message}</div>}
    {error && <div className="error-panel inline-error">{error}</div>}

    <section className="panel task-kanban-panel">
      <div className="panel-heading"><div><span className="section-kicker">KANBAN WORKFLOW</span><h2>内容生产看板</h2></div><span className="section-note">拖拽任务卡片即可修改状态</span></div>
      <div className="task-kanban-board">
        {data.kanban.map((status) => {
          const items = data.tasks.filter((task) => task.status === status);
          return <section className={`kanban-column kanban-${status}`} key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropTask(event, status)}>
            <header><span>{statusNames[status]}</span><b>{items.length}</b></header>
            <div className="kanban-card-list">
              {items.map((task) => <article className={`kanban-task-card priority-${task.priority} ${dragging === task.id ? "dragging" : ""}`} draggable key={task.id} onDragStart={(event) => startDrag(event, task.id)} onDragEnd={() => setDragging(null)}>
                <div className="task-card-flags"><span className={`task-priority priority-${task.priority}`}>{priorityNames[task.priority] ?? task.priority}</span><span>{sourceNames[task.source_type] ?? task.source_type}</span></div>
                <h3>{task.task_title}</h3>
                {task.source_topic_name && <p className="task-source-topic">来源热点：{task.source_topic_name}</p>}
                <div className="task-card-meta"><span className={`platform-tag tag-${task.platform}`}>{platformLabel(task.platform)}</span><span>{typeNames[task.content_type] ?? task.content_type}</span><span>截止 {task.task_date.slice(5)}</span></div>
                <div className="task-people"><strong>{task.responsible_person || "待分配"}</strong><small>{task.collaborators.length ? `协助：${task.collaborators.join("、")}` : "暂无协助人"}</small></div>
                <div className={`task-execution-state ${task.execution.state}`}><span>{task.execution.state === "linked" ? "✓" : "○"} {task.execution.label}</span>{task.execution.onTime !== null && <small>{task.execution.onTime ? "按时完成" : "已逾期"}</small>}</div>
                {task.execution.state === "linked" && <div className="task-achievement-grid"><span>播放<b>{achievement(task.execution.playAchievement)}</b></span><span>互动<b>{achievement(task.execution.interactionAchievement)}</b></span><span>涨粉<b>{achievement(task.execution.fansAchievement)}</b></span></div>}
                {task.related_post_id && <div className="task-linked-post"><span>{task.post_title}</span><small>播放 {formatCompact(Number(task.post_views ?? 0))} · 赞 {formatCompact(Number(task.post_likes ?? 0))} · 评 {formatCompact(Number(task.post_comments ?? 0))}</small></div>}
                <select aria-label={`移动${task.task_title}`} value={task.status} onChange={(event) => void updateStatus(task.id, event.target.value)}>{data.kanban.map((next) => <option value={next} key={next}>{statusNames[next]}</option>)}</select>
              </article>)}
              {!items.length && <div className="kanban-empty">拖拽任务到这里</div>}
            </div>
          </section>;
        })}
      </div>
    </section>

    <section className="panel task-weekly-report">
      <div className="panel-heading"><div><span className="section-kicker">WEEKLY OPERATIONS</span><h2>运营周报</h2></div><span className="section-note">{weekly.range.start} — {weekly.range.end}</span></div>
      <div className="task-weekly-kpis"><article><span>本周任务</span><strong>{weekly.total}</strong><small>全部负责人</small></article><article><span>完成率</span><strong>{weekly.completionRate}%</strong><small>{weekly.completed} 项已发布或复盘</small></article><article><span>爆款数量</span><strong>{weekly.viralCount}</strong><small>高于平台基线或AI评分≥80</small></article><article><span>达标率</span><strong>{weekly.targetRate}%</strong><small>播放、互动、涨粉目标</small></article></div>
      <div className="task-owner-stats">
        {weekly.owners.map((owner) => <article key={owner.name}><div><strong>{owner.name}</strong><small>{owner.completed}/{owner.total} 项完成</small></div><div><i style={{ width: `${owner.completionRate}%` }} /></div><b>{owner.completionRate}%</b></article>)}
        {!weekly.owners.length && <div className="kanban-empty">本周暂无排期任务</div>}
      </div>
      <p className="task-data-note">复用 content_plans、content_plan_feedback、social_posts 与 collection_logs；最近采集：{data.collectionFreshness?.collected_at ?? "暂无记录"}。未采集或未设AI目标时不生成模拟达成率。</p>
    </section>
  </div>;
}
