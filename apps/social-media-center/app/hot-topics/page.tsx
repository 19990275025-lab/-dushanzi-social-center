"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, platformLabel } from "@/lib/format";

type Topic = {
  id: number;
  platform: string;
  topic_name: string;
  keyword: string;
  heat_value: number;
  trend: string;
  category: string | null;
  related_degree: number | null;
  ai_suggestion: string | null;
  status: string;
  created_at: string;
};

type Recommendation = {
  sourceTopic: string;
  title: string;
  direction: string;
  platform: string;
  shootingAdvice: string;
  relevance: number;
};

type HotTopicData = {
  topics: Topic[];
  ranking: Topic[];
  relationAnalysis: Topic[];
  recommendations: Recommendation[];
  recommendationEngine: string;
  updatedAt: string;
};

const emptyData: HotTopicData = {
  topics: [], ranking: [], relationAnalysis: [], recommendations: [],
  recommendationEngine: "rules-v1", updatedAt: "",
};

const trendNames: Record<string, string> = {
  rising: "上升", stable: "平稳", falling: "下降", new: "新出现",
};
const statusNames: Record<string, string> = {
  active: "监测中", paused: "已暂停", archived: "已归档",
};

export default function HotTopicsPage() {
  const [data, setData] = useState<HotTopicData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Topic | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadTopics = useCallback(async () => {
    try {
      const response = await fetch("/api/hot-topics");
      if (!response.ok) throw new Error("热点数据读取失败");
      setData(await response.json() as HotTopicData);
      setMessage((current) => current?.type === "error" ? null : current);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "热点数据读取失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTopics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTopics]);

  const summary = useMemo(() => {
    const active = data.topics.filter((topic) => topic.status === "active");
    const average = active.length
      ? Math.round(active.reduce((total, topic) => total + (topic.related_degree ?? 0), 0) / active.length * 100)
      : 0;
    return {
      active: active.length,
      highest: active[0]?.heat_value ?? 0,
      average,
      rising: active.filter((topic) => topic.trend === "rising").length,
    };
  }, [data.topics]);

  function openCreate() {
    setEditing(null);
    setShowForm(true);
    setMessage(null);
  }

  function openEdit(topic: Topic) {
    setEditing(topic);
    setShowForm(true);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (editing) Object.assign(payload, { id: editing.id });

    try {
      const response = await fetch("/api/hot-topics", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "热点保存失败");
      setShowForm(false);
      setEditing(null);
      setMessage({ type: "success", text: editing ? "热点已更新，关联评分已重新计算。" : "热点已新增，关联评分已自动生成。" });
      await loadTopics();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "热点保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteTopic(topic: Topic) {
    if (!window.confirm(`确认删除热点“${topic.topic_name}”？此操作不会影响历史作品。`)) return;
    const response = await fetch(`/api/hot-topics?id=${topic.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setMessage({ type: "error", text: result.error ?? "热点删除失败" });
      return;
    }
    setMessage({ type: "success", text: "热点已删除。" });
    await loadTopics();
  }

  return (
    <div className="page-stack hot-topic-page">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">TREND INTELLIGENCE</p><h1>新媒体热点监测中心</h1><p>统一管理平台热点，评估景区关联度，并将趋势转化为可执行选题。</p></div>
        <button className="primary-button" onClick={showForm ? () => setShowForm(false) : openCreate}>{showForm ? "收起表单" : "＋ 新增热点"}</button>
      </header>

      <section className="task-summary-grid hot-summary-grid">
        <article><span>监测中热点</span><strong>{summary.active}</strong><small>状态为监测中的记录</small></article>
        <article><span>最高热度</span><strong>{formatCompact(summary.highest)}</strong><small>当前有效热点峰值</small></article>
        <article><span>平均关联度</span><strong>{summary.average}%</strong><small>规则引擎动态评分</small></article>
        <article><span>上升趋势</span><strong>{summary.rising}</strong><small>值得优先跟进</small></article>
      </section>

      {showForm && (
        <section className="panel hot-form-panel">
          <div className="panel-heading"><div><span className="section-kicker">{editing ? "EDIT TOPIC" : "NEW TOPIC"}</span><h2>{editing ? "编辑热点" : "新增热点"}</h2></div><span className="section-note">关联程度由关键词、景区名称和历史作品自动计算</span></div>
          <form className="hot-topic-form" onSubmit={saveTopic} key={editing?.id ?? "new"}>
            <label>平台<select name="platform" defaultValue={editing?.platform ?? "douyin"} required><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="weibo">微博</option></select></label>
            <label className="hot-name-field">热点名称<input name="topicName" defaultValue={editing?.topic_name ?? ""} placeholder="例如：新疆自驾避暑路线" maxLength={500} required /></label>
            <label>关键词<input name="keyword" defaultValue={editing?.keyword ?? ""} placeholder="例如：新疆旅游" maxLength={255} required /></label>
            <label>热度<input name="heatValue" defaultValue={editing?.heat_value ?? ""} type="number" min="0" step="1" required /></label>
            <label>趋势<select name="trend" defaultValue={editing?.trend ?? "rising"}><option value="rising">上升</option><option value="stable">平稳</option><option value="falling">下降</option><option value="new">新出现</option></select></label>
            <label>分类<input name="category" defaultValue={editing?.category ?? ""} placeholder="旅游 / 地域" maxLength={128} /></label>
            <label>状态<select name="status" defaultValue={editing?.status ?? "active"}><option value="active">监测中</option><option value="paused">暂停</option><option value="archived">归档</option></select></label>
            <label className="hot-suggestion-field">AI 建议<textarea name="aiSuggestion" defaultValue={editing?.ai_suggestion ?? ""} placeholder="输入运营建议，规则推荐会结合热点与历史作品生成选题。" maxLength={2000} /></label>
            <div className="hot-form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>取消</button><button className="primary-button" disabled={saving}>{saving ? "保存中…" : editing ? "保存修改" : "创建热点"}</button></div>
          </form>
        </section>
      )}

      {message && <div className={`import-message ${message.type}`}><span>{message.type === "success" ? "✓" : "!"}</span>{message.text}</div>}
      {loading ? <div className="loading-panel"><span className="loading-dot" />正在读取热点数据库…</div> : <>
        <section className="hot-insight-grid">
          <article className="panel ranking-panel">
            <div className="panel-heading"><div><span className="section-kicker">TOP 10</span><h2>热点排行榜</h2></div><span className="section-note">按 heat_value 降序</span></div>
            <ol className="hot-ranking-list">
              {data.ranking.map((topic, index) => {
                const width = data.ranking[0]?.heat_value ? Math.max(8, topic.heat_value / data.ranking[0].heat_value * 100) : 8;
                return <li key={topic.id}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><div className="rank-copy"><strong>{topic.topic_name}</strong><span>{formatCompact(topic.heat_value)}</span></div><div className="rank-track"><i style={{ width: `${width}%` }} /></div><small>{platformLabel(topic.platform)} · {trendNames[topic.trend]}</small></div></li>;
              })}
              {!data.ranking.length && <li className="empty-list">暂无监测中热点</li>}
            </ol>
          </article>

          <article className="panel relation-panel">
            <div className="panel-heading"><div><span className="section-kicker">SCENIC RELEVANCE</span><h2>景区关联分析</h2></div><span className="rule-badge">规则评分</span></div>
            <p className="panel-intro">根据热点关键词、独山子大峡谷名称及历史作品标题/标签综合计算。</p>
            <div className="relation-list">
              {data.relationAnalysis.map((topic) => <div className="relation-item" key={topic.id}><div><strong>{topic.keyword}</strong><small>{topic.topic_name}</small></div><div className="relation-meter"><span><i style={{ width: `${Math.round((topic.related_degree ?? 0) * 100)}%` }} /></span><strong>{Math.round((topic.related_degree ?? 0) * 100)}%</strong></div></div>)}
              {!data.relationAnalysis.length && <div className="empty-list">暂无可分析热点</div>}
            </div>
          </article>
        </section>

        <section className="panel recommendation-panel">
          <div className="panel-heading light-heading"><div><span className="section-kicker">AI TOPIC IDEAS</span><h2>AI 选题推荐</h2></div><span className="ai-badge">RULES V1</span></div>
          <p className="ai-intro">当前由可解释规则引擎结合热点数据与 social_posts 历史作品生成；服务端已预留大模型适配接口。</p>
          <div className="recommendation-grid">
            {data.recommendations.map((item) => <article key={`${item.sourceTopic}-${item.platform}`}><div className="recommendation-meta"><span className={`platform-tag tag-${item.platform}`}>{platformLabel(item.platform)}</span><em>关联 {item.relevance}%</em></div><h3>{item.title}</h3><p><strong>内容方向</strong>{item.direction}</p><p><strong>拍摄建议</strong>{item.shootingAdvice}</p><small>来源热点：{item.sourceTopic}</small></article>)}
            {!data.recommendations.length && <div className="empty-list">新增监测中热点后生成选题建议</div>}
          </div>
        </section>

        <section className="panel data-panel hot-table-panel">
          <div className="panel-heading"><div><span className="section-kicker">HOT TOPICS</span><h2>热点列表</h2></div><span className="count-badge">{data.topics.length} 条</span></div>
          <div className="table-wrap"><table className="hot-topic-table"><thead><tr><th>平台</th><th>热点名称</th><th>关键词</th><th>热度</th><th>趋势</th><th>关联程度</th><th>AI 建议</th><th>状态</th><th>操作</th></tr></thead><tbody>
            {data.topics.map((topic) => <tr key={topic.id}><td><span className={`platform-tag tag-${topic.platform}`}>{platformLabel(topic.platform)}</span></td><td><strong>{topic.topic_name}</strong><small className="topic-category">{topic.category || "未分类"}</small></td><td><span className="keyword-chip">{topic.keyword}</span></td><td className="metric-cell"><strong>{formatCompact(topic.heat_value)}</strong></td><td><span className={`trend-pill trend-${topic.trend}`}>{trendNames[topic.trend]}</span></td><td><strong className="relevance-value">{Math.round((topic.related_degree ?? 0) * 100)}%</strong></td><td className="suggestion-cell">{topic.ai_suggestion || "—"}</td><td><span className={`topic-status status-${topic.status}`}>{statusNames[topic.status]}</span></td><td><div className="row-actions"><button onClick={() => openEdit(topic)}>编辑</button><button className="danger-link" onClick={() => void deleteTopic(topic)}>删除</button></div></td></tr>)}
            {!data.topics.length && <tr><td className="empty-cell" colSpan={9}>暂无热点，点击右上角新增第一条记录。</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </div>
  );
}
