"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useGlobalDateRange } from "@/components/GlobalDateFilter";
import { dateRangeQuery } from "@/lib/date-range";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";
import type { ContentEffectEvaluation } from "@/lib/content-effect-evaluation";

type TopPost = {
  id: number;
  title: string;
  platform: string;
  publish_time: string;
  views: number;
  interactions: number;
  interactionRate: number;
  aiScore: number;
  organic_views: number | null;
  paid_views: number;
  has_paid_traffic: number;
  data_availability_status: string;
  effectEvaluation: ContentEffectEvaluation | null;
  play_delta: number | null;
  like_delta: number | null;
  comment_delta: number | null;
  favorite_delta: number | null;
  share_delta: number | null;
};

type BreakoutItem = {
  postId: number;
  title: string;
  views: number;
  aiScore: number;
  reason: string;
  structure: string;
  titleFeature: string;
  shootingMethod: string;
  commentSignal: string;
};

type LowEfficiencyItem = {
  postId: number;
  title: string;
  publishTime: string;
  views: number;
  interactionRate: number;
  aiScore: number;
  reasons: string[];
  suggestions: string[];
};

type HotLink = {
  feedback_id: number;
  post_id: number;
  post_title: string;
  topic_name: string;
  recommended_at: string;
  effectiveness: "有效" | "无效" | "待评估";
  effect_score: number | null;
  ai_summary: string | null;
};

type ContentMonitoringData = {
  platform: "douyin" | "kuaishou" | "weibo";
  range: { from: string; to: string; label: string };
  summary: {
    todayPublished: number;
    periodPublished: number;
    views: number;
    likes: number;
    comments: number;
    favorites: number;
    shares: number;
    interactions: number;
    capturedComments: number;
    interactionRate: number;
    paidViews: number;
    organicViews: number;
  };
  topPosts: TopPost[];
  effectEvaluationSummary: null | {
    participating: number;
    insufficient: number;
    paid: number;
    naturalBreakouts: number;
    paidAmplified: number;
    gradeCounts: Record<"S" | "A" | "B" | "C" | "D", number>;
  };
  breakoutAnalysis: BreakoutItem[];
  lowEfficiency: LowEfficiencyItem[];
  hotLinks: HotLink[];
  sourceFreshness: { latestPost: string | null; capturedCommentCount: number };
  sources: string[];
  engine: string;
  updatedAt: string;
};

type MonitoringPlatform = ContentMonitoringData["platform"];
type RankingMode = "overall" | "natural" | "interaction" | "completion" | "followers" | "paid";

const supportedPlatforms = new Set<MonitoringPlatform>(["douyin", "kuaishou", "weibo"]);

function subscribePlatform(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("platform-navigation", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("platform-navigation", callback);
  };
}

function platformSnapshot(): MonitoringPlatform {
  const value = new URLSearchParams(window.location.search).get("platform") as MonitoringPlatform | null;
  return value && supportedPlatforms.has(value) ? value : "douyin";
}

const metricCards = [
  { key: "todayPublished", label: "今日发布", note: "北京时间今日" },
  { key: "views", label: "播放量", note: "筛选周期累计" },
  { key: "likes", label: "点赞", note: "筛选周期累计" },
  { key: "comments", label: "评论", note: "作品显示评论数" },
  { key: "favorites", label: "收藏", note: "筛选周期累计" },
  { key: "shares", label: "分享", note: "筛选周期累计" },
] as const;

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span>暂无上次快照</span>;
  return <b className={value < 0 ? "snapshot-delta negative" : value > 0 ? "snapshot-delta positive" : "snapshot-delta"}>{value > 0 ? "+" : ""}{formatCompact(value)}</b>;
}

