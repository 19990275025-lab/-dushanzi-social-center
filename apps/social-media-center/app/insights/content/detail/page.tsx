"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";

type Tab = "traffic" | "audience" | "keywords" | "comments";
type Comment = { id: number; username: string; comment_text: string; comment_time: string; likes: number; sentiment: string; keyword: string | null; user_need: string | null };
type DetailData = {
  post: { id: number; platform: string; title: string; content_type: string; publish_time: string; cover_url: string | null; views: number; likes: number; comments: number; favorites: number; shares: number; fans_growth: number; interactions: number; duration: number | null; completion_rate: number | null; average_play_duration: number | null };
  metrics: { interactionRate: number; likeRate: number; commentRate: number; favoriteRate: number; shareRate: number; fanConversionRate: number; collectedCommentCount: number };
  keywords: { name: string; count: number }[];
  comments: Comment[];
  trafficSources: { name: string; rate: number }[];
  audience: { gender: { name: string; rate: number }[]; age: { name: string; rate: number }[]; region: { name: string; rate: number }[] };
  dataAvailability: { missing: string[]; note: string };
  updatedAt: string;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "traffic", label: "流量分析" },
  { id: "audience", label: "观众分析" },
  { id: "keywords", label: "评论热词" },
  { id: "comments", label: "评论管理" },
];

const sentimentLabels: Record<string, string> = { positive: "正向", negative: "负向", neutral: "中性", unknown: "待分析" };

function RateCard({ label, value, status }: { label: string; value?: number; status?: string }) {
  return <div className="detail-rate-item"><span>{label}</span>{typeof value === "number" ? <strong>{value.toFixed(2)}<small>%</small></strong> : <strong className="pending-metric">{status ?? "待采集"}</strong>}</div>;
}

