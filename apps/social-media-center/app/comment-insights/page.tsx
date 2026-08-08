"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate, platformLabel } from "@/lib/format";
import { dateRangeQuery } from "@/lib/date-range";
import { useGlobalDateRange } from "@/components/GlobalDateFilter";

type InsightData = {
  summary: {
    total: number;
    analyzed: number;
    positive: number;
    negative: number;
    neutral: number;
    positiveRatio: number;
    negativeRatio: number;
    neutralRatio: number;
  };
  keywords: Array<{ name: string; count: number }>;
  needs: Array<{ name: string; count: number; ratio: number }>;
  suggestions: Array<{ need: string; evidenceCount: number; theme: string; title: string; optimization: string }>;
  comments: Array<{
    id: number;
    postTitle: string;
    platform: string;
    username: string;
    commentText: string;
    commentTime: string;
    likes: number;
    sentiment: "positive" | "negative" | "neutral";
    keywords: string[];
    userNeed: string;
    confidence: number;
  }>;
  engine: string;
  futureAiEndpoint: string;
  updatedAt: string;
};

const sentimentLabel = { positive: "正向", negative: "负向", neutral: "中性" };

export default function CommentInsightsPage() {
  const range = useGlobalDateRange();
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/comment-insights?${dateRangeQuery(range)}`, { method: "POST" });
      const result = await response.json() as InsightData & { error?: string };
      if (!response.ok) throw new Error(result.error || "游客评论分析失败");
      setData(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "游客评论分析失败");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void analyze(), 0);
    return () => window.clearTimeout(timer);
  }, [analyze]);

  if (loading && !data) return <div className="loading-panel"><span className="loading-dot" />正在读取评论并运行游客需求规则模型…</div>;
  if (error && !data) return <div className="error-panel">{error}</div>;
  if (!data) return null;

  return (
    <div className="page-stack comment-insights-page">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">VISITOR VOICE INTELLIGENCE</p><h1>游客评论洞察中心</h1><p>把真实评论转化为游客需求、内容选题和可执行运营建议。</p></div>
        <div className="insight-heading-action"><span className="rule-badge">RULES V1</span><button className="primary-button" disabled={loading} onClick={() => void analyze()}>{loading ? "分析中…" : "重新分析评论"}</button></div>
      </header>

      {error && <div className="error-panel inline-error">{error}</div>}

      <section className="insight-summary-grid">
        <article><span>评论总量</span><strong>{data.summary.total}</strong><small>来源 social_comments</small></article>
        <article><span>已完成分析</span><strong>{data.summary.analyzed}</strong><small>情绪 · 关键词 · 需求</small></article>
        <article className="positive"><span>正向情绪</span><strong>{data.summary.positiveRatio}%</strong><small>{data.summary.positive} 条评论</small></article>
        <article className="negative"><span>负向情绪</span><strong>{data.summary.negativeRatio}%</strong><small>{data.summary.negative} 条评论</small></article>
      </section>

      <section className="insight-core-grid">
        <article className="panel sentiment-panel">
          <div className="panel-heading"><div><span className="section-kicker">SENTIMENT</span><h2>评论情绪分布</h2></div><span className="section-note">规则识别结果</span></div>
          <div className="sentiment-visual">
            <div className="sentiment-donut" style={{ background: `conic-gradient(#2abe86 0 ${data.summary.positiveRatio}%, #e7b05e ${data.summary.positiveRatio}% ${data.summary.positiveRatio + data.summary.neutralRatio}%, #df6c75 ${data.summary.positiveRatio + data.summary.neutralRatio}% 100%)` }}><div><strong>{data.summary.total}</strong><span>条评论</span></div></div>
            <div className="sentiment-legend"><p><i className="positive" /><span>正向</span><strong>{data.summary.positiveRatio}%</strong></p><p><i className="neutral" /><span>中性</span><strong>{data.summary.neutralRatio}%</strong></p><p><i className="negative" /><span>负向</span><strong>{data.summary.negativeRatio}%</strong></p></div>
          </div>
        </article>

        <article className="panel keyword-panel">
          <div className="panel-heading"><div><span className="section-kicker">KEYWORDS</span><h2>热门关键词</h2></div><span className="count-badge">TOP {data.keywords.length}</span></div>
          <div className="keyword-cloud">{data.keywords.map((item, index) => <span className={index < 3 ? "hot" : ""} key={item.name}>{item.name}<b>{item.count}</b></span>)}{!data.keywords.length && <p className="empty-cell">暂无可识别关键词</p>}</div>
        </article>
      </section>

      <section className="panel visitor-needs-panel">
        <div className="panel-heading"><div><span className="section-kicker">VISITOR NEEDS</span><h2>游客主要需求</h2></div><span className="section-note">覆盖八类标准需求</span></div>
        <div className="need-bars">{data.needs.map((item) => <div className="need-row" key={item.name}><div><strong>{item.name}</strong><span>{item.count} 条</span></div><i><b style={{ width: `${item.ratio}%` }} /></i><em>{item.ratio}%</em></div>)}</div>
      </section>

      <section>
        <div className="section-title"><div><span className="section-kicker">ACTION RECOMMENDATIONS</span><h2>AI 运营建议</h2></div><span className="section-note">基于主要游客需求生成</span></div>
        <div className="insight-suggestion-grid">{data.suggestions.map((item) => <article key={item.need}><div><span>{item.need}</span><small>{item.evidenceCount} 条评论依据</small></div><h3>{item.theme}</h3><p><strong>标题方向</strong>{item.title}</p><p><strong>内容优化</strong>{item.optimization}</p></article>)}</div>
      </section>

      <section className="panel analyzed-comments-panel">
        <div className="panel-heading"><div><span className="section-kicker">COMMENT DIAGNOSTICS</span><h2>评论 AI 分析明细</h2></div><span className="count-badge">显示 {data.comments.length} 条</span></div>
        <div className="table-wrap"><table><thead><tr><th>游客评论</th><th>作品</th><th>情绪</th><th>关键词</th><th>游客需求</th><th>置信度</th></tr></thead><tbody>{data.comments.map((comment) => <tr key={comment.id}><td><strong>{comment.username}</strong><p>{comment.commentText}</p><small>{formatDate(comment.commentTime)} · 赞 {comment.likes}</small></td><td><span className={`platform-tag tag-${comment.platform}`}>{platformLabel(comment.platform)}</span><p className="comment-post-title">{comment.postTitle}</p></td><td><span className={`sentiment-tag ${comment.sentiment}`}>{sentimentLabel[comment.sentiment]}</span></td><td><div className="comment-keywords">{comment.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></td><td><strong className="need-tag">{comment.userNeed}</strong></td><td>{Math.round(comment.confidence * 100)}%</td></tr>)}</tbody></table></div>
        {!data.comments.length && <div className="empty-cell">暂无评论，请先通过抖音评论详情采集导入真实评论。</div>}
      </section>

      <p className="analysis-disclaimer">当前使用可解释规则模型（{data.engine}），分析结果已写回 social_comments；预留大模型接口 {data.futureAiEndpoint}，V1.0 不调用外部模型。更新时间：{formatDate(data.updatedAt)}</p>
    </div>
  );
}