export default function ContentMonitoringPage() {
  const range = useGlobalDateRange();
  const platform = useSyncExternalStore(subscribePlatform, platformSnapshot, () => "douyin");
  const currentPlatformLabel = platformLabel(platform);
  const [data, setData] = useState<ContentMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rankingMode, setRankingMode] = useState<RankingMode>("overall");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(dateRangeQuery(range));
      query.set("platform", platform);
      const response = await fetch(`/api/content-monitoring?${query.toString()}`);
      if (!response.ok) throw new Error("内容监测数据读取失败");
      setData(await response.json() as ContentMonitoringData);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "内容监测数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [platform, range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading && !data) return <div className="loading-panel"><span className="loading-dot" />正在读取{currentPlatformLabel}作品监测数据…</div>;
  if (error || !data) return <div className="error-panel">{error || "暂无内容监测数据"}</div>;

  const rankingModes: Array<{ id: RankingMode; label: string }> = [
    { id: "overall", label: "综合表现" },
    { id: "natural", label: "自然传播" },
    { id: "interaction", label: "互动质量" },
    { id: "completion", label: "完播表现" },
    { id: "followers", label: "涨粉能力" },
    { id: "paid", label: "DOU+作品" },
  ];
  const rankingValue = (post: TopPost) => {
    const evaluation = post.effectEvaluation;
    if (!evaluation) return -1;
    if (rankingMode === "natural") return evaluation.rankingSignals.naturalPropagation ?? -1;
    if (rankingMode === "interaction") return evaluation.rankingSignals.interactionQuality ?? -1;
    if (rankingMode === "completion") return evaluation.rankingSignals.completionPerformance ?? -1;
    if (rankingMode === "followers") return evaluation.rankingSignals.followerGrowth ?? -1;
    return evaluation.overallScore ?? -1;
  };
  const rankedPosts = data.topPosts.filter((post) => rankingMode !== "paid" || post.has_paid_traffic === 1)
    .sort((a, b) => rankingValue(b) - rankingValue(a) || (b.organic_views ?? -1) - (a.organic_views ?? -1));

  return <div className={`page-stack content-monitor-v1 platform-themed-page theme-${platform}`}>
    <header className="page-heading compact-heading">
      <div>
        <p className="eyebrow">CONTENT MONITORING CENTER · V1.0</p>
        <h1>{currentPlatformLabel}内容监测中心</h1>
        <p>围绕作品表现、爆款结构、低效原因和热点转化，形成每日可执行的内容优化闭环。</p>
      </div>
      <span className="current-platform-badge" aria-live="polite"><i />当前平台：{currentPlatformLabel}</span>
    </header>

    <section className="content-monitor-scope" aria-label="监测范围">
      <div><span>监测平台</span><strong>{currentPlatformLabel}</strong><small>左侧平台入口切换</small></div>
      <div><span>数据周期</span><strong>{data.range.label}</strong><small>{data.range.from} — {data.range.to}</small></div>
      <div><span>周期发布</span><strong>{data.summary.periodPublished} 条</strong><small>来源 social_posts</small></div>
      <div><span>评论样本</span><strong>{data.summary.capturedComments} 条</strong><small>来源 social_comments</small></div>
    </section>

    <section className="content-monitor-kpis" aria-label="作品监测驾驶舱">
      {metricCards.map((item) => <article key={item.key}>
        <span>{item.label}</span>
        <strong>{formatCompact(data.summary[item.key])}</strong>
        <small>{item.note}</small>
      </article>)}
      <article className="interaction-kpi">
        <span>互动率</span>
        <strong>{data.summary.interactionRate}%</strong>
        <small>（点赞+评论+收藏+分享）÷ 播放</small>
      </article>
    </section>

    <section className="panel content-ranking-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">CONTENT EFFECT · V1.0</span><h2>内容效果排行榜</h2></div>
        <span className="section-note">默认按综合效果评分；私密作品不参与排名</span>
      </div>
      {data.effectEvaluationSummary && <div className="effect-summary-strip">
        <div><span>参与评价</span><strong>{data.effectEvaluationSummary.participating}</strong></div>
        <div><span>数据不足</span><strong>{data.effectEvaluationSummary.insufficient}</strong></div>
        <div><span>含DOU+</span><strong>{data.effectEvaluationSummary.paid}</strong></div>
        <div><span>自然爆款</span><strong>{data.effectEvaluationSummary.naturalBreakouts}</strong></div>
        <div><span>投流放大型</span><strong>{data.effectEvaluationSummary.paidAmplified}</strong></div>
      </div>}
      <div className="effect-ranking-tabs" role="group" aria-label="内容效果排序方式">
        {rankingModes.map((mode) => <button className={rankingMode === mode.id ? "active" : ""} key={mode.id} onClick={() => setRankingMode(mode.id)}>{mode.label}</button>)}
      </div>
      {data.topPosts[0]?.effectEvaluation?.historicalBaseline.message && <p className="data-quality-notice">{data.topPosts[0].effectEvaluation.historicalBaseline.message}</p>}
      <div className="table-wrap">
        <table className="content-table content-monitor-ranking">
          <thead><tr><th>排名</th><th>标题</th><th>综合评价</th><th>传播力</th><th>互动质量</th><th>用户吸引</th><th>内容效率</th><th>可信度</th><th>操作</th></tr></thead>
          <tbody>
            {rankedPosts.map((post, index) => <tr key={post.id}>
              <td><span className={`rank-chip rank-${index + 1}`}>TOP {index + 1}</span></td>
              <td><strong>{post.title}</strong><div className="effect-label-row">{post.effectEvaluation?.labels.map((label) => <span className={`effect-label label-${label === "含付费流量" ? "paid" : label === "数据不足" ? "insufficient" : "result"}`} key={label}>{label}</span>)}</div><small className="table-subline">{formatDate(post.publish_time)} · 自然证据 {post.effectEvaluation?.naturalEvidenceViews === null ? "口径待确认" : formatCompact(post.effectEvaluation?.naturalEvidenceViews ?? 0)}</small><small className="table-subline snapshot-delta-line">较上次采集：播放 <Delta value={post.play_delta} /> · 点赞 <Delta value={post.like_delta} /> · 评论 <Delta value={post.comment_delta} /> · 收藏 <Delta value={post.favorite_delta} /> · 分享 <Delta value={post.share_delta} /></small></td>
              <td><span className={`effect-grade grade-${post.effectEvaluation?.grade ?? "none"}`}>{post.effectEvaluation?.grade ?? "—"}</span><strong className="effect-score">{post.effectEvaluation?.overallScore ?? "—"}分</strong><small className="table-subline">{post.effectEvaluation?.gradeLabel ?? "待评价"}</small></td>
              <td>{post.effectEvaluation?.dimensions.propagation.score ?? "—"}<small className="table-subline">/30</small></td>
              <td>{post.effectEvaluation?.dimensions.interaction.score ?? "—"}<small className="table-subline">/25</small></td>
              <td>{post.effectEvaluation?.dimensions.attraction.score ?? "—"}<small className="table-subline">/25</small></td>
              <td>{post.effectEvaluation?.dimensions.efficiency.score ?? "—"}<small className="table-subline">/20</small></td>
              <td><span className={`confidence-badge confidence-${post.effectEvaluation?.dataConfidence ?? "low"}`}>{post.effectEvaluation?.dataConfidence ?? "low"}</span><small className="table-subline">数据完整度 {post.effectEvaluation?.dataCompleteness ?? 0}%</small></td>
              <td><a className="content-analysis-link" href={`/insights/content/detail?id=${post.id}`}>数据分析</a></td>
            </tr>)}
            {!rankedPosts.length && <tr><td className="empty-cell" colSpan={9}>{rankingMode === "paid" ? "筛选周期内没有DOU+作品" : `筛选周期内暂无${currentPlatformLabel}作品`}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className="panel breakout-analysis-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">BREAKOUT ANALYSIS</span><h2>爆款分析</h2></div>
        <span className="section-note">规则模型分析周期内领先作品，不虚构平台指标</span>
      </div>
      <div className="breakout-analysis-grid">
        {data.breakoutAnalysis.map((item, index) => <article key={item.postId}>
          <div className="breakout-card-head"><span>潜力作品 {String(index + 1).padStart(2, "0")}</span><b>{item.aiScore}分</b></div>
          <h3>{item.title}</h3>
          <dl>
            <div><dt>爆款原因</dt><dd>{item.reason}</dd></div>
            <div><dt>内容结构</dt><dd>{item.structure}</dd></div>
            <div><dt>标题特点</dt><dd>{item.titleFeature}</dd></div>
            <div><dt>拍摄方式</dt><dd>{item.shootingMethod}</dd></div>
          </dl>
          <p>{item.commentSignal} · 播放 {formatCompact(item.views)}</p>
        </article>)}
        {!data.breakoutAnalysis.length && <div className="empty-monitor-state">暂无可分析作品，采集{currentPlatformLabel}作品后将自动生成爆款结构分析。</div>}
      </div>
    </section>

    <section className="panel low-efficiency-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">LOW PERFORMANCE DIAGNOSIS</span><h2>低效作品诊断</h2></div>
        <span className="section-note">播放、互动率和 AI 评分联合识别</span>
      </div>
      <div className="low-efficiency-list">
        {data.lowEfficiency.map((item) => <article key={item.postId}>
          <div className="low-post-summary">
            <span>{formatDate(item.publishTime)}</span>
            <h3>{item.title}</h3>
            <p>播放 {formatCompact(item.views)} · 互动率 {item.interactionRate}% · AI {item.aiScore}分</p>
          </div>
          <div><span>播放低原因</span><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
          <div><span>优化建议</span><ul>{item.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></div>
        </article>)}
        {!data.lowEfficiency.length && <div className="empty-monitor-state">当前周期没有达到低效判定条件的作品。</div>}
      </div>
    </section>

    <section className="panel content-hot-link-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">HOT TOPIC ATTRIBUTION</span><h2>热点关联</h2></div>
        <span className="section-note">关联 hot_topic_feedback 效果复盘</span>
      </div>
      <div className="table-wrap">
        <table className="content-table content-hot-link-table">
          <thead><tr><th>作品</th><th>来源热点</th><th>推荐时间</th><th>效果评分</th><th>推荐是否有效</th><th>AI复盘</th></tr></thead>
          <tbody>
            {data.hotLinks.map((link) => <tr key={link.feedback_id}>
              <td><strong>{link.post_title}</strong></td>
              <td>{link.topic_name}</td>
              <td className="date-cell">{formatDate(link.recommended_at)}</td>
              <td>{link.effect_score === null ? "待评估" : `${Math.round(link.effect_score)}分`}</td>
              <td><span className={`effectiveness-badge effectiveness-${link.effectiveness === "有效" ? "yes" : link.effectiveness === "无效" ? "no" : "pending"}`}>{link.effectiveness}</span></td>
              <td>{link.ai_summary || "关联作品后等待效果复盘"}</td>
            </tr>)}
            {!data.hotLinks.length && <tr><td className="empty-cell" colSpan={6}>当前周期作品尚未关联热点推荐</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <p className="analysis-disclaimer">
      数据来源：{data.sources.join("、")} · 规则模型：{data.engine} · 更新时间：{formatDate(data.updatedAt)} · 未采集数据不会生成模拟值。
    </p>
  </div>;
}