export default function ContentDetailPage() {
  const [activeTab, setActiveTab] = useState<Tab>("traffic");
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { void Promise.resolve().then(() => setError("缺少作品编号")); return; }
    void fetch(`/api/insights/content/detail?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const body = await response.json() as DetailData & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "作品数据读取失败");
        setData(body);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "作品数据读取失败"));
  }, []);

  const sentimentSummary = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
    for (const comment of data?.comments ?? []) {
      const key = comment.sentiment in counts ? comment.sentiment as keyof typeof counts : "unknown";
      counts[key] += 1;
    }
    return counts;
  }, [data]);

  if (error) return <div className="error-panel">{error}</div>;
  if (!data) return <div className="loading-panel"><span className="loading-dot" />正在读取作品分析数据…</div>;

  const { post, metrics } = data;
  return (
    <div className={`page-stack content-detail-page platform-themed-page theme-${post.platform}`}>
      <header className="detail-work-hero">
        <div className={`detail-work-cover ${post.cover_url ? "has-cover" : ""}`} style={post.cover_url ? { backgroundImage: `url(${post.cover_url})` } : undefined}><span>{post.cover_url ? "" : "作品"}</span></div>
        <div className="detail-work-copy"><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span><h1>{post.title}</h1><p>{formatDate(post.publish_time)} · {post.content_type === "video" ? "短视频" : post.content_type}</p><strong className="work-status"><i />作品状态正常</strong></div>
        <a className="back-to-insights" href="/insights/content">← 返回内容分析</a>
      </header>

      <nav className="detail-analysis-tabs" aria-label="作品数据分析">
        {tabs.map((tab) => <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>

      {activeTab === "traffic" && <section className="detail-analysis-grid">
        <div className="detail-column">
          <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">CONTENT APPEAL</span><h2>内容吸引力</h2></div><span className="source-chip">social_posts</span></div><div className="detail-rate-grid"><RateCard label="互动率" value={metrics.interactionRate} /><RateCard label="点赞率" value={metrics.likeRate} /><RateCard label="评论率" value={metrics.commentRate} /><RateCard label="收藏率" value={metrics.favoriteRate} /><RateCard label="分享率" value={metrics.shareRate} /><RateCard label="完播率" value={post.completion_rate ?? undefined} /></div>{post.average_play_duration !== null && <div className="detail-count-grid"><div><span>平均播放时长</span><strong>{post.average_play_duration} 秒</strong></div></div>}</article>
          <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">ENGAGEMENT</span><h2>观众参与度</h2></div></div><div className="detail-count-grid"><div><span>点赞</span><strong>{formatCompact(post.likes)}</strong></div><div><span>评论</span><strong>{formatCompact(post.comments)}</strong></div><div><span>收藏</span><strong>{formatCompact(post.favorites)}</strong></div><div><span>分享</span><strong>{formatCompact(post.shares)}</strong></div></div></article>
        </div>
        <div className="detail-column">
          <article className="panel detail-panel traffic-source-panel"><div className="detail-panel-heading"><div><span className="section-kicker">TRAFFIC SOURCE</span><h2>流量来源</h2></div><span className={data.trafficSources.length ? "source-chip" : "pending-chip"}>{data.trafficSources.length ? "V2.0 已采集" : "待采集"}</span></div>{data.trafficSources.length ? <div className="traffic-source-list">{data.trafficSources.map((item) => <div key={item.name}><span>{item.name}</span><i><b style={{ width: `${Math.min(100, item.rate)}%` }} /></i><strong>{item.rate}%</strong></div>)}</div> : <div className="detail-empty-state"><strong>暂无平台流量来源明细</strong><p>后续接入抖音创作者后台指标后，将显示推荐页、个人主页、关注页等来源占比。</p></div>}</article>
          <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">SEARCH KEYWORDS</span><h2>搜索与评论关键词</h2></div></div><div className="detail-keyword-cloud">{data.keywords.slice(0, 10).map((item) => <span key={item.name}>{item.name}<b>{item.count}</b></span>)}{!data.keywords.length && <p className="empty-list">暂无标签或评论关键词</p>}</div></article>
        </div>
      </section>}

      {activeTab === "audience" && <section className="detail-analysis-grid">
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">AUDIENCE ACTION</span><h2>观众行为</h2></div><span className="source-chip">真实作品指标</span></div><div className="detail-rate-grid"><RateCard label="互动率" value={metrics.interactionRate} /><RateCard label="涨粉转化率" value={metrics.fanConversionRate} /><RateCard label="主页进入率" /></div><div className="detail-count-grid audience-counts"><div><span>播放</span><strong>{formatCompact(post.views)}</strong></div><div><span>累计互动</span><strong>{formatCompact(post.interactions)}</strong></div><div><span>作品涨粉</span><strong>{formatCompact(post.fans_growth)}</strong></div></div></article>
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">AUDIENCE PROFILE</span><h2>观众画像</h2></div><span className={data.audience.age.length + data.audience.gender.length + data.audience.region.length ? "source-chip" : "pending-chip"}>{data.audience.age.length + data.audience.gender.length + data.audience.region.length ? "V2.0 已采集" : "待采集"}</span></div>{data.audience.age.length + data.audience.gender.length + data.audience.region.length ? <div className="traffic-source-list">{[...data.audience.gender, ...data.audience.age, ...data.audience.region].map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}</span><i><b style={{ width: `${Math.min(100, item.rate)}%` }} /></i><strong>{item.rate}%</strong></div>)}</div> : <div className="detail-empty-state tall"><strong>暂无该作品观众画像</strong><p>{data.dataAvailability.note}</p><a href="/insights/fans">查看账号粉丝分析 →</a></div>}</article>
      </section>}

      {activeTab === "keywords" && <section className="panel detail-panel keyword-analysis-panel"><div className="detail-panel-heading"><div><span className="section-kicker">COMMENT KEYWORDS</span><h2>评论热词</h2></div><span className="source-chip">已采集 {metrics.collectedCommentCount} 条</span></div><div className="detail-keyword-cloud large">{data.keywords.map((item) => <span key={item.name}>{item.name}<b>{item.count}</b></span>)}{!data.keywords.length && <p className="empty-list">该作品暂无可分析的评论关键词</p>}</div><div className="sentiment-summary"><div className="positive"><span>正向</span><strong>{sentimentSummary.positive}</strong></div><div className="neutral"><span>中性</span><strong>{sentimentSummary.neutral}</strong></div><div className="negative"><span>负向</span><strong>{sentimentSummary.negative}</strong></div><div><span>待分析</span><strong>{sentimentSummary.unknown}</strong></div></div></section>}

      {activeTab === "comments" && <section className="panel detail-panel comment-management-panel"><div className="detail-panel-heading"><div><span className="section-kicker">COMMENT MANAGEMENT</span><h2>评论管理</h2></div><span className="source-chip">social_comments · {metrics.collectedCommentCount} 条</span></div><div className="table-wrap"><table className="content-table detail-comment-table"><thead><tr><th>用户</th><th>评论内容</th><th>时间</th><th>点赞</th><th>情绪</th><th>游客需求</th></tr></thead><tbody>{data.comments.map((comment) => <tr key={comment.id}><td><strong>{comment.username}</strong></td><td className="comment-copy">{comment.comment_text}</td><td className="date-cell">{formatDate(comment.comment_time)}</td><td>{formatCompact(comment.likes)}</td><td><span className={`sentiment-tag sentiment-${comment.sentiment}`}>{sentimentLabels[comment.sentiment] ?? "待分析"}</span></td><td>{comment.user_need || "待分析"}</td></tr>)}{!data.comments.length && <tr><td className="empty-cell" colSpan={6}>该作品暂无已采集评论</td></tr>}</tbody></table></div></section>}

      <p className="analysis-disclaimer">数据来源：social_posts、social_comments · 更新时间：{formatDate(data.updatedAt)} · 未采集指标不会生成模拟数据。</p>
    </div>
  );
}
