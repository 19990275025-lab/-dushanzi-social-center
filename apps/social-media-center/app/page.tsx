"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatDateTime, platformLabel } from "@/lib/format";
import { dateRangeQuery } from "@/lib/date-range";
import { useGlobalDateRange } from "@/components/GlobalDateFilter";

type OverviewItem = {
  platform: string;
  followers: number;
  todayPosts: number;
  views: number;
  interactions: number;
};

type DashboardData = {
  updatedAt: string;
  range: { from: string; to: string; label: string };
  overview: OverviewItem[];
  today: {
    published: number;
    pending: number;
    progress: Array<{ platform: string; total: number; completed: number; rate: number }>;
  };
  topPosts: Array<{
    id: number;
    platform: string;
    title: string;
    views: number;
    likes: number;
    comments: number;
    aiAnalysis: { summary?: string } | null;
  }>;
  topics: Array<{
    id: number;
    platform: string;
    topic_name: string;
    heat_value: number;
    trend: string;
    ai_suggestion: string | null;
  }>;
  aiSuggestions: string[];
};

function LoadingPanel() {
  return (
    <div className="loading-panel" role="status">
      <span className="loading-dot" />
      正在读取运营数据库…
    </div>
  );
}

export default function DashboardPage() {
  const range = useGlobalDateRange();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/dashboard?${dateRangeQuery(range)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("数据读取失败");
        return response.json() as Promise<DashboardData>;
      })
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, [range]);

  const totals = useMemo(
    () =>
      data?.overview.reduce(
        (sum, item) => ({
          followers: sum.followers + item.followers,
          views: sum.views + item.views,
          interactions: sum.interactions + item.interactions,
        }),
        { followers: 0, views: 0, interactions: 0 },
      ),
    [data],
  );

  if (error) return <div className="error-panel">{error}，请检查数据库连接后重试。</div>;
  if (!data || !totals) return <LoadingPanel />;

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">SOCIAL MEDIA COMMAND CENTER</p>
          <h1>新媒体运营驾驶舱</h1>
          <p>从平台表现到内容行动，一屏掌握所选周期运营节奏。</p>
        </div>
        <div className="data-freshness">
          <span className="status-dot" />
          数据库已连接 · {formatDateTime(data.updatedAt)}
        </div>
      </header>

      <section className="hero-strip">
        <div>
          <span>矩阵总粉丝</span>
          <strong>{formatCompact(totals.followers)}</strong>
          <small>四平台统一口径</small>
        </div>
        <div>
          <span>累计播放量</span>
          <strong>{formatCompact(totals.views)}</strong>
          <small>{data.range.label}作品合计</small>
        </div>
        <div>
          <span>累计互动量</span>
          <strong>{formatCompact(totals.interactions)}</strong>
          <small>{data.range.label}赞评藏转</small>
        </div>
        <div className="hero-action">
          <span>周期内已发布</span>
          <strong>{data.today.published}<em> 条</em></strong>
          <small>{data.today.pending} 项任务待推进</small>
        </div>
      </section>

      <section>
        <div className="section-title">
          <div>
            <span className="section-kicker">PLATFORM OVERVIEW</span>
            <h2>平台运营总览</h2>
          </div>
          <span className="section-note">粉丝、发布、播放与互动</span>
        </div>
        <div className="platform-grid">
          {data.overview.map((item) => (
            <article className={`platform-card platform-${item.platform}`} key={item.platform}>
              <div className="platform-card-head">
                <span className="platform-mark">{platformLabel(item.platform).slice(0, 1)}</span>
                <div>
                  <strong>{platformLabel(item.platform)}</strong>
                  <small>{item.followers ? "账号数据正常" : "等待账号接入"}</small>
                </div>
                <span className="live-pill">LIVE</span>
              </div>
              <div className="platform-primary">
                <span>粉丝数量</span>
                <strong>{formatCompact(item.followers)}</strong>
              </div>
              <div className="platform-metrics">
                <div><span>周期发布</span><strong>{item.todayPosts}</strong></div>
                <div><span>周期播放</span><strong>{formatCompact(item.views)}</strong></div>
                <div><span>互动量</span><strong>{formatCompact(item.interactions)}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-grid dashboard-grid-top">
        <section className="panel today-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">SELECTED PERIOD</span><h2>{data.range.label}内容情况</h2></div>
            <span className="count-badge">{data.today.pending} 待发布</span>
          </div>
          <div className="today-summary">
            <div><strong>{data.today.published}</strong><span>周期发布作品</span></div>
            <div><strong>{data.today.pending}</strong><span>待推进任务</span></div>
          </div>
          <div className="progress-list">
            {data.today.progress.map((item) => (
              <div className="progress-item" key={item.platform}>
                <div><span>{platformLabel(item.platform)}</span><strong>{item.completed}/{item.total || 0} · {item.rate}%</strong></div>
                <div className="progress-track"><span style={{ width: `${item.rate}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel ai-panel">
          <div className="panel-heading light-heading">
            <div><span className="section-kicker">AI INSIGHT</span><h2>周期运营建议</h2></div>
            <span className="ai-badge">AI</span>
          </div>
          <p className="ai-intro">基于当前作品表现与热点趋势生成，执行前请由运营负责人确认。</p>
          <ol className="suggestion-list">
            {data.aiSuggestions.map((suggestion, index) => (
              <li key={suggestion}><span>0{index + 1}</span><p>{suggestion}</p></li>
            ))}
          </ol>
          <small className="ai-disclaimer">模拟 AI 结果 · 未触发自动发布或自动回复</small>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-bottom">
        <section className="panel ranking-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">TOP CONTENT</span><h2>爆款作品排行</h2></div>
            <span className="section-note">按播放、点赞、评论排序</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>排名 / 作品</th><th>平台</th><th>播放量</th><th>点赞</th><th>评论</th><th>AI 分析</th></tr></thead>
              <tbody>
                {data.topPosts.map((post, index) => (
                  <tr key={post.id}>
                    <td><div className="rank-title"><span>{String(index + 1).padStart(2, "0")}</span><strong>{post.title}</strong></div></td>
                    <td><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span></td>
                    <td className="metric-cell">{formatCompact(post.views)}</td>
                    <td>{formatCompact(post.likes)}</td>
                    <td>{formatCompact(post.comments)}</td>
                    <td className="analysis-cell">{post.aiAnalysis?.summary ?? "等待分析"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel topics-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">TREND RADAR</span><h2>热点趋势</h2></div>
            <span className="pulse-label"><i /> 实时雷达</span>
          </div>
          <div className="topic-list">
            {data.topics.map((topic, index) => (
              <article key={topic.id}>
                <div className="topic-index">{index + 1}</div>
                <div className="topic-body">
                  <div><strong>{topic.topic_name}</strong><span>{platformLabel(topic.platform)}</span></div>
                  <p>{topic.ai_suggestion ?? "等待运营判断"}</p>
                </div>
                <div className="heat-value"><strong>{formatCompact(topic.heat_value)}</strong><span>{topic.trend === "rising" ? "↗ 上升" : "— 稳定"}</span></div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
