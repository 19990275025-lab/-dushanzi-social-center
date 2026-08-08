"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";
import { dateRangeQuery } from "@/lib/date-range";
import { useGlobalDateRange } from "@/components/GlobalDateFilter";

type Dimensions = {
  visualAttraction: number;
  titleQuality: number;
  interactionAbility: number;
  propagationAbility: number;
  hotMatch: number;
};

type AnalyzedPost = {
  id: number;
  platform: string;
  title: string;
  content_type: string;
  publish_time: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  viralScore: number;
  overallScore: number;
  engagementRate: number;
  dimensions: Dimensions;
  strengths: string[];
  issues: string[];
  suggestions: string[];
};

type PlatformAnalysis = {
  platform: string;
  hasData: boolean;
  followers: number;
  postCount: number;
  totalViews: number;
  averageScore: number;
  advantage: string;
  recommendation: string;
};

type TopicIdea = {
  sourceTopic: string;
  title: string;
  direction: string;
  platform: string;
  shootingMethod: string;
};

type Report = {
  kind: "daily" | "weekly";
  title: string;
  periodLabel: string;
  postCount: number;
  accountPerformance: Array<{ platform: string; followers: number; postCount: number; views: number }>;
  excellentPosts: Array<{ id: number; title: string; platform: string; score: number; views: number }>;
  problemAnalysis: string;
  actions: string[];
};

type AnalysisData = {
  summary: { postCount: number; totalViews: number; averageScore: number; breakoutCount: number; bestPost: { id: number; title: string; score: number } | null };
  scoreModel: { total: number; weights: Dimensions; dimensionAverages: Dimensions; note: string };
  posts: AnalyzedPost[];
  platformAnalysis: PlatformAnalysis[];
  topicRecommendations: TopicIdea[];
  reports: { daily: Report; weekly: Report };
  engine: string;
  sources: string[];
  updatedAt: string;
};

const dimensionLabels: Record<keyof Dimensions, string> = {
  visualAttraction: "视觉吸引力",
  titleQuality: "标题质量",
  interactionAbility: "互动能力",
  propagationAbility: "传播能力",
  hotMatch: "热点匹配度",
};

const emptyDimensions: Dimensions = { visualAttraction: 0, titleQuality: 0, interactionAbility: 0, propagationAbility: 0, hotMatch: 0 };

function scoreClass(score: number) {
  return score >= 85 ? "score-excellent" : score >= 70 ? "score-good" : "score-improve";
}

