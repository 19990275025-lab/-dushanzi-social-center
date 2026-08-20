"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";

type Tab = "traffic" | "audience" | "keywords" | "comments";
type Availability = "available" | "partial" | "expired" | "unavailable";
type Comment = { id: number; username: string; comment_text: string | null; comment_type: string; comment_time: string | null; comment_time_raw: string | null; likes: number; reply_count: number; is_author: number; author_replied: number | null; sentiment: string; keyword: string | null; user_need: string | null };
type Distribution = { name: string; rate: number | null; value: number | null }[];
type DetailData = {
  post: { id: number; platform: string; platform_post_id: string | null; title: string; content_type: string; post_type: string | null; publish_time: string; post_url: string | null; cover_url: string | null; views: number; likes: number; comments: number; favorites: number | null; shares: number; fans_growth: number; interactions: number | null; duration: number | null; hasPaidTraffic: boolean; paidViews: number; organicViews: number };
  snapshot: { snapshot_time: string; post_age_days: number; actual_loaded_count: number | null; comment_rows_count: number } | null;
  traffic: { completion_rate?: number | null; average_play_duration_seconds?: number | null; two_sec_bounce_rate?: number | null; five_sec_completion_rate?: number | null; average_play_ratio?: number | null; cover_click_rate?: number | null; swipe_away_rate?: number | null; page_entry_rate?: number | null; comment_entry_rate?: number | null; text_expand_rate?: number | null; text_completion_rate?: number | null; average_images_viewed?: number | null; like_rate?: number | null; comment_rate?: number | null; share_rate?: number | null; favorite_rate?: number | null; not_interested_rate?: number | null; data_availability_status: Availability };
  metrics: { interactionRate: number | null; likeRate: number | null; commentRate: number | null; favoriteRate: number | null; shareRate: number | null; fanConversionRate: number | null; collectedCommentCount: number; actualLoadedCount: number; commentOverviewCount: number };
  keywords: { name: string; count: number | null; rank: number | null; sentiment: string | null; category: string | null }[];
  comments: Comment[];
  trafficSources: { name: string; value: number | null; rate: number | null; change: number | null; nature: "organic" | "paid" | "other" }[];
  audience: { gender: Distribution; age: Distribution; region: Distribution; interest: Distribution; device: Distribution; other: Distribution };
  dataAvailability: { postAgeDays: number | null; overall: Availability; traffic: Availability; trafficSources: Availability; audience: Availability; commentKeywords: Availability; comments: Availability; notes: { traffic: string; trafficSources: string; audience: string; commentKeywords: string } };
  sources: string[];
  updatedAt: string;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "traffic", label: "流量分析" },
  { id: "audience", label: "观众分析" },
  { id: "keywords", label: "评论热词" },
  { id: "comments", label: "评论管理" },
];

const sentimentLabels: Record<string, string> = { positive: "正向", negative: "负向", neutral: "中性", unknown: "待分析" };
const commentTypeLabels: Record<string, string> = { text: "文字", image: "图片", emoji: "表情", mixed: "混合", other: "无文字" };

function RateCard({ label, value, suffix = "%" }: { label: string; value?: number | null; suffix?: string }) {
  return <div className="detail-rate-item"><span>{label}</span>{typeof value === "number" ? <strong>{value.toFixed(2)}<small>{suffix}</small></strong> : <strong className="pending-metric">平台未提供</strong>}</div>;
}

function CountValue({ value }: { value: number | null }) {
  return value === null ? <strong className="pending-metric">平台未提供</strong> : <strong>{formatCompact(value)}</strong>;
}

function AvailabilityMessage({ text }: { text: string }) {
  return <div className="detail-empty-state tall"><strong>{text}</strong><p>缺失字段保持 null / unavailable，不会转换为 0，也不会由规则模型补齐。</p></div>;
}

