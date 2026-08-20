"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";
import type { ContentEffectEvaluation, EvaluationDimension } from "@/lib/content-effect-evaluation";

type Tab = "effect" | "traffic" | "trend" | "audience" | "keywords" | "comments";
type Availability = "available" | "partial" | "expired" | "unavailable";
type Comment = { id: number; username: string; comment_text: string | null; comment_type: string; comment_time: string | null; comment_time_raw: string | null; likes: number | null; likes_availability_status: string; reply_count: number; is_author: number; author_replied: number | null; sentiment: string; keyword: string | null; user_need: string | null };
type Distribution = { name: string; rate: number | null; value: number | null }[];
type DetailData = {
  post: { id: number; platform: string; platform_post_id: string | null; title: string; content_type: string; post_type: string | null; post_status: string | null; publish_time: string; post_url: string | null; cover_url: string | null; views: number | null; likes: number | null; comments: number | null; favorites: number | null; shares: number | null; fans_growth: number; interactions: number | null; duration: number | null; hasPaidTraffic: boolean; paidViews: number; organicViews: number | null; paidTrafficRelationship: "unknown" | "included" | "additional"; totalExposure: number | null };
  snapshot: { snapshot_time: string; post_age_days: number; actual_loaded_count: number | null; comment_rows_count: number; source_record_status: string; source_failure_reason: string | null } | null;
  traffic: { completion_rate?: number | null; average_play_duration_seconds?: number | null; two_sec_bounce_rate?: number | null; five_sec_completion_rate?: number | null; average_play_ratio?: number | null; cover_click_rate?: number | null; swipe_away_rate?: number | null; page_entry_rate?: number | null; comment_entry_rate?: number | null; text_expand_rate?: number | null; text_completion_rate?: number | null; average_images_viewed?: number | null; like_rate?: number | null; comment_rate?: number | null; share_rate?: number | null; favorite_rate?: number | null; not_interested_rate?: number | null; data_availability_status: Availability };
  metrics: { interactionRate: number | null; likeRate: number | null; commentRate: number | null; favoriteRate: number | null; shareRate: number | null; fanConversionRate: number | null; collectedCommentCount: number; actualLoadedCount: number | null; commentOverviewCount: number | null };
  keywords: { name: string; count: number | null; rank: number | null; sentiment: string | null; category: string | null }[];
  comments: Comment[];
  trafficSources: { name: string; value: number | null; rate: number | null; change: number | null; nature: "organic" | "other" }[];
  audience: { gender: Distribution; age: Distribution; region: Distribution; interest: Distribution; device: Distribution; activity: Distribution; attentionKeyword: Distribution; other: Distribution };
  metricSeries: { metric_type: string; series_name: string; point_index: number; point_time: string | null; point_label: string | null; metric_value: number; unit: string | null }[];
  paidTraffic: { campaign_type: string; play_count: number | null; relationship_to_overview: string; detail_available: number | null; data_availability_status: string }[];
  effectEvaluation: ContentEffectEvaluation | null;
  dataAvailability: { postAgeDays: number | null; overall: Availability; traffic: Availability; trafficSources: Availability; audience: Availability; commentKeywords: Availability; comments: Availability; notes: { traffic: string; trafficSources: string; audience: string; commentKeywords: string } };
  sources: string[];
  updatedAt: string;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "effect", label: "效果评价" },
  { id: "traffic", label: "流量分析" },
  { id: "trend", label: "数据趋势" },
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

const confidenceLabels = { high: "高", medium: "中", low: "低" } as const;

function EffectDimensionCard({ label, dimension }: { label: string; dimension: EvaluationDimension }) {
  const percent = dimension.score === null ? 0 : (dimension.score / dimension.maxScore) * 100;
  return <article className="effect-dimension-card">
    <div><span>{label}</span><strong>{dimension.score === null ? "暂无评分" : <>{dimension.score}<small>/{dimension.maxScore}</small></>}</strong></div>
    <i><b style={{ width: `${percent}%` }} /></i>
    <p>可用指标 {dimension.availableIndicators}/{dimension.totalIndicators} · 维度可信度 {dimension.confidence}%</p>
    {dimension.evidence.length > 0 && <ul>{dimension.evidence.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>}
  </article>;
}

function DistributionPanel({ title, values }: { title: string; values: Distribution }) {
  return <article className="audience-dimension-block"><h3>{title}</h3>{values.length ? <div className="traffic-source-list">{values.slice(0, 40).map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}</span>{typeof item.rate === "number" ? <><i><b style={{ width: `${Math.min(100, item.rate)}%` }} /></i><strong>{item.rate}%</strong></> : <strong>{typeof item.value === "number" ? formatCompact(item.value) : "平台未提供"}</strong>}</div>)}</div> : <p className="empty-list">平台暂未提供该维度数据</p>}</article>;
}

