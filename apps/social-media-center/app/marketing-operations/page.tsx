"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, platformLabel } from "@/lib/format";

type Topic = { id: number; platform: string; topic_name: string; relevance_score: number; recommended_title: string; level: string };
type Task = { id: number; task_date: string; task_title: string; platform: string; content_type: string; responsible_person: string | null; priority: string; status: string };
type EventType = "publish" | "live" | "campaign" | "holiday" | "hot";
type CalendarEvent = { id: string; date: string; type: EventType; title: string; meta: string; href: string };
type Goal = { label: string; actual: number; target: number; rate: number | null; unit: string };
type OperationsData = {
  today: string; yesterday: string; month: string;
  todos: { recommendedHotspots: Topic[]; shooting: Task[]; publishing: Task[]; overdue: Task[]; review: Task[] };
  calendar: CalendarEvent[];
  goals: { works: Goal; lives: Goal; fans: Goal; views: Goal };
  brief: {
    todayHotspots: Topic[];
    yesterdayBest: null | { id: number; platform: string; title: string; views: number; likes: number; comments: number; interaction_rate: number };
    todayAdvice: string; risks: string[]; suggestions: string[];
  };
  freshness: null | { source_name: string; status: string; success_count: number; error_count: number; collected_at: string; collected_date: string };
  updatedAt: string;
};

const eventNames: Record<EventType, string> = { publish: "发布计划", live: "直播计划", campaign: "营销活动", holiday: "节假日", hot: "热点事件" };
const priorityNames: Record<string, string> = { urgent: "紧急", high: "高优先", normal: "普通", low: "低优先" };

function currentBeijingMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function shiftMonth(value: string, amount: number) {
  const date = new Date(`${value}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function calendarCells(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = first.getUTCDay() || 7;
  return [...Array(offset - 1).fill(null), ...Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)];
}

function goalValue(goal: Goal) {
  return goal.rate === null ? "未设目标" : `${goal.rate}%`;
}

export default function MarketingOperationsPage() {
  const [month, setMonth] = useState(currentBeijingMonth);
  const [data, setData] = useState<OperationsData | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (selectedMonth: string) => {
    try {
      const response = await fetch(`/api/marketing-operations?month=${selectedMonth}`);
      if (!response.ok) throw new Error("营销运营数据读取失败");
      const result = await response.json() as OperationsData;
      setData(result);
      setSelectedDate((current) => current.startsWith(result.month) ? current : result.today.startsWith(result.month) ? result.today : `${result.month}-01`);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "营销运营数据读取失败"); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(month), 0); return () => window.clearTimeout(timer); }, [load, month]);
  const cells = useMemo(() => calendarCells(month), [month]);
  const selectedEvents = useMemo(() => data?.calendar.filter((event) => event.date === selectedDate) ?? [], [data, selectedDate]);

  if (!data) return <div className={error ? "error-panel" : "loading-panel"}>{error || "正在汇总今日营销工作…"}</div>;
  const todoGroups = [
    { key: "hot", label: "今日推荐热点", count: data.todos.recommendedHotspots.length, href: "/hot-topics", items: data.todos.recommendedHotspots.map((item) => ({ id: `hot-${item.id}`, title: item.topic_name, meta: `${platformLabel(item.platform)} · 关联度 ${Math.round(item.relevance_score)}%` })) },
    { key: "shoot", label: "今日待拍内容", count: data.todos.shooting.length, href: "/tasks", items: data.todos.shooting.map((item) => ({ id: `task-${item.id}`, title: item.task_title, meta: `${item.responsible_person || "待分配"} · ${priorityNames[item.priority]}` })) },
    { key: "publish", label: "今日待发布内容", count: data.todos.publishing.length, href: "/tasks", items: data.todos.publishing.map((item) => ({ id: `task-${item.id}`, title: item.task_title, meta: `${platformLabel(item.platform)} · ${item.responsible_person || "待分配"}` })) },
    { key: "overdue", label: "今日逾期任务", count: data.todos.overdue.length, href: "/tasks", items: data.todos.overdue.map((item) => ({ id: `task-${item.id}`, title: item.task_title, meta: `截止 ${item.task_date} · ${item.responsible_person || "待分配"}` })) },
    { key: "review", label: "今日待复盘内容", count: data.todos.review.length, href: "/tasks", items: data.todos.review.map((item) => ({ id: `task-${item.id}`, title: item.task_title, meta: `${platformLabel(item.platform)} · 已发布待复盘` })) },
  ];

  return <div className="page-stack marketing-operations-page">
    <header className="page-heading compact-heading">
      <div><p className="eyebrow">MARKETING OPERATIONS · V1.0</p><h1>营销运营中心</h1><p>营销部每日统一入口：先看待办和风险，再安排内容、直播、活动与热点行动。</p></div>
      <div className="operations-date-badge"><span>今日</span><strong>{data.today}</strong><small>{data.freshness ? `最近数据：${data.freshness.collected_date}` : "暂无采集记录"}</small></div>
    </header>

    <section className="operations-priority-strip">
      <div><span>今日行动总数</span><strong>{todoGroups.reduce((sum, group) => sum + group.count, 0)}</strong><small>五类运营待办</small></div>
      <div><span>紧急处理</span><strong>{data.todos.overdue.length}</strong><small>逾期任务</small></div>
      <div><span>内容执行</span><strong>{data.todos.shooting.length + data.todos.publishing.length}</strong><small>待拍 + 待发布</small></div>
      <div><span>AI热点机会</span><strong>{data.todos.recommendedHotspots.length}</strong><small>A级推荐</small></div>
      <div><span>待复盘</span><strong>{data.todos.review.length}</strong><small>已发布内容</small></div>
    </section>

    <section className="panel operations-todo-panel">
      <div className="panel-heading"><div><span className="section-kicker">TODAY ACTIONS</span><h2>今日待办</h2></div><span className="section-note">北京时间 {data.today} · 只显示真实待办</span></div>
      <div className="operations-todo-grid">
        {todoGroups.map((group) => <article className={`todo-group todo-${group.key}`} key={group.key}>
          <header><span>{group.label}</span><b>{group.count}</b></header>
          <div>{group.items.slice(0, 3).map((item) => <a href={group.href} key={item.id}><strong>{item.title}</strong><small>{item.meta}</small></a>)}
            {!group.items.length && <p>今日暂无</p>}
          </div>
          <a className="todo-more" href={group.href}>进入处理 →</a>
        </article>)}
      </div>
    </section>

    <section className="operations-calendar-layout">
      <article className="panel operations-calendar-panel">
        <div className="panel-heading calendar-heading"><div><span className="section-kicker">OPERATIONS CALENDAR</span><h2>运营日历</h2></div><div className="calendar-month-nav"><button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button><strong>{month.replace("-", "年")}月</strong><button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button><button onClick={() => setMonth(currentBeijingMonth())}>本月</button></div></div>
        <div className="calendar-legend">{Object.entries(eventNames).map(([type, label]) => <span key={type}><i className={`event-${type}`} />{label}</span>)}</div>
        <div className="operations-calendar-week">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="operations-calendar-grid">
          {cells.map((date, index) => date ? <button key={date} className={`${selectedDate === date ? "selected" : ""} ${date === data.today ? "today" : ""}`} onClick={() => setSelectedDate(date)}>
            <b>{Number(date.slice(-2))}</b><div>{data.calendar.filter((event) => event.date === date).slice(0, 3).map((event) => <i className={`event-${event.type}`} key={event.id} title={event.title} />)}</div>
          </button> : <span className="calendar-blank" key={`blank-${index}`} />)}
        </div>
      </article>
      <aside className="panel calendar-agenda">
        <span className="section-kicker">DAY AGENDA</span><h2>{selectedDate || data.today}</h2><p>{selectedEvents.length} 项运营安排</p>
        <div>{selectedEvents.map((event) => <a href={event.href} key={event.id}><i className={`event-${event.type}`} /><div><span>{eventNames[event.type]}</span><strong>{event.title}</strong><small>{event.meta}</small></div></a>)}{!selectedEvents.length && <div className="calendar-empty">当天暂无发布、直播、活动、节假日或推荐热点安排。</div>}</div>
      </aside>
    </section>

    <section className="panel marketing-goals-panel">
      <div className="panel-heading"><div><span className="section-kicker">MONTHLY GOALS</span><h2>营销目标</h2></div><span className="section-note">{data.month.replace("-", "年")}月 · 真实完成值 / 已设目标</span></div>
      <div className="marketing-goals-grid">{Object.values(data.goals).map((goal) => <article key={goal.label}>
        <span>{goal.label}</span><strong>{goalValue(goal)}</strong><div><i style={{ width: `${Math.min(goal.rate ?? 0, 100)}%` }} /></div><small>{goal.target > 0 ? `${formatCompact(goal.actual)} / ${formatCompact(goal.target)} ${goal.unit}` : `实际 ${formatCompact(goal.actual)} ${goal.unit} · 尚未设置目标`}</small>
      </article>)}</div>
    </section>

    <section className="panel operations-brief-panel">
      <div className="panel-heading"><div><span className="section-kicker">AI DAILY BRIEF</span><h2>AI每日简报</h2></div><span className="section-note">规则模型 · 数据缺失会明确提示</span></div>
      <div className="operations-brief-grid">
        <article><span>今日热点</span>{data.brief.todayHotspots.map((topic) => <a href="/hot-topics" key={topic.id}><strong>{topic.topic_name}</strong><small>{platformLabel(topic.platform)} · 关联度 {Math.round(topic.relevance_score)}%</small></a>)}{!data.brief.todayHotspots.length && <p>今日暂无 A 级热点。</p>}</article>
        <article><span>昨日最佳作品</span>{data.brief.yesterdayBest ? <a href={`/insights/content/detail?id=${data.brief.yesterdayBest.id}`}><strong>{data.brief.yesterdayBest.title}</strong><small>播放 {formatCompact(data.brief.yesterdayBest.views)} · 互动率 {data.brief.yesterdayBest.interaction_rate}%</small></a> : <p>昨日没有已入库作品。</p>}</article>
        <article><span>风险提醒</span><ul>{data.brief.risks.map((risk) => <li key={risk}>{risk}</li>)}{!data.brief.risks.length && <li>今日未发现明显执行或数据风险。</li>}</ul></article>
        <article className="brief-advice"><span>今日建议与运营动作</span><strong>{data.brief.todayAdvice}</strong><ol>{data.brief.suggestions.slice(1).map((item) => <li key={item}>{item}</li>)}</ol></article>
      </div>
      <p className="operations-source-note">数据来源：hot_topics、hot_topic_analysis、content_tasks、content_plans、content_plan_feedback、social_posts、fan_growth_records、collection_logs · 更新时间：{new Date(data.updatedAt).toLocaleString("zh-CN", { hour12: false })}</p>
    </section>
  </div>;
}