export default function AiAnalysisPage() {
  const range = useGlobalDateRange();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [platform, setPlatform] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reportKind, setReportKind] = useState<"daily" | "weekly">("daily");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalysis = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai-analysis?${dateRangeQuery(range)}`);
      if (!response.ok) throw new Error("AI 内容分析数据读取失败");
      const result = await response.json() as AnalysisData;
      setData(result);
      setSelectedId((current) => current ?? result.posts[0]?.id ?? null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 内容分析数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAnalysis(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalysis]);

  const filteredPosts = useMemo(() => data?.posts.filter((post) => platform === "all" || post.platform === platform) ?? [], [data, platform]);
  const selectedPost = filteredPosts.find((post) => post.id === selectedId) ?? filteredPosts[0] ?? null;
  const report = data?.reports[reportKind];
  const visibleDimensions = data?.scoreModel.dimensionAverages ?? emptyDimensions;

  if (loading) return <div className="loading-panel"><span className="loading-dot" />正在读取作品并运行规则评分…</div>;
  if (error || !data) return <div className="error-panel">{error || "暂无分析数据"}</div>;

  return (
    <div className="page-stack ai-analysis-page">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">AI CONTENT INTELLIGENCE</p><h1>AI 内容分析中心</h1><p>从作品表现、五维评分、平台差异到运营行动，形成完整分析闭环。</p></div>
        <div className="analysis-toolbar"><label>分析平台<select value={platform} onChange={(event) => { setPlatform(event.target.value); setSelectedId(null); }}><option value="all">全部平台</option><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="weibo">微博</option><option value="wechat_channels">视频号</option></select></label><span className="rule-badge">RULES V1</span></div>
      </header>

      <section className="analysis-hero">
        <article><span>已分析作品</span><strong>{data.summary.postCount}</strong><small>来源 social_posts</small></article>
        <article><span>周期播放</span><strong>{formatCompact(data.summary.totalViews)}</strong><small>当前日期范围</small></article>
        <article><span>平均综合评分</span><strong>{data.summary.averageScore}<em>/100</em></strong><small>五维加权结果</small></article>
        <article><span>爆款作品</span><strong>{data.summary.breakoutCount}</strong><small>爆款评分 ≥ 80</small></article>
        <article className="best-post-card"><span>当前最佳作品</span><strong>{data.summary.bestPost?.title ?? "暂无作品"}</strong><small>{data.summary.bestPost ? `综合评分 ${data.summary.bestPost.score}` : "等待数据"}</small></article>
      </section>

      <section className="analysis-overview-grid">
        <article className="panel score-model-panel">
          <div className="panel-heading"><div><span className="section-kicker">100-POINT MODEL</span><h2>内容评分模型</h2></div><span className="section-note">综合评分 = 五维加权</span></div>
          <div className="dimension-bars">
            {(Object.keys(dimensionLabels) as Array<keyof Dimensions>).map((key) => <div className="dimension-row" key={key}><div><strong>{dimensionLabels[key]}</strong><span>权重 {data.scoreModel.weights[key]}%</span></div><div className="dimension-track"><i className={scoreClass(visibleDimensions[key])} style={{ width: `${visibleDimensions[key]}%` }} /></div><b>{visibleDimensions[key]}</b></div>)}
          </div>
          <p className="model-note">{data.scoreModel.note}</p>
        </article>

        <article className="panel score-guide-panel">
          <div className="panel-heading"><div><span className="section-kicker">SCORE GUIDE</span><h2>评分解释</h2></div></div>
          <div className="score-guide-list"><div><span className="guide-dot excellent" /><strong>85–100</strong><p>优势明显，可复用为系列模板</p></div><div><span className="guide-dot good" /><strong>70–84</strong><p>整体良好，针对弱项优化</p></div><div><span className="guide-dot improve" /><strong>0–69</strong><p>需要调整标题、开场或互动设计</p></div></div>
          <div className="source-note"><strong>数据来源</strong><p>{data.sources.join(" + ")}</p><small>更新时间：{formatDate(data.updatedAt)}</small></div>
        </article>
      </section>

      <section className="panel post-analysis-panel">
        <div className="panel-heading"><div><span className="section-kicker">POST DIAGNOSTICS</span><h2>作品 AI 分析</h2></div><span className="count-badge">{filteredPosts.length} 条</span></div>
        {filteredPosts.length ? <div className="post-analysis-layout">
          <div className="analysis-post-list" role="list" aria-label="作品分析列表">
            {filteredPosts.map((post) => <button className={selectedPost?.id === post.id ? "analysis-post-item active" : "analysis-post-item"} key={post.id} onClick={() => setSelectedId(post.id)}><span className={`score-orb ${scoreClass(post.overallScore)}`}>{post.overallScore}</span><div><strong>{post.title}</strong><small>{platformLabel(post.platform)} · {formatCompact(post.views)}播放 · {formatDate(post.publish_time)}</small></div><em>爆款 {post.viralScore}</em></button>)}
          </div>
          {selectedPost && <article className="post-diagnostic-card">
            <div className="diagnostic-head"><div><span className={`platform-tag tag-${selectedPost.platform}`}>{platformLabel(selectedPost.platform)}</span><h3>{selectedPost.title}</h3><p>互动率 {(selectedPost.engagementRate * 100).toFixed(2)}% · {selectedPost.content_type === "video" ? "短视频" : selectedPost.content_type}</p></div><div className={`viral-score ${scoreClass(selectedPost.viralScore)}`}><span>爆款评分</span><strong>{selectedPost.viralScore}</strong></div></div>
            <div className="mini-score-grid">{(Object.keys(dimensionLabels) as Array<keyof Dimensions>).map((key) => <div key={key}><span>{dimensionLabels[key]}</span><strong>{selectedPost.dimensions[key]}</strong><i><b style={{ width: `${selectedPost.dimensions[key]}%` }} /></i></div>)}</div>
            <div className="diagnostic-columns"><div className="diagnostic-block strengths"><span>内容优势</span>{selectedPost.strengths.map((item) => <p key={item}>✓ {item}</p>)}</div><div className="diagnostic-block issues"><span>存在问题</span>{selectedPost.issues.map((item) => <p key={item}>! {item}</p>)}</div></div>
            <div className="optimization-box"><span>优化建议</span><ol>{selectedPost.suggestions.map((item) => <li key={item}>{item}</li>)}</ol></div>
          </article>}
        </div> : <div className="empty-cell">该平台暂无作品数据，请先通过数据导入中心补充。</div>}
      </section>

      <section>
        <div className="section-title"><div><span className="section-kicker">PLATFORM INSIGHTS</span><h2>平台分析</h2></div><span className="section-note">无数据平台不做推断</span></div>
        <div className="platform-analysis-grid">{data.platformAnalysis.map((item) => <article className={`platform-insight-card platform-${item.platform}`} key={item.platform}><div className="platform-card-head"><div className="platform-mark">{platformLabel(item.platform).slice(0, 1)}</div><div><strong>{platformLabel(item.platform)}</strong><small>{item.hasData ? `${item.postCount} 条作品` : "等待数据"}</small></div><span className="platform-score">{item.hasData ? item.averageScore : "—"}</span></div><div className="platform-insight-metrics"><span>粉丝<strong>{formatCompact(item.followers)}</strong></span><span>播放<strong>{formatCompact(item.totalViews)}</strong></span></div><p><b>平台优势</b>{item.advantage}</p><p><b>内容建议</b>{item.recommendation}</p></article>)}</div>
      </section>

      <section className="panel topic-upgrade-panel">
        <div className="panel-heading light-heading"><div><span className="section-kicker">TOPIC RECOMMENDATIONS</span><h2>AI 选题推荐升级</h2></div><span className="ai-badge">HOT × POSTS</span></div>
        <p className="ai-intro">结合 hot_topics 当前热点与 social_posts 高分作品结构，生成可直接进入内容任务的选题。</p>
        <div className="topic-idea-grid">{data.topicRecommendations.map((idea) => <article key={`${idea.sourceTopic}-${idea.platform}`}><div><span className={`platform-tag tag-${idea.platform}`}>{platformLabel(idea.platform)}</span><small>来源：{idea.sourceTopic}</small></div><h3>{idea.title}</h3><p><strong>内容方向</strong>{idea.direction}</p><p><strong>拍摄方式</strong>{idea.shootingMethod}</p></article>)}{!data.topicRecommendations.length && <div className="empty-list">暂无有效热点，暂不生成选题。</div>}</div>
      </section>

      {report && <section className="panel report-panel">
        <div className="panel-heading"><div><span className="section-kicker">OPERATIONS REPORT</span><h2>运营报告</h2></div><div className="report-tabs"><button className={reportKind === "daily" ? "active" : ""} onClick={() => setReportKind("daily")}>AI 日报</button><button className={reportKind === "weekly" ? "active" : ""} onClick={() => setReportKind("weekly")}>AI 周报</button></div></div>
        <div className="report-banner"><div><span>{report.title}</span><h3>{report.periodLabel}运营复盘</h3></div><strong>{report.postCount}<small>条作品</small></strong></div>
        <div className="report-grid"><article><span>账号表现</span><div className="report-account-list">{report.accountPerformance.map((item) => <div key={item.platform}><strong>{platformLabel(item.platform)}</strong><p>{item.postCount} 条 · {formatCompact(item.views)}播放</p></div>)}</div></article><article><span>优秀作品</span>{report.excellentPosts.length ? <ol className="report-top-list">{report.excellentPosts.map((item) => <li key={item.id}><div><strong>{item.title}</strong><small>{platformLabel(item.platform)} · {formatCompact(item.views)}播放</small></div><b>{item.score}</b></li>)}</ol> : <p className="report-empty">本周期暂无作品</p>}</article><article><span>问题分析</span><p className="report-problem">{report.problemAnalysis}</p></article><article><span>行动建议</span><ol className="report-actions">{report.actions.map((item) => <li key={item}>{item}</li>)}</ol></article></div>
      </section>}

      <p className="analysis-disclaimer">当前使用可解释规则模型（{data.engine}）；已预留大模型 API，但 V1.0 不调用外部模型、不自动采集或发布内容。</p>
    </div>
  );
}