function SeriesChart({ title, points, color = "#168661" }: { title: string; points: DetailData["metricSeries"]; color?: string }) {
  if (!points.length) return <article className="audience-dimension-block"><h3>{title}</h3><p className="empty-list">平台未提供真实趋势点</p></article>;
  const width = 720;
  const height = 180;
  const values = points.map((point) => point.metric_value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const polyline = points.map((point, index) => `${(index / Math.max(1, points.length - 1)) * width},${height - ((point.metric_value - min) / range) * (height - 24) - 12}`).join(" ");
  return <article className="audience-dimension-block deep-series-card"><div className="deep-series-heading"><h3>{title}</h3><span>{points.length} 个真实数据点</span></div><svg aria-label={title} preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}><polyline fill="none" points={polyline} stroke={color} strokeLinejoin="round" strokeWidth="4" /></svg><div className="deep-series-meta"><span>最小 {formatCompact(min)}</span><strong>最新 {formatCompact(values.at(-1) ?? 0)}</strong><span>最大 {formatCompact(max)}</span></div></article>;
}

export default function ContentDetailPage() {
  const [activeTab, setActiveTab] = useState<Tab>("effect");
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
      <div className="detail-work-copy"><div className="detail-work-tags"><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span>{post.hasPaidTraffic && <span className="paid-traffic-badge">含付费流量</span>}{data.snapshot?.source_record_status === "private" && <span className="private-work-badge">私密作品</span>}</div><h1>{post.title}</h1><p>{formatDate(post.publish_time)} · {post.post_type || (post.content_type === "video" ? "短视频" : post.content_type)}{data.snapshot ? ` · 快照 ${formatDate(data.snapshot.snapshot_time)}` : ""}</p><strong className={`work-status ${data.snapshot?.source_record_status === "private" ? "private" : ""}`}><i />{data.snapshot?.source_record_status === "private" ? "作品状态：私密" : `作品状态：${post.post_status || "正常"}`}</strong></div>
      <a className="back-to-insights" href={`/insights/content?platform=${post.platform}`}>← 返回内容分析</a>
    </header>

    <nav className="detail-analysis-tabs" aria-label="作品数据分析">
      {tabs.map((tab) => <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
    </nav>

    {activeTab === "effect" && <section className="effect-evaluation-section">
      {data.effectEvaluation ? <>
        <article className="panel effect-score-hero">
          <div className="effect-score-main">
            <span className="section-kicker">CONTENT EFFECT EVALUATION · V1.0</span>
            <div className="effect-score-line">
              <strong>{data.effectEvaluation.overallScore ?? "—"}</strong><small>{data.effectEvaluation.overallScore === null ? "暂无综合评分" : "综合评分 / 100"}</small>
              <span className={`effect-grade grade-${data.effectEvaluation.grade ?? "none"}`}>{data.effectEvaluation.grade ?? "—"}级</span>
            </div>
            <h2>{data.effectEvaluation.gradeLabel}</h2>
            <p>{data.effectEvaluation.diagnosis.performanceConclusion}</p>
          </div>
          <div className="effect-trust-panel">
            <div><span>数据完整度</span><strong>{data.effectEvaluation.dataCompleteness}%</strong></div>
            <div><span>数据可信度</span><strong>{confidenceLabels[data.effectEvaluation.dataConfidence]}</strong></div>
            <div><span>自然表现可信度</span><strong>{confidenceLabels[data.effectEvaluation.naturalPerformanceConfidence]}</strong></div>
            <div><span>自然口径播放证据</span><strong>{data.effectEvaluation.naturalEvidenceViews === null ? "口径待确认" : formatCompact(data.effectEvaluation.naturalEvidenceViews)}</strong></div>
          </div>
          <div className="effect-label-row large">{data.effectEvaluation.labels.map((label) => <span className={`effect-label label-${label === "含付费流量" ? "paid" : label === "数据不足" ? "insufficient" : "result"}`} key={label}>{label}</span>)}</div>
        </article>

        <div className="effect-dimension-grid">
          <EffectDimensionCard label="A · 内容传播力" dimension={data.effectEvaluation.dimensions.propagation} />
          <EffectDimensionCard label="B · 互动质量" dimension={data.effectEvaluation.dimensions.interaction} />
          <EffectDimensionCard label="C · 用户吸引力" dimension={data.effectEvaluation.dimensions.attraction} />
          <EffectDimensionCard label="D · 内容效率" dimension={data.effectEvaluation.dimensions.efficiency} />
        </div>

        <article className="panel effect-baseline-panel">
          <div className="detail-panel-heading"><div><span className="section-kicker">ACCOUNT BASELINE</span><h2>独山子大峡谷账号动态基准</h2></div><span className="source-chip">真实历史样本 {data.effectEvaluation.historicalBaseline.sampleSize}</span></div>
          <div className="effect-baseline-grid">
            <div><span>最近7天作品</span><strong>{data.effectEvaluation.historicalBaseline.last7Days}</strong></div>
            <div><span>最近30天作品</span><strong>{data.effectEvaluation.historicalBaseline.last30Days}</strong></div>
            <div><span>历史播放中位数</span><strong>{data.effectEvaluation.historicalBaseline.medianViews === null ? "暂无" : formatCompact(data.effectEvaluation.historicalBaseline.medianViews)}</strong></div>
            <div><span>历史 TOP25% 门槛</span><strong>{data.effectEvaluation.historicalBaseline.top25Views === null ? "暂无" : formatCompact(data.effectEvaluation.historicalBaseline.top25Views)}</strong></div>
            <div><span>历史 TOP10% 门槛</span><strong>{data.effectEvaluation.historicalBaseline.top10Views === null ? "暂无" : formatCompact(data.effectEvaluation.historicalBaseline.top10Views)}</strong></div>
          </div>
          {data.effectEvaluation.historicalBaseline.message && <p className="data-quality-notice">{data.effectEvaluation.historicalBaseline.message}</p>}
        </article>

        <div className="effect-diagnosis-grid">
          <article><span>表现结论</span><p>{data.effectEvaluation.diagnosis.performanceConclusion}</p></article>
          <article><span>做得好的地方</span><ul>{data.effectEvaluation.diagnosis.strengths.map((item) => <li key={item}>{item}</li>)}</ul></article>
          <article><span>存在的问题</span>{data.effectEvaluation.diagnosis.problems.length ? <ul>{data.effectEvaluation.diagnosis.problems.map((item) => <li key={item}>{item}</li>)}</ul> : <p>当前真实指标未触发明确问题阈值。</p>}</article>
          <article><span>流量结构判断</span><p>{data.effectEvaluation.diagnosis.trafficAssessment}</p></article>
          <article><span>观众特征</span><p>{data.effectEvaluation.diagnosis.audienceFeatures}</p></article>
          <article><span>评论反馈</span><p>{data.effectEvaluation.diagnosis.commentFeedback}</p></article>
          <article className={post.hasPaidTraffic ? "paid-diagnosis" : ""}><span>DOU+ 影响</span><p>{data.effectEvaluation.diagnosis.paidImpact}</p></article>
          <article className="next-optimization"><span>下一条优化建议</span><ol>{data.effectEvaluation.diagnosis.nextOptimization.map((item) => <li key={item}>{item}</li>)}</ol></article>
        </div>
      </> : <AvailabilityMessage text="当前作品暂无可用的内容效果评价" />}
    </section>}

    {activeTab === "traffic" && <section className="detail-analysis-grid traffic-overview-grid">
      <div className="detail-column">
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">BASIC PERFORMANCE</span><h2>基础表现</h2></div><span className="source-chip">social_post_snapshots</span></div>{data.snapshot?.source_record_status === "private" ? <AvailabilityMessage text="该作品为私密作品，平台未提供表现数据" /> : <div className="detail-count-grid"><div><span>播放</span><CountValue value={post.views} /></div><div><span>点赞</span><CountValue value={post.likes} /></div><div><span>平台评论总览</span><CountValue value={metrics.commentOverviewCount} /></div><div><span>页面实际加载</span><CountValue value={metrics.actualLoadedCount} /></div><div><span>JSON评论记录</span><CountValue value={metrics.collectedCommentCount} /></div><div><span>收藏</span><CountValue value={post.favorites} /></div><div><span>分享</span><CountValue value={post.shares} /></div></div>}{post.hasPaidTraffic && <div className="paid-traffic-summary"><strong>DOU+ 付费播放 {formatCompact(post.paidViews)}</strong>{post.paidTrafficRelationship === "additional" ? <span>基础播放 {formatCompact(post.views ?? 0)} · DOU+为平台标注的额外流量 · 合计曝光 {formatCompact(post.totalExposure ?? post.views ?? 0)}</span> : <span>基础播放 {formatCompact(post.views ?? 0)} · 自然播放口径 {post.organicViews === null ? "平台未说明" : formatCompact(post.organicViews)}</span>}<p>DOU+ 独立保存，AI 爆款判断不把付费播放直接计为自然传播能力。</p></div>}</article>
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">CONTENT APPEAL</span><h2>流量分析</h2></div><span className={`availability-chip status-${data.dataAvailability.traffic}`}>{data.dataAvailability.traffic}</span></div>{data.dataAvailability.traffic === "expired" ? <AvailabilityMessage text={data.dataAvailability.notes.traffic} /> : <><div className="detail-rate-grid"><RateCard label="完播率" value={traffic.completion_rate} /><RateCard label="2秒跳出率" value={traffic.two_sec_bounce_rate} /><RateCard label="5秒完播率" value={traffic.five_sec_completion_rate} /><RateCard label="平均播放占比" value={traffic.average_play_ratio} /><RateCard label="划走率" value={traffic.swipe_away_rate} /><RateCard label="封面点击率" value={traffic.cover_click_rate} /><RateCard label="详情页进入率" value={traffic.page_entry_rate} /><RateCard label="评论进入率" value={traffic.comment_entry_rate} /></div><div className="detail-count-grid"><div><span>平均播放时长</span>{typeof traffic.average_play_duration_seconds === "number" ? <strong>{traffic.average_play_duration_seconds} 秒</strong> : <strong className="pending-metric">平台未提供</strong>}</div><div><span>平均浏览图片</span>{typeof traffic.average_images_viewed === "number" ? <strong>{traffic.average_images_viewed} 张</strong> : <strong className="pending-metric">平台未提供</strong>}</div></div></>}</article>
      </div>
      <div className="detail-column">
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">TRAFFIC SOURCES</span><h2>流量来源</h2></div><span className={`availability-chip status-${data.dataAvailability.trafficSources}`}>{data.dataAvailability.trafficSources}</span></div>{data.trafficSources.length ? <div className="traffic-source-list v2-traffic-source-list">{data.trafficSources.map((source) => <div key={`${source.nature}-${source.name}`}><span>{source.name}</span>{typeof source.rate === "number" ? <i><b style={{ width: `${Math.min(100, source.rate)}%` }} /></i> : <i><b style={{ width: "100%" }} /></i>}<strong>{typeof source.rate === "number" ? `${source.rate}%` : source.value === null ? "平台未提供" : formatCompact(source.value)}</strong></div>)}</div> : <AvailabilityMessage text={data.dataAvailability.notes.trafficSources} />}</article>
        <article className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">ENGAGEMENT</span><h2>观众参与度</h2></div></div><div className="detail-rate-grid"><RateCard label="互动率" value={metrics.interactionRate} /><RateCard label="点赞率" value={traffic.like_rate ?? metrics.likeRate} /><RateCard label="评论率" value={traffic.comment_rate ?? metrics.commentRate} /><RateCard label="收藏率" value={traffic.favorite_rate ?? metrics.favoriteRate} /><RateCard label="分享率" value={traffic.share_rate ?? metrics.shareRate} /><RateCard label="不感兴趣率" value={traffic.not_interested_rate} /></div></article>
      </div>
    </section>}

    {activeTab === "trend" && <section className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">REAL METRIC SERIES</span><h2>作品真实数据趋势</h2></div><span className="source-chip">social_post_metric_series</span></div><div className="audience-dimension-grid"><SeriesChart title="播放趋势" points={data.metricSeries.filter((point) => point.metric_type === "play" && point.series_name === "hourly_new")} /><SeriesChart title="作品吸粉趋势" points={data.metricSeries.filter((point) => point.metric_type === "follower_gain" && ["hourly_new", "daily_new"].includes(point.series_name))} color="#30bde0" /><SeriesChart title="内容留存 · 当前作品" points={data.metricSeries.filter((point) => point.metric_type === "retention" && point.series_name === "current")} color="#eb6b4a" /><SeriesChart title="跳出趋势 · 当前作品" points={data.metricSeries.filter((point) => point.metric_type === "bounce" && point.series_name === "current")} color="#c65454" /></div><p className="data-quality-notice">仅展示 WorkBuddy 从页面图表实例真实读取并写入的数据点；无时间轴的原始序列保留 point_index，不人工推算时间。</p></section>}

    {activeTab === "audience" && <section className="panel detail-panel"><div className="detail-panel-heading"><div><span className="section-kicker">AUDIENCE PROFILE</span><h2>作品级观众画像</h2></div><span className={`availability-chip status-${data.dataAvailability.audience}`}>{data.dataAvailability.audience}</span></div><p className="data-quality-notice">本页只展示当前作品观众画像，不与账号粉丝画像混用。</p>{audienceCount ? <div className="audience-dimension-grid"><DistributionPanel title="性别" values={data.audience.gender} /><DistributionPanel title="年龄" values={data.audience.age} /><DistributionPanel title="地域" values={data.audience.region} /><DistributionPanel title="兴趣" values={data.audience.interest} /><DistributionPanel title="活跃度" values={data.audience.activity} /><DistributionPanel title="观众关注热词" values={data.audience.attentionKeyword} /><DistributionPanel title="设备" values={data.audience.device} /><DistributionPanel title="其他真实维度" values={data.audience.other} /></div> : <AvailabilityMessage text={data.dataAvailability.notes.audience} />}</section>}

    {activeTab === "keywords" && <section className="panel detail-panel keyword-analysis-panel"><div className="detail-panel-heading"><div><span className="section-kicker">COMMENT KEYWORDS</span><h2>评论热词</h2></div><span className={`availability-chip status-${data.dataAvailability.commentKeywords}`}>{data.dataAvailability.commentKeywords}</span></div>{data.keywords.length ? <div className="detail-keyword-cloud large">{data.keywords.map((item) => <span key={`${item.rank}-${item.name}`}>{item.name}<b>{item.count ?? `#${item.rank ?? "-"}`}</b></span>)}</div> : <AvailabilityMessage text={data.dataAvailability.notes.commentKeywords} />}<div className="sentiment-summary"><div className="positive"><span>正向评论</span><strong>{sentimentSummary.positive}</strong></div><div className="neutral"><span>中性评论</span><strong>{sentimentSummary.neutral}</strong></div><div className="negative"><span>负向评论</span><strong>{sentimentSummary.negative}</strong></div><div><span>待分析</span><strong>{sentimentSummary.unknown}</strong></div></div></section>}

    {activeTab === "comments" && <section className="panel detail-panel comment-management-panel"><div className="detail-panel-heading"><div><span className="section-kicker">COMMENT MANAGEMENT</span><h2>真实评论内容</h2></div><span className="source-chip">总览 {metrics.commentOverviewCount ?? "平台未提供"} · 页面读取 {metrics.actualLoadedCount ?? "平台未提供"} · 已保存 {metrics.collectedCommentCount}</span></div>{metrics.actualLoadedCount !== null && metrics.actualLoadedCount !== metrics.collectedCommentCount && <div className="data-quality-notice">WorkBuddy 页面计数为 {metrics.actualLoadedCount} 条，源文件实际明细为 {metrics.collectedCommentCount} 行；系统只保存真实明细，不把差额视为采集失败，也不会补造评论。</div>}<div className="table-wrap"><table className="content-table detail-comment-table"><thead><tr><th>用户</th><th>类型</th><th>评论内容</th><th>时间</th><th>点赞</th><th>回复</th><th>情绪</th></tr></thead><tbody>{data.comments.map((comment) => <tr key={comment.id}><td><strong>{comment.username}</strong>{comment.is_author === 1 && <small className="table-subline">作者</small>}</td><td><span className="comment-type-badge">{commentTypeLabels[comment.comment_type] ?? comment.comment_type}</span></td><td className="comment-copy">{comment.comment_text ?? `【${commentTypeLabels[comment.comment_type] ?? "无文字"}评论】`}</td><td className="date-cell">{comment.comment_time ? formatDate(comment.comment_time) : comment.comment_time_raw || "平台未提供精确时间"}</td><td>{comment.likes === null ? <span className="pending-metric">平台未提供</span> : formatCompact(comment.likes)}</td><td>{formatCompact(comment.reply_count)}</td><td><span className={`sentiment-tag sentiment-${comment.sentiment}`}>{sentimentLabels[comment.sentiment] ?? "待分析"}</span></td></tr>)}{!data.comments.length && <tr><td className="empty-cell" colSpan={7}>该作品暂无已保存评论明细</td></tr>}</tbody></table></div></section>}

    <p className="analysis-disclaimer">数据来源：{data.sources?.join("、") ?? "作品 V2.1 数据模型"} · 更新时间：{formatDate(data.updatedAt)} · 作品年龄 {data.dataAvailability.postAgeDays ?? "未知"} 天 · 未采集指标不会生成模拟数据。</p>
  </div>;
}
