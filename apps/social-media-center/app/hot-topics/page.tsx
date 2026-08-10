"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type ParsedAnalysis = AgentAiResult & { topic: AgentHotTopic };

const platformTabs = [
  { value: "all", label: "全部热点" },
  { value: "douyin", label: "抖音" },
  { value: "kuaishou", label: "快手" },
  { value: "weibo", label: "微博" },
  { value: "other", label: "其他平台" },
] as const;

const primaryPlatforms = new Set(["douyin", "kuaishou", "weibo"]);

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
  const [topics, setTopics] = useState<AgentHotTopic[]>([]);
  const [activePlatform, setActivePlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ParsedAnalysis | null>(null);
  const [agentFile, setAgentFile] = useState<File | null>(null);
  const [importingAgent, setImportingAgent] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadTopics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/hot-topic-data?platform=all", { cache: "no-store" });
      const result = await response.json() as { topics?: AgentHotTopic[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "WorkBuddy热点数据读取失败");
      setTopics(result.topics ?? []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "WorkBuddy热点数据读取失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTopics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTopics]);

  const filteredTopics = useMemo(() => topics
    .filter((topic) => activePlatform === "all"
      || (activePlatform === "other" ? !primaryPlatforms.has(topic.platform) : topic.platform === activePlatform))
    .sort((a, b) => a.rank - b.rank || b.id - a.id)
    .slice(0, 20), [topics, activePlatform]);

  const recommendations = useMemo(() => filteredTopics
    .map(parseAnalysis)
    .filter((item): item is ParsedAnalysis => item !== null)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.topic.rank - b.topic.rank)
    .slice(0, 4), [filteredTopics]);

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
        </div>
      </header>

      <nav className="insight-platform-tabs hot-unified-platform-tabs" aria-label="热点平台筛选">
        {platformTabs.map((tab) => <button key={tab.value} type="button" className={activePlatform === tab.value ? "active" : ""} onClick={() => { setActivePlatform(tab.value); setSelectedAnalysis(null); }}>{tab.label}</button>)}
      </nav>

      {message && <div className={`import-message ${message.type}`}><span>{message.type === "success" ? "✓" : "!"}</span>{message.text}</div>}

      <section className="panel workbuddy-top20-panel">
        <div className="panel-heading">
          <div><span className="section-kicker">WORKBUDDY TOP 20</span><h2>{currentLabel} TOP20</h2></div>
          <div className="hot-source-meta"><strong>WorkBuddy热点监测Agent</strong><span>当前显示 {filteredTopics.length} / 共 {topics.length} 条</span></div>
        </div>
        {loading ? <div className="loading-panel"><span className="loading-dot" />正在读取 WorkBuddy 热点数据…</div> : <div className="table-wrap">
          <table className="workbuddy-top20-table">
            <thead><tr><th>排名</th><th>平台</th><th>热点名称</th><th>热度</th><th>趋势</th><th>采集时间</th><th>AI分析</th></tr></thead>
            <tbody>
              {filteredTopics.map((topic) => <tr key={topic.id}>
                <td><strong className={topic.rank <= 3 ? "top-rank-number" : ""}>TOP {topic.rank}</strong></td>
                <td><span className={`platform-tag tag-${topic.platform}`}>{platformLabel(topic.platform)}</span></td>
                <td className="hot-topic-name-cell"><strong>{topic.topic_title}</strong><small>{topic.keyword}{topic.category ? ` · ${topic.category}` : ""}</small></td>
                <td className="agent-heat-value">{topic.heat_value}</td>
                <td><span className="trend-pill trend-new">{topicTrend()}</span></td>
                <td className="collection-time-cell">{topic.publish_time || "WorkBuddy当日批次"}</td>
                <td><button className="analysis-action" onClick={() => void analyzeTopic(topic)} disabled={analyzingId === topic.id}>{analyzingId === topic.id ? "分析中…" : topic.ai_relevance_score === null ? "AI分析" : `${Math.round(topic.ai_relevance_score)}分 · 查看`}</button></td>
              </tr>)}
              {!filteredTopics.length && <tr><td className="empty-cell" colSpan={7}>当前平台暂无 WorkBuddy 热点数据。</td></tr>}
            </tbody>
          </table>
        </div>}
        <p className="hot-source-note">趋势在 WorkBuddy 尚未提供连续排名快照时显示“首次采集”；采集时间按 WorkBuddy 原始数据时间展示，不生成模拟涨跌。</p>
      </section>

      <section className="panel hot-ai-recommendation-panel">
        <div className="panel-heading light-heading">
          <div><span className="section-kicker">AI TOPIC OPPORTUNITY</span><h2>AI热点分析与选题推荐</h2></div>
          <span className="ai-badge">WORKBUDDY × RULES V1</span>
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
      </section>

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
