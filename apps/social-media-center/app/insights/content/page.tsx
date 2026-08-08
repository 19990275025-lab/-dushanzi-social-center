"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";
import { dateRangeQuery } from "@/lib/date-range";
import { useGlobalDateRange } from "@/components/GlobalDateFilter";

const platformOptions = ["all", "douyin", "kuaishou", "weibo", "wechat_channels"];
const contentTypeLabels: Record<string, string> = {
  video: "短视频",
  image_text: "图文",
  text: "文字",
  article: "文章",
  live: "直播",
};

type Overview = { platform: string; postCount: number; totalViews: number; interactions: number; fansGrowth: number; followers: number };
type ContentType = { contentType: string; postCount: number; views: number; interactions: number; fansGrowth: number; fansPerTenThousandViews?: number };
type TopPost = { id: number; platform: string; title: string; content_type: string; publish_time: string; views: number; likes: number; comments: number; favorites: number; shares: number; fans_growth: number; interactions: number };
type ContentData = {
  platform: string;
  totals: { postCount: number; totalViews: number; interactions: number; fansGrowth: number };
  platformOverview: Overview[];
  contentTypes: ContentType[];
  topPosts: TopPost[];
  contentFanRelations: ContentType[];
  suggestions: string[];
  updatedAt: string;
};

export default function ContentInsightsPage() {
  const range = useGlobalDateRange();
  const [platform, setPlatform] = useState("all");
  const [data, setData] = useState<ContentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/insights/content?platform=${platform}&${dateRangeQuery(range)}`);
      if (!response.ok) throw new Error("内容洞察数据读取失败");
      setData(await response.json() as ContentData);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "内容洞察数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [platform, range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const maxTypeViews = useMemo(() => Math.max(...(data?.contentTypes.map((item) => item.views) ?? [0]), 1), [data]);

  if (loading && !data) return <div className="loading-panel"><span className="loading-dot" />正在读取内容表现…</div>;
  if (error || !data) return <div className="error-panel">{error || "暂无内容数据"}</div>;

  return (
    <div className="page-stack content-insights-page">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">CONTENT ANALYSIS</p><h1>内容分析</h1><p>本页只展示作品表现与内容转粉数据，不混入粉丝画像。</p></div>
        <a className="back-to-insights" href="/insights">← 返回洞察中心</a>
      </header>

      <nav className="insight-platform-tabs" aria-label="内容分析平台筛选">
        {platformOptions.map((item) => <button className={platform === item ? "active" : ""} key={item} onClick={() => setPlatform(item)}>{item === "all" ? "全部平台" : platformLabel(item)}</button>)}
      </nav>

      <section className="platform-overview-grid">
        {data.platformOverview.map((item) => <article className={`platform-overview-card platform-${item.platform}`} key={item.platform}><div><span>{platformLabel(item.platform)}</span><small>{item.postCount ? "已有内容数据" : "等待数据"}</small></div><strong>{item.postCount}<em>作品</em></strong><p><span>播放 {formatCompact(item.totalViews)}</span><span>互动 {formatCompact(item.interactions)}</span></p></article>)}
      </section>

      <section className="insight-metric-strip">
        <article><span>作品数量</span><strong>{data.totals.postCount}</strong><small>social_posts</small></article>
        <article><span>累计播放</span><strong>{formatCompact(data.totals.totalViews)}</strong><small>当前筛选范围</small></article>
        <article><span>累计互动</span><strong>{formatCompact(data.totals.interactions)}</strong><small>赞评藏转合计</small></article>
        <article><span>内容带来涨粉</span><strong>{formatCompact(data.totals.fansGrowth)}</strong><small>fans_growth 合计</small></article>
      </section>

      <section className="content-insight-grid">
        <article className="panel content-type-panel">
          <div className="panel-heading"><div><span className="section-kicker">CONTENT MIX</span><h2>内容类型分析</h2></div></div>
          <div className="content-type-bars">{data.contentTypes.map((item) => <div key={item.contentType}><div><strong>{contentTypeLabels[item.contentType] ?? item.contentType}</strong><span>{item.postCount} 条 · {formatCompact(item.views)}播放</span></div><i><b style={{ width: `${(item.views / maxTypeViews) * 100}%` }} /></i><em>{formatCompact(item.interactions)}互动</em></div>)}{!data.contentTypes.length && <p className="empty-list">当前平台暂无内容类型数据</p>}</div>
        </article>
        <article className="panel ai-content-advice">
          <div className="panel-heading light-heading"><div><span className="section-kicker">AI OPTIMIZATION</span><h2>AI 优化建议</h2></div><span className="rule-badge">RULES V1</span></div>
          <ol>{data.suggestions.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></li>)}</ol>
        </article>
      </section>

      <section className="panel breakout-panel">
        <div className="panel-heading"><div><span className="section-kicker">TOP CONTENT</span><h2>爆款作品排行</h2></div><span className="section-note">按播放量优先排序</span></div>
        <div className="table-wrap"><table className="content-table"><thead><tr><th>排名</th><th>作品</th><th>平台</th><th>播放</th><th>互动</th><th>涨粉</th><th>发布时间</th></tr></thead><tbody>{data.topPosts.map((post, index) => <tr key={post.id}><td><span className={`rank-chip rank-${index + 1}`}>TOP {index + 1}</span></td><td><strong>{post.title}</strong><small className="table-subline">{contentTypeLabels[post.content_type] ?? post.content_type}</small></td><td><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span></td><td className="metric-cell">{formatCompact(post.views)}</td><td>{formatCompact(post.interactions)}</td><td>{formatCompact(post.fans_growth)}</td><td className="date-cell">{formatDate(post.publish_time)}</td></tr>)}{!data.topPosts.length && <tr><td className="empty-cell" colSpan={7}>当前平台暂无作品数据</td></tr>}</tbody></table></div>
      </section>

      <section className="panel content-fan-panel">
        <div className="panel-heading"><div><span className="section-kicker">CONTENT × FANS</span><h2>内容与粉丝关联分析</h2></div><span className="section-note">基于作品 fans_growth，不推断用户画像</span></div>
        <div className="relation-summary-grid">{data.contentFanRelations.map((item) => <article key={item.contentType}><span>{contentTypeLabels[item.contentType] ?? item.contentType}</span><strong>{formatCompact(item.fansGrowth)}<small>涨粉</small></strong><p>每万次播放带来 <b>{item.fansPerTenThousandViews}</b> 位粉丝</p></article>)}{!data.contentFanRelations.length && <p className="empty-list">暂无可计算的内容转粉数据</p>}</div>
      </section>
      <p className="analysis-disclaimer">更新时间：{formatDate(data.updatedAt)} · 内容分析数据仅来自 social_posts 与 social_accounts。</p>
    </div>
  );
}
