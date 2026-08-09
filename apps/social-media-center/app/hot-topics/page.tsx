"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, platformLabel } from "@/lib/format";

type Topic = {
  id: number;
  ranking: number | null;
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
  source_agent: string | null;
  hot_score: number | null;
  recommended_topic: string | null;
  video_direction: string | null;
  publish_time_suggestion: string | null;
};

type DouyinPreview = {
  previewToken: string;
  previewOnly: boolean;
  collectedAt: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  top10: Array<Omit<Topic, "id" | "created_at"> & { ranking: number; trend_note: string }>;
  analysis: {
    top10Conclusion: string;
    recommendedTopics: Array<{ ranking: number; topic: string; relevance: number; reason: string; recommendedTitle: string; direction: string; shootingDirection: string }>;
  };
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

type AgentHotTopic = {
  id: number;
  platform: string;
  rank: number;
  topic_title: string;
  heat_value: string;
  keyword: string;
  url: string | null;
  publish_time: string | null;
  category: string | null;
  source_agent: string;
  ai_relevance_score: number | null;
  ai_analysis: string | null;
  ai_recommendation: string | null;
};

type AgentAiResult = {
  relevanceScore: number;
  worthFollowing: boolean;
  worthFollowingLabel: string;
  analysis: string;
  shootingDirection: string;
  shortVideoTitle: string;
  liveTheme: string;
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
  const [collecting, setCollecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<DouyinPreview | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Topic | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [agentTopics, setAgentTopics] = useState<AgentHotTopic[]>([]);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [agentAnalysis, setAgentAnalysis] = useState<{ topic: AgentHotTopic; ai: AgentAiResult } | null>(null);
  const [agentFile, setAgentFile] = useState<File | null>(null);
  const [importingAgent, setImportingAgent] = useState(false);

  const loadTopics = useCallback(async () => {
    try {
      const [response, agentResponse] = await Promise.all([fetch("/api/hot-topics"), fetch("/api/hot-topic-data")]);
      if (!response.ok || !agentResponse.ok) throw new Error("热点数据读取失败");
      setData(await response.json() as HotTopicData);
      const agentResult = await agentResponse.json() as { topics: AgentHotTopic[] };
      setAgentTopics(agentResult.topics);
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

  async function collectPreview() {
    setCollecting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/hot-topics/douyin/preview", { cache: "no-store" });
      const result = await response.json() as DouyinPreview & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "抖音热点预览生成失败");
      setPreview(result);
      setMessage({ type: "success", text: `已读取抖音官方热榜 ${result.successCount} 条；当前仅为预览，尚未写入数据库。` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "抖音热点预览生成失败" });
    } finally {
      setCollecting(false);
    }
  }

  async function confirmPreview() {
    if (!preview || !window.confirm(`确认将本次抖音热榜 ${preview.totalCount} 条写入 hot_topics？`)) return;
    setConfirming(true);
    setMessage(null);
    try {
      const response = await fetch("/api/hot-topics/douyin/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, previewToken: preview.previewToken }),
      });
      const result = await response.json() as { error?: string; successCount?: number };
      if (!response.ok) throw new Error(result.error ?? "热点写入失败");
      setPreview(null);
      setMessage({ type: "success", text: `抖音今日热点已写入 ${result.successCount ?? 0} 条，采集日志已保存。` });
      await loadTopics();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "热点写入失败" });
    } finally {
      setConfirming(false);
    }
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

  async function analyzeAgentTopic(topic: AgentHotTopic) {
    setAnalyzingId(topic.id);
    setMessage(null);
    try {
      const response = await fetch("/api/hot-topic-data/analyze", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: topic.id }),
      });
      const result = await response.json() as { error?: string; ai?: AgentAiResult };
      if (!response.ok || !result.ai) throw new Error(result.error || "AI热点分析失败");
      setAgentAnalysis({ topic, ai: result.ai });
      setAgentTopics((current) => current.map((item) => item.id === topic.id
        ? { ...item, ai_relevance_score: result.ai?.relevanceScore ?? item.ai_relevance_score }
        : item));
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "AI热点分析失败" });
    } finally {
      setAnalyzingId(null);
    }
  }

  async function importAgentFile() {
    if (!agentFile) return;
    setImportingAgent(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", agentFile);
      const response = await fetch("/api/hot-topic/import", { method: "POST", body: form });
      const result = await response.json() as { error?: string; successCount?: number };
      if (!response.ok) throw new Error(result.error || "WorkBuddy热点文件导入失败");
      setMessage({ type: "success", text: `WorkBuddy热点已导入 ${result.successCount ?? 0} 条。` });
      setAgentFile(null);
      await loadTopics();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "WorkBuddy热点文件导入失败" });
    } finally {
      setImportingAgent(false);
    }
  }

  return (
    <div className="page-stack hot-topic-page">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">HOT TOPIC INTELLIGENCE</p><h1>新媒体热点监测中心</h1><p>接收外部 Agent 与抖音测试数据，评估景区关联度，并将趋势转化为可执行选题。</p></div>
        <div className="hot-heading-actions"><button className="secondary-button" onClick={showForm ? () => setShowForm(false) : openCreate}>{showForm ? "收起表单" : "＋ 手工新增"}</button><button className="primary-button" onClick={() => void collectPreview()} disabled={collecting}>{collecting ? "采集中…" : "采集今日热点"}</button></div>
      </header>

      {preview && <section className="panel hot-preview-panel">
        <div className="panel-heading"><div><span className="section-kicker">PREVIEW ONLY</span><h2>抖音今日热点采集预览</h2></div><span className="preview-lock">未入库</span></div>
        <div className="preview-summary"><span>读取 <strong>{preview.totalCount}</strong> 条</span><span>成功 <strong>{preview.successCount}</strong> 条</span><span>失败 <strong>{preview.failedCount}</strong> 条</span><span>采集时间 <strong>{new Date(preview.collectedAt).toLocaleString("zh-CN")}</strong></span></div>
        <p className="preview-conclusion">{preview.analysis.top10Conclusion}</p>
        <div className="table-wrap"><table className="hot-preview-table"><thead><tr><th>排名</th><th>热点名称</th><th>热度</th><th>趋势</th><th>分类</th><th>关联度</th></tr></thead><tbody>{preview.top10.map((topic) => <tr key={topic.ranking}><td><strong>TOP {topic.ranking}</strong></td><td>{topic.topic_name}</td><td>{formatCompact(topic.heat_value)}</td><td><span className="trend-pill trend-new" title={topic.trend_note}>首次采集</span></td><td>{topic.category}</td><td><strong className="relevance-value">{Math.round((topic.related_degree ?? 0) * 100)}%</strong></td></tr>)}</tbody></table></div>
        <div className="preview-opportunities"><h3>AI 热点机会分析</h3>{preview.analysis.recommendedTopics.map((item) => <article key={item.ranking}><span>热榜 {item.ranking}</span><div><strong>{item.topic} · 关联 {item.relevance}%</strong><h4>{item.recommendedTitle}</h4><p><b>内容方向：</b>{item.direction}</p><p><b>拍摄方向：</b>{item.shootingDirection}</p></div></article>)}</div>
        <div className="hot-preview-actions"><button className="secondary-button" onClick={() => setPreview(null)}>取消本次预览</button><button className="primary-button" onClick={() => void confirmPreview()} disabled={confirming}>{confirming ? "写入中…" : `人工确认并写入 ${preview.totalCount} 条`}</button></div>
      </section>}

      <section className="panel agent-data-panel">
        <div className="panel-heading"><div><span className="section-kicker">AI AGENT DATA CENTER</span><h2>AI Agent数据接入中心</h2></div><div className="agent-import-actions"><label className="agent-file-button">{agentFile ? agentFile.name : "选择WorkBuddy文件"}<input type="file" accept=".json,.xlsx,.xls" onChange={(event) => setAgentFile(event.target.files?.[0] ?? null)} /></label><button className="primary-button" onClick={() => void importAgentFile()} disabled={!agentFile || importingAgent}>{importingAgent ? "导入中…" : "导入数据"}</button><span className="agent-source-badge">WorkBuddy热点监测Agent · {agentTopics.length} 条</span></div></div>
        <p className="panel-intro">展示 WorkBuddy 生成并导入的热点数据；本系统仅负责接收、存储、分析和业务应用。</p>
        <div className="table-wrap"><table className="agent-hot-table"><thead><tr><th>平台</th><th>排名</th><th>热点标题</th><th>热度</th><th>关键词</th><th>来源</th><th>AI分析</th></tr></thead><tbody>
          {agentTopics.map((topic) => <tr key={topic.id}><td><span className={`platform-tag tag-${topic.platform}`}>{platformLabel(topic.platform)}</span></td><td><strong>TOP {topic.rank}</strong></td><td><strong>{topic.topic_title}</strong><small>{topic.category || "未分类"} · {topic.publish_time || "时间未知"}</small></td><td className="agent-heat-value">{topic.heat_value}</td><td><span className="keyword-chip">{topic.keyword}</span></td><td className="agent-source-cell">{topic.source_agent}</td><td><button className="analysis-action" onClick={() => void analyzeAgentTopic(topic)} disabled={analyzingId === topic.id}>{analyzingId === topic.id ? "分析中…" : topic.ai_relevance_score === null ? "AI分析" : `重新分析 · ${Math.round(topic.ai_relevance_score)}分`}</button></td></tr>)}
          {!agentTopics.length && <tr><td className="empty-cell" colSpan={7}>等待 WorkBuddy 最新 JSON 文件导入。</td></tr>}
        </tbody></table></div>
      </section>

      {agentAnalysis && <section className="panel agent-analysis-panel">
        <div className="panel-heading"><div><span className="section-kicker">AI OPPORTUNITY ANALYSIS</span><h2>{agentAnalysis.topic.topic_title}</h2></div><button className="secondary-button" onClick={() => setAgentAnalysis(null)}>关闭分析</button></div>
        <div className="agent-analysis-score"><strong>{agentAnalysis.ai.relevanceScore}</strong><span>关联度评分</span><em className={agentAnalysis.ai.worthFollowing ? "follow-yes" : "follow-no"}>{agentAnalysis.ai.worthFollowingLabel}</em></div>
        <div className="agent-analysis-grid"><article><span>关联分析</span><p>{agentAnalysis.ai.analysis}</p></article><article><span>推荐拍摄方向</span><p>{agentAnalysis.ai.shootingDirection}</p></article><article><span>推荐短视频标题</span><p>{agentAnalysis.ai.shortVideoTitle}</p></article><article><span>推荐直播主题</span><p>{agentAnalysis.ai.liveTheme}</p></article></div>
      </section>}

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
            <label>平台<select name="platform" defaultValue={editing?.platform ?? "douyin"} required><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="weibo">微博</option><option value="web">全网</option></select></label>
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
            <div className="panel-heading"><div><span className="section-kicker">TODAY TOP 10</span><h2>今日热点 TOP10</h2></div><span className="section-note">优先按官方 ranking</span></div>
            <ol className="hot-ranking-list">
              {data.ranking.map((topic, index) => {
                const width = data.ranking[0]?.heat_value ? Math.max(8, topic.heat_value / data.ranking[0].heat_value * 100) : 8;
                return <li key={topic.id}><span className="rank-number">{String(topic.ranking ?? index + 1).padStart(2, "0")}</span><div><div className="rank-copy"><strong>{topic.topic_name}</strong><span>{formatCompact(topic.heat_value)}</span></div><div className="rank-track"><i style={{ width: `${width}%` }} /></div><small>{trendNames[topic.trend]} · 关联 {Math.round((topic.related_degree ?? 0) * 100)}%</small></div></li>;
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
          <div className="table-wrap"><table className="hot-topic-table"><thead><tr><th>排名</th><th>平台</th><th>热点名称</th><th>来源 Agent</th><th>热度</th><th>趋势</th><th>热点评分</th><th>关联程度</th><th>推荐选题</th><th>状态</th><th>操作</th></tr></thead><tbody>
            {data.topics.map((topic) => <tr key={topic.id}><td><strong>{topic.ranking ? `TOP ${topic.ranking}` : "—"}</strong></td><td><span className={`platform-tag tag-${topic.platform}`}>{platformLabel(topic.platform)}</span></td><td><strong>{topic.topic_name}</strong><small className="topic-category">{topic.category || "未分类"}</small></td><td className="agent-source-cell">{topic.source_agent || "系统内置"}</td><td className="metric-cell"><strong>{formatCompact(topic.heat_value)}</strong></td><td><span className={`trend-pill trend-${topic.trend}`}>{trendNames[topic.trend]}</span></td><td><strong>{topic.hot_score === null ? "—" : Math.round(topic.hot_score)}</strong></td><td><strong className="relevance-value">{Math.round((topic.related_degree ?? 0) * 100)}%</strong></td><td className="suggestion-cell"><strong>{topic.recommended_topic || topic.ai_suggestion || "—"}</strong>{topic.video_direction && <small>{topic.video_direction}</small>}{topic.publish_time_suggestion && <small>{topic.publish_time_suggestion}</small>}</td><td><span className={`topic-status status-${topic.status}`}>{statusNames[topic.status]}</span></td><td><div className="row-actions"><button onClick={() => openEdit(topic)}>编辑</button><button className="danger-link" onClick={() => void deleteTopic(topic)}>删除</button></div></td></tr>)}
            {!data.topics.length && <tr><td className="empty-cell" colSpan={11}>暂无已确认热点，可通过外部 Agent 接口或抖音测试采集导入。</td></tr>}
          </tbody></table></div>
        </section>
      </>}
    </div>
  );
}
