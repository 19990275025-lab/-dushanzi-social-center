"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { platformLabel } from "@/lib/format";

type Task = {
  id: number;
  task_date: string;
  platform: string;
  task_title: string;
  content_type: string;
  responsible_person: string | null;
  status: string;
  review_result: string | null;
};

const statusNames: Record<string, string> = {
  idea: "待评估",
  approved: "已通过",
  in_production: "制作中",
  review: "待审核",
  scheduled: "已排期",
  published: "已发布",
  blocked: "受阻",
  done: "已完成",
  cancelled: "已取消",
};

const availableStatuses = Object.keys(statusNames);

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadTasks = useCallback(() => {
    fetch("/api/tasks")
      .then(async (response) => {
        if (!response.ok) throw new Error("任务数据读取失败");
        return response.json() as Promise<{ tasks: Task[] }>;
      })
      .then((result) => {
        setTasks(result.tasks);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(loadTasks, [loadTasks]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setError(result.error ?? "新增任务失败");
      return;
    }

    setShowForm(false);
    setError("");
    loadTasks();
  }

  async function updateStatus(id: number, status: string) {
    const previous = tasks;
    setTasks((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));

    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });

    if (!response.ok) {
      setTasks(previous);
      setError("状态更新失败，请稍后重试");
    }
  }

  const completed = tasks.filter((task) => ["published", "done"].includes(task.status)).length;
  const inProgress = tasks.filter((task) => ["in_production", "review", "scheduled"].includes(task.status)).length;

  return (
    <div className="page-stack">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">CONTENT WORKFLOW</p><h1>任务管理</h1><p>跟踪内容从选题、制作到发布的完整进度。</p></div>
        <button className="primary-button" onClick={() => setShowForm((value) => !value)}>{showForm ? "收起表单" : "＋ 新增任务"}</button>
      </header>

      <section className="task-summary-grid">
        <article><span>全部任务</span><strong>{tasks.length}</strong><small>数据库当前记录</small></article>
        <article><span>推进中</span><strong>{inProgress}</strong><small>制作、审核与排期</small></article>
        <article><span>已完成</span><strong>{completed}</strong><small>发布或完成</small></article>
        <article><span>完成率</span><strong>{tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%</strong><small>当前任务口径</small></article>
      </section>

      {showForm && (
        <section className="panel task-form-panel">
          <div className="panel-heading"><div><span className="section-kicker">NEW TASK</span><h2>新增内容任务</h2></div></div>
          <form className="task-form" onSubmit={createTask}>
            <label>任务日期<input name="taskDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <label>平台<select name="platform" required><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="weibo">微博</option></select></label>
            <label>内容类型<select name="contentType" required><option value="video">短视频</option><option value="image_text">图文</option><option value="text">文字</option><option value="live">直播</option><option value="article">长文</option></select></label>
            <label>负责人<input name="responsiblePerson" placeholder="请输入负责人" /></label>
            <label className="task-title-field">任务内容<input name="taskTitle" placeholder="例如：峡谷夏季自驾攻略" required /></label>
            <button className="primary-button" disabled={saving}>{saving ? "保存中…" : "保存任务"}</button>
          </form>
        </section>
      )}

      {error && <div className="error-panel inline-error">{error}</div>}

      <section className="panel data-panel">
        <div className="panel-heading"><div><span className="section-kicker">TASK BOARD</span><h2>内容任务</h2></div><span className="section-note">修改状态会实时写入数据库</span></div>
        <div className="table-wrap">
          <table className="task-table">
            <thead><tr><th>日期</th><th>平台</th><th>任务内容</th><th>负责人</th><th>状态</th><th>审核结果</th></tr></thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="date-cell">{task.task_date}</td>
                  <td><span className={`platform-tag tag-${task.platform}`}>{platformLabel(task.platform)}</span></td>
                  <td><strong>{task.task_title}</strong></td>
                  <td>{task.responsible_person || "待分配"}</td>
                  <td><select className={`status-select status-${task.status}`} value={task.status} onChange={(event) => updateStatus(task.id, event.target.value)} aria-label={`修改${task.task_title}状态`}>
                    {availableStatuses.map((status) => <option key={status} value={status}>{statusNames[status]}</option>)}
                  </select></td>
                  <td className="review-cell">{task.review_result || "—"}</td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td className="empty-cell" colSpan={6}>暂无任务，点击右上角新增第一项任务。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