function DistributionPanel({ title, values }: { title: string; values: Distribution }) {
  return <article className="audience-dimension-block"><h3>{title}</h3>{values.length ? <div className="traffic-source-list">{values.slice(0, 40).map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}</span>{typeof item.rate === "number" ? <><i><b style={{ width: `${Math.min(100, item.rate)}%` }} /></i><strong>{item.rate}%</strong></> : <strong>{typeof item.value === "number" ? formatCompact(item.value) : "平台未提供"}</strong>}</div>)}</div> : <p className="empty-list">平台暂未提供该维度数据</p>}</article>;
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
  const { post, metrics, traffic } = data;
  const audienceCount = Object.values(data.audience).reduce((total, values) => total + values.length, 0);

  return <div className={`page-stack content-detail-page platform-themed-page theme-${post.platform}`}>
    <header className="detail-work-hero">
      <div className={`detail-work-cover ${post.cover_url ? "has-cover" : ""}`} style={post.cover_url ? { backgroundImage: `url(${post.cover_url})` } : undefined}><span>{post.cover_url ? "" : "作品"}</span></div>
      <div className="detail-work-copy"><div className="detail-work-tags"><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span>{post.hasPaidTraffic && <span className="paid-traffic-badge">含付费流量</span>}</div><h1>{post.title}</h1><p>{formatDate(post.publish_time)} · {post.post_type || (post.content_type === "video" ? "短视频" : post.content_type)}{data.snapshot ? ` · 快照 ${formatDate(data.snapshot.snapshot_time)}` : ""}</p><strong className="work-status"><i />作品状态正常</strong></div>
      <a className="back-to-insights" href={`/insights/content?platform=${post.platform}`}>← 返回内容分析</a>
    </header>

    <nav className="detail-analysis-tabs" aria-label="作品数据分析">
      {tabs.map((tab) => <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
    </nav>

    {activeTab === "traffic" && <section className="detail-analysis-grid traffic-overview-grid">
      <div className="detail-column">
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">BASIC PERFORMANCE</span><h2>基础表现</h2></div><span className="source-chip">social_post_snapshots</span></div><div className="detail-count-grid"><div><span>播放</span><CountValue value={post.views} /></div><div><span>点赞</span><CountValue value={post.likes} /></div><div><span>平台评论总览</span><CountValue value={metrics.commentOverviewCount} /></div><div><span>页面实际加载</span><CountValue value={metrics.actualLoadedCount} /></div><div><span>JSON评论记录</span><CountValue value={metrics.collectedCommentCount} /></div><div><span>收藏</span><CountValue value={post.favorites} /></div><div><span>分享</span><CountValue value={post.shares} /></div></div>{post.hasPaidTraffic && <div className="paid-traffic-summary"><strong>DOU+ 付费播放 {formatCompact(post.paidViews)}</strong><span>总播放 {formatCompact(post.views)} · 可识别自然播放 {formatCompact(post.organicViews)}</span><p>AI 爆款判断不把付费播放作为自然传播能力。</p></div>}</article>
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">CONTENT APPEAL</span><h2>流量分析</h2></div><span className={`availability-chip status-${data.dataAvailability.traffic}`}>{data.dataAvailability.traffic}</span></div>{data.dataAvailability.traffic === "expired" ? <AvailabilityMessage text={data.dataAvailability.notes.traffic} /> : <><div className="detail-rate-grid"><RateCard label="完播率" value={traffic.completion_rate} /><RateCard label="2秒跳出率" value={traffic.two_sec_bounce_rate} /><RateCard label="5秒完播率" value={traffic.five_sec_completion_rate} /><RateCard label="平均播放占比" value={traffic.average_play_ratio} /><RateCard label="划走率" value={traffic.swipe_away_rate} /><RateCard label="封面点击率" value={traffic.cover_click_rate} /><RateCard label="详情页进入率" value={traffic.page_entry_rate} /><RateCard label="评论进入率" value={traffic.comment_entry_rate} /></div><div className="detail-count-grid"><div><span>平均播放时长</span>{typeof traffic.average_play_duration_seconds === "number" ? <strong>{traffic.average_play_duration_seconds} 秒</strong> : <strong className="pending-metric">平台未提供</strong>}</div><div><span>平均浏览图片</span>{typeof traffic.average_images_viewed === "number" ? <strong>{traffic.average_images_viewed} 张</strong> : <strong className="pending-metric">平台未提供</strong>}</div></div></>}</article>
      </div>
      <div className="detail-column">
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">TRAFFIC SOURCES</span><h2>流量来源</h2></div><span className={`availability-chip status-${data.dataAvailability.trafficSources}`}>{data.dataAvailability.trafficSources}</span></div>{data.trafficSources.length ? <div className="traffic-source-list v2-traffic-source-list">{data.trafficSources.map((source) => <div className={source.nature === "paid" ? "paid-source-row" : ""} key={`${source.nature}-${source.name}`}><span>{source.name}{source.nature === "paid" ? " · 付费" : ""}</span>{typeof source.rate === "number" ? <i><b style={{ width: `${Math.min(100, source.rate)}%` }} /></i> : <i><b style={{ width: "100%" }} /></i>}<strong>{typeof source.rate === "number" ? `${source.rate}%` : formatCompact(source.value ?? 0)}</strong></div>)}</div> : <AvailabilityMessage text={data.dataAvailability.notes.trafficSources} />}</article>
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">ENGAGEMENT</span><h2>观众参与度</h2></div></div><div className="detail-rate-grid"><RateCard label="互动率" value={metrics.interactionRate} /><RateCard label="点赞率" value={traffic.like_rate ?? metrics.likeRate} /><RateCard label="评论率" value={traffic.comment_rate ?? metrics.commentRate} /><RateCard label="收藏率" value={traffic.favorite_rate ?? metrics.favoriteRate} /><RateCard label="分享率" value={traffic.share_rate ?? metrics.shareRate} /><RateCard label="不感兴趣率" value={traffic.not_interested_rate} /></div></article>
      </div>
    </section>}

    {activeTab === "audience" && <section className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">AUDIENCE PROFILE</span><h2>作品级观众画像</h2></div><span className={`availability-chip status-${data.dataAvailability.audience}`}>{data.dataAvailability.audience}</span></div>{audienceCount ? <div className="audience-dimension-grid"><DistributionPanel title="性别" values={data.audience.gender} /><DistributionPanel title="年龄" values={data.audience.age} /><DistributionPanel title="地域" values={data.audience.region} /><DistributionPanel title="兴趣" values={data.audience.interest} /><DistributionPanel title="设备" values={data.audience.device} /><DistributionPanel title="其他真实维度" values={data.audience.other} /></div> : <AvailabilityMessage text={data.dataAvailability.notes.audience} />}</section>}

    {activeTab === "keywords" && <section className="panel detail-panel keyword-analysis-panel"><div className="detail-panel-heading"><div><span className="section-kicker">COMMENT KEYWORDS</span><h2>评论热词</h2></div><span className={`availability-chip status-${data.dataAvailability.commentKeywords}`}>{data.dataAvailability.commentKeywords}</span></div>{data.keywords.length ? <div className="detail-keyword-cloud large">{data.keywords.map((item) => <span key={`${item.rank}-${item.name}`}>{item.name}<b>{item.count ?? `#${item.rank ?? "-"}`}</b></span>)}</div> : <AvailabilityMessage text={data.dataAvailability.notes.commentKeywords} />}<div className="sentiment-summary"><div className="positive"><span>正向评论</span><strong>{sentimentSummary.positive}</strong></div><div className="neutral"><span>中性评论</span><strong>{sentimentSummary.neutral}</strong></div><div className="negative"><span>负向评论</span><strong>{sentimentSummary.negative}</strong></div><div><span>待分析</span><strong>{sentimentSummary.unknown}</strong></div></div></section>}

    {activeTab === "comments" && <section className="panel detail-panel comment-management-panel"><div className="detail-panel-heading"><div><span className="section-kicker">COMMENT MANAGEMENT</span><h2>真实评论内容</h2></div><span className="source-chip">总览 {metrics.commentOverviewCount} · 页面读取 {metrics.actualLoadedCount} · 已保存 {metrics.collectedCommentCount}</span></div>{metrics.actualLoadedCount !== metrics.collectedCommentCount && <div className="data-quality-notice">WorkBuddy 页面计数为 {metrics.actualLoadedCount} 条，源文件实际明细为 {metrics.collectedCommentCount} 行；系统只保存真实明细，不把差额视为采集失败，也不会补造评论。</div>}<div className="table-wrap"><table className="content-table detail-comment-table"><thead><tr><th>用户</th><th>类型</th><th>评论内容</th><th>时间</th><th>点赞</th><th>回复</th><th>情绪</th></tr></thead><tbody>{data.comments.map((comment) => <tr key={comment.id}><td><strong>{comment.username}</strong>{comment.is_author === 1 && <small className="table-subline">作者</small>}</td><td><span className="comment-type-badge">{commentTypeLabels[comment.comment_type] ?? comment.comment_type}</span></td><td className="comment-copy">{comment.comment_text ?? `【${commentTypeLabels[comment.comment_type] ?? "无文字"}评论】`}</td><td className="date-cell">{comment.comment_time ? formatDate(comment.comment_time) : comment.comment_time_raw || "平台未提供精确时间"}</td><td>{formatCompact(comment.likes)}</td><td>{formatCompact(comment.reply_count)}</td><td><span className={`sentiment-tag sentiment-${comment.sentiment}`}>{sentimentLabels[comment.sentiment] ?? "待分析"}</span></td></tr>)}{!data.comments.length && <tr><td className="empty-cell" colSpan={7}>该作品暂无已保存评论明细</td></tr>}</tbody></table></div></section>}

    <p className="analysis-disclaimer">数据来源：{data.sources?.join("、") ?? "作品 V2.0 数据模型"} · 更新时间：{formatDate(data.updatedAt)} · 作品年龄 {data.dataAvailability.postAgeDays ?? "未知"} 天 · 未采集指标不会生成模拟数据。</p>
  </div>;
}
