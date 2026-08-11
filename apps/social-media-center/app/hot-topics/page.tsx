"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGlobalDateRange } from "@/components/GlobalDateFilter";
import { platformLabel } from "@/lib/format";

type AgentHotTopic = {
  id: number;
  platform: string;
  rank: number;
  topic_title: string;
  heat_value: string;
  keyword: string;
  url: string | null;
  publish_time: string | null;
  collect_time: string;
  collection_date: string;
  category: string | null;
  source_agent: string;
  ai_relevance_score: number | null;
  ai_analysis: string | null;
  ai_recommendation: string | null;
  analysis_source: string | null;
  recommendation_level: "A" | "B" | "C";
  tourism_conversion_score: number;
  conversion_components: { heat: number; relevance: number; contentFit: number; commercial: number };
  content_direction: string;
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

type ParsedAnalysis = AgentAiResult & { topic: AgentHotTopic };
type ViewMode = "report" | "ranking";
type GeneratedPlan = {
  id: number;
  topicName: string;
  recommendationLevel: "A" | "B" | "C";
  tourismConversionScore: number;
  shortVideoTitle: string;
  contentDirection: string;
  scriptDirection: string;
  liveTheme: string;
};

const platformTabs = [
  { value: "all", label: "全部热点" },
  { value: "douyin", label: "抖音" },
  { value: "kuaishou", label: "快手" },
  { value: "weibo", label: "微博" },
  { value: "other", label: "其他平台" },
] as const;

const primaryPlatforms = new Set(["douyin", "kuaishou", "weibo"]);
const levelTabs = [
  { value: "all", label: "全部" },
  { value: "A", label: "A级 · 强烈推荐" },
  { value: "B", label: "B级 · 谨慎跟进" },
  { value: "C", label: "C级 · 不建议跟进" },
] as const;
const levelOrder = { A: 0, B: 1, C: 2 } as const;

const platformAdvice: Record<string, { eyebrow: string; title: string; summary: string; actions: string[] }> = {
  all: {
    eyebrow: "CROSS-PLATFORM STRATEGY",
    title: "多平台协同建议",
    summary: "同一热点按平台传播机制拆分表达，避免直接复制同一条内容。",
    actions: ["抖音优先验证短视频钩子", "快手承接互动与直播答疑", "微博放大品牌话题与事件传播"],
  },
  douyin: {
    eyebrow: "DOUYIN CONTENT",
    title: "抖音短视频内容建议",
    summary: "用强画面和短叙事快速验证热点与景区资源的适配度。",
    actions: ["前三秒直接呈现峡谷冲击画面", "标题保留热点词并补充新疆旅行场景", "结尾设置路线、项目或体验问题引导评论"],
  },
  kuaishou: {
    eyebrow: "KUAISHOU ENGAGEMENT",
    title: "快手互动和直播建议",
    summary: "围绕真实体验、游客关系与连续互动承接热点。",
    actions: ["用游客第一视角强化真实感", "将高频问题整理为直播答疑主题", "评论区持续追问并沉淀系列内容"],
  },
  weibo: {
    eyebrow: "WEIBO BRAND",
    title: "微博品牌传播建议",
    summary: "结合公共话题价值与传播风险，建立景区品牌关联。",
    actions: ["优先选择旅游、新疆与自然风景话题", "用图文或短视频解释景区独特性", "避免生硬蹭热点，明确品牌立场与信息来源"],
  },
  other: {
    eyebrow: "FUTURE CHANNELS",
    title: "其他平台扩展建议",
    summary: "为小红书等新增平台保留统一入口，接入后按平台内容机制生成建议。",
    actions: ["沿用 WorkBuddy 标准字段接入", "新增平台配置而非复制页面", "根据平台搜索、社区与转化特点配置规则"],
  },
};

function readObject(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseAnalysis(topic: AgentHotTopic): ParsedAnalysis | null {
  if (topic.ai_relevance_score === null) return null;
  const analysis = readObject(topic.ai_analysis);
  const recommendation = readObject(topic.ai_recommendation);
  return {
    topic,
    relevanceScore: Math.round(topic.ai_relevance_score),
    worthFollowing: Boolean(analysis?.worthFollowing),
    worthFollowingLabel: String(analysis?.worthFollowingLabel ?? "待复核"),
    analysis: String(analysis?.analysis ?? "等待补充关联分析。"),
    shootingDirection: String(recommendation?.shootingDirection ?? "等待补充拍摄方向。"),
    shortVideoTitle: String(recommendation?.shortVideoTitle ?? `独山子大峡谷 × ${topic.keyword}`),
    liveTheme: String(recommendation?.liveTheme ?? "等待补充直播主题。"),
  };
}

function topicTrend() {
  return "首次采集";
}

export default function HotTopicsPage() {
  const range = useGlobalDateRange({ defaultPreset: "today", scope: "hot-topics" });
  const [topics, setTopics] = useState<AgentHotTopic[]>([]);
  const [activePlatform, setActivePlatform] = useState("all");
  const [activeLevel, setActiveLevel] = useState<"all" | "A" | "B" | "C">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("report");
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ParsedAnalysis | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [agentFile, setAgentFile] = useState<File | null>(null);
  const [importingAgent, setImportingAgent] = useState(false);
  const [replacingAgent, setReplacingAgent] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadTopics = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({ platform: "all", from: range.from, to: range.to });
      const response = await fetch(`/api/hot-topic-data?${query.toString()}`, { cache: "no-store" });
      const result = await response.json() as { topics?: AgentHotTopic[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "WorkBuddy热点数据读取失败");
      setTopics(result.topics ?? []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "WorkBuddy热点数据读取失败" });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTopics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTopics]);

  const topicsInRange = useMemo(() => topics.filter((topic) => {
    const date = topic.collection_date;
    return date !== null && date >= range.from && date <= range.to;
  }), [topics, range.from, range.to]);

  const platformScopedTopics = useMemo(() => topicsInRange
    .filter((topic) => activePlatform === "all"
      || (activePlatform === "other" ? !primaryPlatforms.has(topic.platform) : topic.platform === activePlatform)), [topicsInRange, activePlatform]);

  const platformTopics = useMemo(() => platformScopedTopics
    .filter((topic) => activeLevel === "all" || topic.recommendation_level === activeLevel)
    .sort((a, b) => levelOrder[a.recommendation_level] - levelOrder[b.recommendation_level]
      || b.tourism_conversion_score - a.tourism_conversion_score || a.rank - b.rank || b.id - a.id), [platformScopedTopics, activeLevel]);

  const filteredTopics = useMemo(() => platformTopics.slice(0, 20), [platformTopics]);
  const reportTopics = useMemo(() => platformTopics.slice(0, 50), [platformTopics]);
  const actionTop5 = useMemo(() => platformScopedTopics
    .filter((topic) => topic.recommendation_level === "A")
    .sort((a, b) => b.tourism_conversion_score - a.tourism_conversion_score || a.rank - b.rank)
    .slice(0, 5), [platformScopedTopics]);

  const recommendations = useMemo(() => filteredTopics
    .map(parseAnalysis)
    .filter((item): item is ParsedAnalysis => item !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.topic.rank - b.topic.rank)
    .slice(0, 4), [filteredTopics]);

  const reportAnalyses = useMemo(() => reportTopics
    .map(parseAnalysis)
    .filter((item): item is ParsedAnalysis => item !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.topic.rank - b.topic.rank), [reportTopics]);

  const reportStats = useMemo(() => ({
    total: reportTopics.length,
    platforms: new Set(reportTopics.map((topic) => topic.platform)).size,
    strong: reportAnalyses.filter((item) => item.worthFollowingLabel === "适合借势").length,
    available: reportAnalyses.filter((item) => item.worthFollowingLabel !== "不建议借势").length,
  }), [reportAnalyses, reportTopics]);
  const usesWorkBuddyReport = useMemo(() => reportTopics.some((topic) => topic.analysis_source === "WorkBuddy热点监测报告"), [reportTopics]);

  const advice = platformAdvice[activePlatform] ?? platformAdvice.other;
  const currentLabel = platformTabs.find((tab) => tab.value === activePlatform)?.label ?? "全部热点";

  async function analyzeTopic(topic: AgentHotTopic) {
    setAnalyzingId(topic.id);
    setMessage(null);
    try {
      const response = await fetch("/api/hot-topic-data/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: topic.id }),
      });
      const result = await response.json() as { error?: string; ai?: AgentAiResult };
      if (!response.ok || !result.ai) throw new Error(result.error ?? "AI热点分析失败");
      const updated = {
        ...topic,
        ai_relevance_score: result.ai.relevanceScore,
        ai_analysis: JSON.stringify({
          worthFollowing: result.ai.worthFollowing,
          worthFollowingLabel: result.ai.worthFollowingLabel,
          analysis: result.ai.analysis,
        }),
        ai_recommendation: JSON.stringify({
          shootingDirection: result.ai.shootingDirection,
          shortVideoTitle: result.ai.shortVideoTitle,
          liveTheme: result.ai.liveTheme,
        }),
      };
      setTopics((current) => current.map((item) => item.id === topic.id ? updated : item));
      setSelectedAnalysis({ topic: updated, ...result.ai });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "AI热点分析失败" });
    } finally {
      setAnalyzingId(null);
    }
  }

  async function generateTopicPlan(topic: AgentHotTopic) {
    setGeneratingId(topic.id);
    setMessage(null);
    try {
      const response = await fetch("/api/hot-topic-data/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: topic.id }),
      });
      const result = await response.json() as GeneratedPlan & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "热点选题生成失败");
      setGeneratedPlan(result);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "热点选题生成失败" });
    } finally {
      setGeneratingId(null);
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
      if (!response.ok) throw new Error(result.error ?? "WorkBuddy热点文件导入失败");
      setMessage({ type: "success", text: `WorkBuddy热点已导入 ${result.successCount ?? 0} 条。` });
      setAgentFile(null);
      await loadTopics();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "WorkBuddy热点文件导入失败" });
    } finally {
      setImportingAgent(false);
    }
  }

  async function replaceAgentFile() {
    if (!agentFile || !agentFile.name.toLowerCase().endsWith(".json")) return;
    if (!window.confirm("确认使用该核验文件替换当前 WorkBuddy 热点快照？写入失败时整批回滚。")) return;
    setReplacingAgent(true);
    setMessage(null);
    try {
      const raw = JSON.parse(await agentFile.text()) as unknown;
      if (!Array.isArray(raw)) throw new Error("核验文件必须是 JSON 数组");
      const response = await fetch("/api/hot-topic/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replace_existing: true, data: raw }),
      });
      const result = await response.json() as { error?: string; successCount?: number };
      if (!response.ok) throw new Error(result.error ?? "WorkBuddy热点快照替换失败");
      setMessage({ type: "success", text: `WorkBuddy当前热点已替换为 ${result.successCount ?? 0} 条核验数据。` });
      setAgentFile(null);
      await loadTopics();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "WorkBuddy热点快照替换失败" });
    } finally {
      setReplacingAgent(false);
    }
  }

  return (
    <div className="page-stack hot-topic-page">
      <header className="page-heading compact-heading">
        <div>
          <p className="eyebrow">MULTI-PLATFORM HOT TOPICS</p>
          <h1>多平台热点监测与AI选题推荐中心</h1>
          <p>统一读取 WorkBuddy 热点数据，按平台查看 TOP20，并生成适合独山子大峡谷的跟进与内容建议。</p>
        </div>
        <div className="agent-import-actions">
          <label className="agent-file-button">{agentFile ? agentFile.name : "选择WorkBuddy文件"}<input type="file" accept=".json,.xlsx,.xls" onChange={(event) => setAgentFile(event.target.files?.[0] ?? null)} /></label>
          <button className="primary-button" onClick={() => void importAgentFile()} disabled={!agentFile || importingAgent}>{importingAgent ? "导入中…" : "导入数据"}</button>
          <button className="secondary-button" onClick={() => void replaceAgentFile()} disabled={!agentFile?.name.toLowerCase().endsWith(".json") || replacingAgent}>{replacingAgent ? "替换中…" : "替换当前数据"}</button>
        </div>
      </header>

      <div className="hot-topic-view-toolbar">
        <nav className="insight-platform-tabs hot-unified-platform-tabs" aria-label="热点平台筛选">
          {platformTabs.map((tab) => <button key={tab.value} type="button" className={activePlatform === tab.value ? "active" : ""} onClick={() => { setActivePlatform(tab.value); setSelectedAnalysis(null); }}>{tab.label}</button>)}
        </nav>
        <div className="hot-view-switch" role="group" aria-label="热点展示方式">
          <button className={viewMode === "report" ? "active" : ""} onClick={() => setViewMode("report")}>分析报告</button>
          <button className={viewMode === "ranking" ? "active" : ""} onClick={() => setViewMode("ranking")}>TOP20列表</button>
        </div>
      </div>

      <div className="hot-level-toolbar">
        <div><strong>行动推荐等级</strong><span>默认按 A → B → C 及旅游转化价值排序</span></div>
        <nav className="hot-level-tabs" aria-label="热点推荐等级筛选">
          {levelTabs.map((tab) => <button key={tab.value} className={activeLevel === tab.value ? "active" : ""} onClick={() => setActiveLevel(tab.value)}>{tab.label}</button>)}
        </nav>
      </div>

      {message && <div className={`import-message ${message.type}`}><span>{message.type === "success" ? "✓" : "!"}</span>{message.text}</div>}

      <section className="panel hot-action-top5-panel">
        <div className="panel-heading light-heading">
          <div><span className="section-kicker">TODAY&apos;S ACTION TOP 5</span><h2>今日推荐热点 TOP5</h2></div>
          <small>旅游转化价值 = 热度20% + 关联度35% + 内容适配25% + 商业价值20%</small>
        </div>
        <div className="hot-action-top5-grid">
          {actionTop5.map((topic, index) => {
            const analysis = parseAnalysis(topic);
            const recommendation = readObject(topic.ai_recommendation);
            return <article key={topic.id}>
              <div className="hot-top5-meta"><span>TOP {index + 1}</span><em className="level-a">A级 · 强烈推荐</em><strong>{topic.tourism_conversion_score}分</strong></div>
              <h3>{topic.topic_title}</h3>
              <p><b>推荐理由</b>{analysis?.analysis ?? "等待补充推荐理由。"}</p>
              <p><b>推荐标题</b>{String(recommendation?.shortVideoTitle ?? `独山子大峡谷 × ${topic.keyword}`)}</p>
              <p><b>内容方向</b>{topic.content_direction}</p>
              <p><b>拍摄建议</b>{String(recommendation?.shootingDirection ?? "等待补充拍摄建议。")}</p>
              <button onClick={() => void generateTopicPlan(topic)} disabled={generatingId === topic.id}>{generatingId === topic.id ? "生成中…" : "生成选题"}</button>
            </article>;
          })}
          {!actionTop5.length && <div className="hot-top5-empty">当前筛选范围暂无 A 级推荐热点。</div>}
        </div>
      </section>

      {generatedPlan && <section className="panel hot-generated-plan-panel">
        <div className="panel-heading"><div><span className="section-kicker">AI ACTION PLAN</span><h2>{generatedPlan.topicName}</h2></div><button className="secondary-button" onClick={() => setGeneratedPlan(null)}>关闭选题</button></div>
        <div className="hot-generated-summary"><span className={`hot-level-badge level-${generatedPlan.recommendationLevel.toLowerCase()}`}>{generatedPlan.recommendationLevel}级</span><strong>旅游转化价值 {generatedPlan.tourismConversionScore}分</strong></div>
        <div className="agent-analysis-grid"><article><span>短视频标题</span><p>{generatedPlan.shortVideoTitle}</p></article><article><span>内容方向</span><p>{generatedPlan.contentDirection}</p></article><article><span>拍摄脚本方向</span><p className="generated-script-text">{generatedPlan.scriptDirection}</p></article><article><span>直播主题</span><p>{generatedPlan.liveTheme}</p></article></div>
      </section>}

      {viewMode === "ranking" && <section className="panel workbuddy-top20-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">WORKBUDDY TOP 20</span><h2>{currentLabel} TOP20</h2></div>
          <div className="hot-source-meta"><strong>WorkBuddy热点监测Agent</strong><span>{range.from} — {range.to} · 当前显示 {filteredTopics.length} / 周期内 {topicsInRange.length} 条</span></div>
        </div>
        {loading ? <div className="loading-panel"><span className="loading-dot" />正在读取 WorkBuddy 热点数据…</div> : <div className="table-wrap">
          <table className="workbuddy-top20-table">
            <thead><tr><th>排名</th><th>等级</th><th>平台</th><th>热点名称</th><th>热度</th><th>转化评分</th><th>趋势</th><th>采集时间</th><th>操作</th></tr></thead>
            <tbody>
              {filteredTopics.map((topic) => <tr key={topic.id}>
                <td><strong className={topic.rank <= 3 ? "top-rank-number" : ""}>TOP {topic.rank}</strong></td>
                <td><span className={`hot-level-badge level-${topic.recommendation_level.toLowerCase()}`}>{topic.recommendation_level}级</span></td>
                <td><span className={`platform-tag tag-${topic.platform}`}>{platformLabel(topic.platform)}</span></td>
                <td className="hot-topic-name-cell"><strong>{topic.topic_title}</strong><small>{topic.keyword}{topic.category ? ` · ${topic.category}` : ""}</small></td>
                <td className="agent-heat-value">{topic.heat_value}</td>
                <td><strong className="conversion-score">{topic.tourism_conversion_score}</strong></td>
                <td><span className="trend-pill trend-new">{topicTrend()}</span></td>
                <td className="collection-time-cell">{topic.publish_time || "WorkBuddy当日批次"}</td>
                <td><div className="hot-row-actions"><button className="analysis-action" onClick={() => void analyzeTopic(topic)} disabled={analyzingId === topic.id}>{analyzingId === topic.id ? "分析中…" : topic.ai_relevance_score === null ? "AI分析" : `${Math.round(topic.ai_relevance_score)}分 · 查看`}</button><button className="topic-generate-button" onClick={() => void generateTopicPlan(topic)} disabled={generatingId === topic.id}>{generatingId === topic.id ? "生成中…" : "生成选题"}</button></div></td>
              </tr>)}
              {!filteredTopics.length && <tr><td className="empty-cell" colSpan={9}>当前日期范围、平台及等级暂无 WorkBuddy 热点数据。</td></tr>}
            </tbody>
          </table>
        </div>}
        <p className="hot-source-note">趋势在 WorkBuddy 尚未提供连续排名快照时显示“首次采集”；采集时间按 WorkBuddy 原始数据时间展示，不生成模拟涨跌。</p>
      </section>}

      {viewMode === "ranking" && <section className="panel hot-ai-recommendation-panel">
        <div className="panel-heading light-heading">
          <div><span className="section-kicker">AI TOPIC OPPORTUNITY</span><h2>AI热点分析与选题推荐</h2></div>
          <span className="ai-badge">{usesWorkBuddyReport ? "WORKBUDDY REPORT" : "WORKBUDDY × RULES V1"}</span>
        </div>
        <p className="ai-intro">综合当前平台热点、独山子大峡谷景区资源与历史作品数据，判断关联度和跟进价值。</p>
        <div className="hot-ai-card-grid">
          {recommendations.map((item) => <article key={item.topic.id}>
            <div className="hot-ai-card-meta"><span className={`platform-tag tag-${item.topic.platform}`}>{platformLabel(item.topic.platform)}</span><em>{item.relevanceScore}% 关联</em></div>
            <div className={`follow-decision ${item.worthFollowing ? "recommended" : "observe"}`}>{item.worthFollowingLabel}</div>
            <h3>{item.shortVideoTitle}</h3>
            <p><strong>热点判断</strong>{item.analysis}</p>
            <p><strong>拍摄方向</strong>{item.shootingDirection}</p>
            <small>来源：TOP {item.topic.rank} · {item.topic.topic_title}</small>
          </article>)}
          {!recommendations.length && <div className="empty-ai-recommendation">当前平台尚无已分析热点。可在 TOP20 列表点击“AI分析”生成真实建议。</div>}
        </div>
      </section>}

      {viewMode === "report" && <section className="hot-analysis-report" aria-label="独山子大峡谷旅游热点监测报告">
        <header className="hot-report-header">
          <div><span>WORKBUDDY DAILY INTELLIGENCE</span><h2>独山子大峡谷旅游热点监测报告</h2><p>{range.from === range.to ? range.from : `${range.from} — ${range.to}`} · {currentLabel} · 最多展示 TOP50</p></div>
          <em>仅监测抖音 / 快手 / 微博及已接入平台</em>
        </header>

        <div className="hot-report-stats">
          <article><strong>{reportStats.total}</strong><span>热点总数</span></article>
          <article><strong>{reportStats.platforms}</strong><span>监测平台</span></article>
          <article><strong>{reportStats.strong}</strong><span>强烈推荐借势</span></article>
          <article><strong>{reportStats.available}</strong><span>可借势热点</span></article>
        </div>

        <div className="hot-report-card-list">
          {reportTopics.map((topic) => {
            const analysis = parseAnalysis(topic);
            const score = analysis?.relevanceScore ?? null;
            const decisionClass = score === null ? "pending" : analysis?.worthFollowingLabel === "适合借势" ? "high" : analysis?.worthFollowingLabel === "谨慎借势" ? "mid" : "low";
            const decision = score === null ? "待AI分析" : analysis?.worthFollowingLabel ?? "不建议借势";
            return <article className="hot-report-card" key={topic.id}>
              <div className="hot-report-card-head"><span className="hot-report-rank">#{topic.rank}</span><span className={`hot-level-badge level-${topic.recommendation_level.toLowerCase()}`}>{topic.recommendation_level}级</span><span className={`platform-tag tag-${topic.platform}`}>{platformLabel(topic.platform)}</span><strong>热度 {topic.heat_value} · 转化 {topic.tourism_conversion_score}</strong></div>
              <h3>{topic.topic_title}</h3>
              <div className="hot-report-meta"><span>关键词：{topic.keyword || "待补充"}</span><span>{topic.publish_time || "WorkBuddy当日批次"}</span><span>{topic.category || "其他热点"}</span></div>
              {topic.url && <a className="hot-report-source" href={topic.url} target="_blank" rel="noreferrer">查看热点来源 ↗</a>}
              <div className="hot-report-ai">
                <div className="hot-report-decision"><span className={`decision-${decisionClass}`}>{decision}</span><div className="hot-report-action-buttons">{score === null ? <button onClick={() => void analyzeTopic(topic)} disabled={analyzingId === topic.id}>{analyzingId === topic.id ? "分析中…" : "开始AI分析"}</button> : <strong>关联度：{score}/100</strong>}<button onClick={() => void generateTopicPlan(topic)} disabled={generatingId === topic.id}>{generatingId === topic.id ? "生成中…" : "生成选题"}</button></div></div>
                {analysis ? <div className="hot-report-ai-detail"><p><b>热点判断</b>{analysis.analysis}</p><p><b>推荐拍摄方向</b>{analysis.shootingDirection}</p><p><b>推荐短视频标题</b>{analysis.shortVideoTitle}</p><p><b>推荐直播主题</b>{analysis.liveTheme}</p></div> : <p className="hot-report-awaiting">点击“开始AI分析”后生成关联度、借势判断与内容建议，不展示模拟结果。</p>}
              </div>
            </article>;
          })}
          {!reportTopics.length && <div className="empty-ai-recommendation">当前日期范围及平台暂无 WorkBuddy 热点数据。</div>}
        </div>

        <section className="hot-daily-advice">
          <div><span>DAILY ACTION PLAN</span><h3>今日运营建议</h3><p>按关联度与跟进价值，从当前筛选范围的真实 AI 分析结果生成。</p></div>
          <ol>
            {reportAnalyses.filter((item) => item.worthFollowingLabel !== "不建议借势").slice(0, 6).map((item, index) => <li key={item.topic.id}><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{item.shortVideoTitle}</strong>{item.shootingDirection}</p></li>)}
            {!reportAnalyses.some((item) => item.worthFollowingLabel !== "不建议借势") && <li className="hot-advice-empty">当前范围暂无达到可借势标准的已分析热点。</li>}
          </ol>
        </section>

        <footer className="hot-report-footer">热点来源：WorkBuddy热点监测Agent · 分析来源：{usesWorkBuddyReport ? "WorkBuddy热点监测报告" : "系统规则分析"} · 仅供内部运营参考</footer>
      </section>}

      {selectedAnalysis && <section className="panel agent-analysis-panel">
        <div className="panel-heading"><div><span className="section-kicker">AI ANALYSIS DETAIL</span><h2>{selectedAnalysis.topic.topic_title}</h2></div><button className="secondary-button" onClick={() => setSelectedAnalysis(null)}>关闭详情</button></div>
        <div className="agent-analysis-score"><strong>{selectedAnalysis.relevanceScore}</strong><span>与独山子大峡谷关联度</span><em className={selectedAnalysis.worthFollowing ? "follow-yes" : "follow-no"}>{selectedAnalysis.worthFollowingLabel}</em></div>
        <div className="agent-analysis-grid"><article><span>关联分析</span><p>{selectedAnalysis.analysis}</p></article><article><span>推荐拍摄方向</span><p>{selectedAnalysis.shootingDirection}</p></article><article><span>推荐短视频标题</span><p>{selectedAnalysis.shortVideoTitle}</p></article><article><span>推荐直播主题</span><p>{selectedAnalysis.liveTheme}</p></article></div>
      </section>}

      <section className="panel platform-difference-panel">
        <div><span className="section-kicker">{advice.eyebrow}</span><h2>{advice.title}</h2><p>{advice.summary}</p></div>
        <ol>{advice.actions.map((action, index) => <li key={action}><span>{String(index + 1).padStart(2, "0")}</span><strong>{action}</strong></li>)}</ol>
      </section>
    </div>
  );
}
