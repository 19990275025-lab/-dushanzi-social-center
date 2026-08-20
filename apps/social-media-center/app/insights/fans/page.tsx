"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";
import { dateRangeQuery, type DateRange } from "@/lib/date-range";
import { CustomDateRange, MonthPicker, useGlobalDateRange } from "@/components/GlobalDateFilter";
import { downloadFanReportPng, type FanReportExportData } from "@/lib/fan-report-export";

const platforms = ["all", "douyin", "kuaishou", "weibo"];
const trendOptions = [{ value: "7d", label: "7天" }, { value: "30d", label: "30天" }, { value: "month", label: "自然月" }, { value: "custom", label: "自定义" }] as const;
type TrendPeriod = typeof trendOptions[number]["value"];
type Distribution = { label: string; value: number };
type DistributionChange = Distribution & { previousValue: number; delta: number };
type Trend = { record_date: string; fans_count: number; net_growth: number; new_fans: number; lost_fans: number; source_type: string };
type Strategy = { positioning: string; actions: string[] };
type Profile = {
  id: number; fansCount: number; gender: Distribution[]; ages: Distribution[]; regions: Distribution[];
  interests: Distribution[]; devices: Distribution[]; activityLevels: Distribution[]; activeTimes: Distribution[];
  followKeywords: Distribution[]; unavailableFields: string[]; sourceType: string; collectedAt: string;
  snapshotDate: string | null; displayFansCount: string | null;
};
type ProfileComparison = { currentDate: string; previousDate: string; gender: DistributionChange[]; ages: DistributionChange[]; regions: DistributionChange[]; interests: DistributionChange[]; activeTimes: DistributionChange[] };
type FanPlatform = {
  platform: string; fansCount: number | null; netGrowth: number | null; newFans: number | null; lostFans: number | null;
  returningFans: number | null; growthRate: number | null; metricsAvailable: boolean; metricsUnavailableReason: string | null;
  trend: Trend[]; trendSource: string; strategy: Strategy; profile: Profile | null; previousProfile: Profile | null;
  profileHistory: Profile[]; profileComparison: ProfileComparison | null;
};
type AttractionPost = { id: number; title: string; content_type: string; publish_time: string; views: number; likes: number; comments: number; favorites: number; shares: number; fans_growth: number; day_net_growth: number | null; interaction_rate: number };
type WeeklyReport = {
  growthSummary: string; profileSummary: string; growthReason: string; lossReason: string;
  bestPost: null | { id: number; title: string; fansGrowth: number; views: number };
  easiestContent: string; nextWeekSuggestions: string[]; profileSnapshotDate: string | null; previousProfileSnapshotDate: string | null;
};
type FanData = {
  platforms: FanPlatform[]; trendPeriod: string; trendRange: { from: string; to: string };
  contentAttraction: { platform: string; posts: AttractionPost[]; contentTypes: Array<{ contentType: string; label: string; posts: number; fansGrowth: number; views: number; averageFansGrowth: number }>; bestPost: AttractionPost | null; bestType: null | { label: string; fansGrowth: number; averageFansGrowth: number }; attributionNote: string };
  weeklyReport: WeeklyReport; sources: string[]; collectionApi: string; updatedAt: string;
};

function ProfileBlock({ title, items, emptyMessage = "平台暂未提供该维度数据" }: { title: string; items: Distribution[]; emptyMessage?: string }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <article className="fan-profile-card"><h3>{title}</h3>{items.length ? <div className="profile-bars">{items.slice(0, 8).map((item) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${(item.value / max) * 100}%` }} /></i><strong>{item.value}%</strong></div>)}</div> : <p className="profile-empty">{emptyMessage}</p>}</article>;
}

function KeywordBlock({ items }: { items: Distribution[] }) {
  return <article className="fan-profile-card fan-keyword-card"><h3>粉丝关注热词</h3>{items.length
    ? <div className="fan-keyword-list">{items.slice(0, 20).map((item, index) => <span key={item.label}><b>{index + 1}</b>{item.label}<em>{item.value}</em></span>)}</div>
    : <p className="profile-empty">平台暂未提供该维度数据</p>}</article>;
}

function ProfileComparisonCard({ title, items, hasPrevious }: { title: string; items: DistributionChange[]; hasPrevious: boolean }) {
  return <article className="profile-comparison-card"><h3>{title}</h3>{items.length ? <div>{items.slice(0, 6).map((item) => <p key={item.label}><span>{item.label}</span><strong>{item.value}%</strong>{hasPrevious ? <em className={item.delta > 0 ? "delta-up" : item.delta < 0 ? "delta-down" : "delta-flat"}>{item.delta > 0 ? "+" : ""}{item.delta}pp</em> : <em>首次快照</em>}</p>)}</div> : <p className="profile-empty">暂无该维度数据</p>}</article>;
}

function GrowthLineChart({ trend }: { trend: Trend[] }) {
  if (trend.length < 2) return <div className="fan-empty-state"><strong>增长数据点不足</strong><p>至少需要两个日期的 fan_growth_records，才能绘制诚实的变化趋势。</p></div>;
  const width = 960; const height = 300; const left = 56; const right = 22; const top = 30; const bottom = 54;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const maximum = Math.max(...trend.flatMap((item) => [item.new_fans, item.lost_fans]), 1);
  const points = (key: "new_fans" | "lost_fans") => trend.map((item, index) => {
    const x = left + index / (trend.length - 1) * chartWidth;
    const y = top + chartHeight - item[key] / maximum * chartHeight;
    return { x, y, value: item[key], date: item.record_date };
  });
  const newPoints = points("new_fans"); const lostPoints = points("lost_fans");
  return <div className="fan-growth-line-wrap">
    <div className="fan-line-legend"><span><i className="line-new" />新增粉丝</span><span><i className="line-lost" />流失粉丝</span></div>
    <svg className="fan-growth-line-chart" role="img" aria-label="抖音每日新增粉丝与流失粉丝折线趋势" viewBox={`0 0 ${width} ${height}`}>
      {[0, 1, 2, 3].map((index) => { const y = top + index * chartHeight / 3; const value = Math.round(maximum * (1 - index / 3)); return <g key={index}><line x1={left} x2={width - right} y1={y} y2={y} /><text x={left - 12} y={y + 5} textAnchor="end">{value}</text></g>; })}
      <polyline className="new-fans-line" points={newPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
      <polyline className="lost-fans-line" points={lostPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
      {newPoints.map((point, index) => <g key={`new-${point.date}`}><circle className="new-fans-dot" cx={point.x} cy={point.y} r="4" /><title>{point.date} 新增 {point.value}</title>{(index === 0 || index === newPoints.length - 1 || trend.length <= 8) && <text className="date-label" x={point.x} y={height - 20} textAnchor="middle">{point.date.slice(5)}</text>}</g>)}
      {lostPoints.map((point) => <circle className="lost-fans-dot" cx={point.x} cy={point.y} r="4" key={`lost-${point.date}`}><title>{point.date} 流失 {point.value}</title></circle>)}
    </svg>
  </div>;
}

function aggregatePlatforms(items: FanPlatform[]): FanPlatform {
  const trendMap = new Map<string, Trend>();
  for (const item of items) for (const point of item.trend) {
    const current = trendMap.get(point.record_date) ?? { record_date: point.record_date, fans_count: 0, net_growth: 0, new_fans: 0, lost_fans: 0, source_type: "platform_aggregate" };
    current.fans_count += point.fans_count; current.net_growth += point.net_growth; current.new_fans += point.new_fans; current.lost_fans += point.lost_fans;
    trendMap.set(point.record_date, current);
  }
  const trend = [...trendMap.values()].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const profileItems = items.filter((item) => item.fansCount !== null);
  const metricItems = items.filter((item) => item.metricsAvailable);
  const fansCount = profileItems.length ? profileItems.reduce((sum, item) => sum + Number(item.fansCount), 0) : null;
  const netGrowth = metricItems.length ? metricItems.reduce((sum, item) => sum + Number(item.netGrowth), 0) : null;
  const newFans = metricItems.length ? metricItems.reduce((sum, item) => sum + Number(item.newFans), 0) : null;
  const lostFans = metricItems.length ? metricItems.reduce((sum, item) => sum + Number(item.lostFans), 0) : null;
  const returningFans = metricItems.length ? metricItems.reduce((sum, item) => sum + Number(item.returningFans), 0) : null;
  const baseFans = fansCount !== null && netGrowth !== null ? fansCount - netGrowth : null;
  return { platform: "all", fansCount, netGrowth, newFans, lostFans, returningFans,
    growthRate: baseFans !== null && baseFans > 0 && netGrowth !== null ? Number((netGrowth / baseFans * 100).toFixed(2)) : null,
    metricsAvailable: metricItems.length > 0, metricsUnavailableReason: metricItems.length ? null : "平台暂未提供该统计周期数据",
    trend, trendSource: trend.length ? "已入库平台每日增长记录汇总" : "unavailable", strategy: { positioning: "分平台制定运营策略", actions: ["选择具体平台查看定位建议"] }, profile: null, previousProfile: null, profileHistory: [], profileComparison: null };
}

export default function FanAnalysisCenterPage() {
  const range = useGlobalDateRange();
  const [data, setData] = useState<FanData | null>(null);
  const [selected, setSelected] = useState("douyin");
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("7d");
  const [trendRange, setTrendRange] = useState<DateRange | null>(null);
  const [openTrendPicker, setOpenTrendPicker] = useState<"month" | "custom" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const activeTrendRange = trendRange ?? range;

  useEffect(() => {
    fetch(`/api/insights/fans?${dateRangeQuery(activeTrendRange)}&trend=${trendPeriod}`).then(async (response) => {
      if (!response.ok) throw new Error("粉丝分析数据读取失败");
      return response.json() as Promise<FanData>;
    }).then((result) => { setData(result); setError(""); }).catch((reason: Error) => setError(reason.message));
  }, [activeTrendRange, trendPeriod]);

  useEffect(() => {
    if (!openTrendPicker) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenTrendPicker(null); };
    window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openTrendPicker]);

  function selectTrendPeriod(period: TrendPeriod) {
    if (period === "month" || period === "custom") { setOpenTrendPicker((current) => current === period ? null : period); return; }
    setTrendPeriod(period); setTrendRange(null); setOpenTrendPicker(null);
  }

  function applyTrendRange(nextRange: DateRange) {
    setTrendPeriod(nextRange.preset === "month" ? "month" : "custom"); setTrendRange(nextRange); setOpenTrendPicker(null);
  }

  const platformData = useMemo(() => data ? [aggregatePlatforms(data.platforms), ...data.platforms] : [], [data]);
  const current = platformData.find((item) => item.platform === selected) ?? null;
  const currentPlatformLabel = selected === "all" ? "全部平台" : platformLabel(selected);

  if (error) return <div className="error-panel">{error}</div>;
  if (!data || !current) return <div className="loading-panel"><span className="loading-dot" />正在读取粉丝资产…</div>;

  const isDouyin = selected === "douyin";
  const profile = current.profile;
  const comparison = current.profileComparison;
  const report = data.weeklyReport;
  const exportData: FanReportExportData = {
    period: `${data.trendRange.from} 至 ${data.trendRange.to}`,
    fansCount: current.fansCount ?? 0, newFans: current.newFans ?? 0, lostFans: current.lostFans ?? 0, growthRate: current.growthRate ?? 0,
    trend: current.trend, growthSummary: report.growthSummary, profileSummary: report.profileSummary,
    growthReason: report.growthReason, lossReason: report.lossReason, easiestContent: report.easiestContent,
    bestPost: report.bestPost ? { title: report.bestPost.title, fansGrowth: report.bestPost.fansGrowth, views: report.bestPost.views } : null,
    suggestions: report.nextWeekSuggestions,
    sourceNote: `数据来源：social_fans、fan_growth_records、social_posts · 更新时间：${formatDate(data.updatedAt)}`,
  };

  async function exportPng() {
    if (!isDouyin || !current.metricsAvailable) return;
    try { setExporting(true); await downloadFanReportPng(exportData); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "PNG导出失败"); }
    finally { setExporting(false); }
  }

  function exportPdf() {
    if (!isDouyin || !current.metricsAvailable) return;
    document.body.classList.add("printing-fan-report");
    const cleanup = () => document.body.classList.remove("printing-fan-report");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1500);
  }

  return <div className={`page-stack fan-analysis-center-page fan-insights-page platform-themed-page theme-${selected}`}>
    <header className="page-heading compact-heading fan-v2-heading">
      <div><p className="eyebrow">FAN ANALYSIS CENTER · V2.0</p><h1>{selected === "all" ? "粉丝分析中心" : `${currentPlatformLabel}粉丝分析`}</h1><p>监测粉丝增长、画像变化与作品吸粉效果，形成可执行的下周运营策略。</p></div>
      <div className="fan-v2-heading-actions"><span className="current-platform-badge" aria-live="polite"><i />当前平台：{currentPlatformLabel}</span>{isDouyin && <div className="fan-export-actions"><button onClick={exportPdf} disabled={!current.metricsAvailable} title="在打印窗口中选择另存为PDF">导出PDF</button><button onClick={() => void exportPng()} disabled={exporting || !current.metricsAvailable}>{exporting ? "生成中…" : "导出PNG"}</button></div>}</div>
    </header>

    <section className="fan-platform-grid">
      {platformData.map((item) => <button aria-pressed={selected === item.platform} className={`fan-platform-card platform-${item.platform} ${selected === item.platform ? "active" : ""}`} key={item.platform} onClick={() => setSelected(item.platform)}><div><span>{item.platform === "all" ? "全部平台" : platformLabel(item.platform)}</span><small>{selected === item.platform ? "当前平台" : item.profile ? "真实快照" : "平台暂未提供数据"}</small></div><strong>{item.fansCount === null ? "—" : formatCompact(item.fansCount)}<em>粉丝</em></strong><p className={item.netGrowth === null ? "" : item.netGrowth >= 0 ? "growth-up" : "growth-down"}>{item.netGrowth === null ? "平台暂未提供该周期数据" : `${item.netGrowth >= 0 ? "+" : ""}${formatCompact(item.netGrowth)} 净增长`}</p></button>)}
    </section>

    <nav className="insight-platform-tabs fan-tabs" aria-label="粉丝分析平台筛选">{platforms.map((item) => <button aria-pressed={selected === item} className={`${selected === item ? "active" : ""} platform-tab-${item}`} key={item} onClick={() => setSelected(item)}>{item === "all" ? "全部平台" : platformLabel(item)}</button>)}</nav>

    <section className="fan-summary-grid fan-overview-grid fan-v2-summary">
      <article><span>当前粉丝</span><strong>{current.fansCount === null ? "—" : formatCompact(current.fansCount)}</strong><small>{profile ? "最新真实快照" : "平台暂未提供该维度数据"}</small></article>
      <article><span>新增粉丝</span><strong>{current.newFans === null ? "—" : `+${formatCompact(current.newFans)}`}</strong><small>{current.metricsAvailable ? `${data.trendRange.from} 至 ${data.trendRange.to}` : current.metricsUnavailableReason}</small></article>
      <article><span>流失粉丝</span><strong>{current.lostFans === null ? "—" : formatCompact(current.lostFans)}</strong><small>{current.metricsAvailable ? "fan_growth_records" : current.metricsUnavailableReason}</small></article>
      <article><span>增长率</span><strong>{current.growthRate === null ? "—" : `${current.growthRate}%`}</strong><small>{current.metricsAvailable ? "净增长 / 期初粉丝" : current.metricsUnavailableReason}</small></article>
    </section>

    <section className="panel fan-trend-panel fan-v2-trend-panel">
      <div className="panel-heading"><div><span className="section-kicker">GROWTH ANALYSIS</span><h2>粉丝增长分析</h2></div><div className="fan-trend-controls"><div className="trend-period-switch">{trendOptions.map((item) => <button aria-expanded={item.value === "month" || item.value === "custom" ? openTrendPicker === item.value : undefined} className={trendPeriod === item.value || openTrendPicker === item.value ? "active" : ""} key={item.value} onClick={() => selectTrendPeriod(item.value)}>{item.label}</button>)}</div>{openTrendPicker === "month" && <MonthPicker range={activeTrendRange} onClose={() => setOpenTrendPicker(null)} onSelect={applyTrendRange} />}{openTrendPicker === "custom" && <CustomDateRange key={`${activeTrendRange.from}-${activeTrendRange.to}`} range={activeTrendRange} onApply={applyTrendRange} onClose={() => setOpenTrendPicker(null)} />}</div></div>
      <GrowthLineChart trend={current.trend} />
      <small className="chart-source">来源：{current.trendSource} · {data.trendRange.from} — {data.trendRange.to} · 折线展示每日新增与流失，不以条形图替代连续趋势</small>
    </section>

    <section><div className="section-title"><div><span className="section-kicker">AUDIENCE PROFILE</span><h2>粉丝画像分析</h2></div><span className="section-note">最新快照 · 年龄、性别、地域、兴趣、活跃时间</span></div><div className="fan-profile-grid">
      <ProfileBlock title="年龄" items={profile?.ages ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="性别" items={profile?.gender ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="地域" items={profile?.regions ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="兴趣标签" items={profile?.interests ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="设备" items={profile?.devices ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="活跃度" items={profile?.activityLevels ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="活跃时间" items={profile?.activeTimes ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : "平台暂未提供该维度数据"} />
      <KeywordBlock items={profile?.followKeywords ?? []} />
    </div></section>

    {isDouyin ? <>
      <section className="panel profile-history-panel">
        <div className="panel-heading"><div><span className="section-kicker">PROFILE HISTORY</span><h2>画像历史对比</h2></div><span className="section-note">{comparison ? `${formatDate(comparison.previousDate)} 对比 ${formatDate(comparison.currentDate)}` : "需要至少两次画像快照"}</span></div>
        <div className="profile-comparison-grid">
          <ProfileComparisonCard title="年龄变化" items={comparison?.ages ?? profile?.ages.map((item) => ({ ...item, previousValue: 0, delta: 0 })) ?? []} hasPrevious={Boolean(comparison)} />
          <ProfileComparisonCard title="地域变化" items={comparison?.regions ?? profile?.regions.map((item) => ({ ...item, previousValue: 0, delta: 0 })) ?? []} hasPrevious={Boolean(comparison)} />
          <ProfileComparisonCard title="兴趣变化" items={comparison?.interests ?? profile?.interests.map((item) => ({ ...item, previousValue: 0, delta: 0 })) ?? []} hasPrevious={Boolean(comparison)} />
          <ProfileComparisonCard title="活跃时间变化" items={comparison?.activeTimes ?? profile?.activeTimes.map((item) => ({ ...item, previousValue: 0, delta: 0 })) ?? []} hasPrevious={Boolean(comparison)} />
        </div>
      </section>

      <section className="panel content-fan-attribution-panel">
        <div className="panel-heading"><div><span className="section-kicker">CONTENT ACQUISITION</span><h2>内容吸粉分析</h2></div><span className="section-note">抖音 · {data.contentAttraction.posts.length} 条作品</span></div>
        <div className="content-fan-summary"><article><span>最易涨粉内容</span><strong>{data.contentAttraction.bestType?.label ?? "待积累数据"}</strong><small>{report.easiestContent}</small></article><article><span>最佳涨粉作品</span><strong>{report.bestPost ? `+${report.bestPost.fansGrowth}` : "暂无"}</strong><small>{report.bestPost?.title ?? "等待作品 fans_growth 数据"}</small></article></div>
        <div className="content-fan-table-wrap"><table className="content-fan-table"><thead><tr><th>作品</th><th>发布时间</th><th>播放</th><th>作品涨粉</th><th>同日净增长</th><th>互动率</th></tr></thead><tbody>{data.contentAttraction.posts.slice(0, 10).map((post) => <tr key={post.id}><td><a href={`/insights/content/detail?id=${post.id}`}>{post.title}</a><small>{post.content_type}</small></td><td>{formatDate(post.publish_time)}</td><td>{formatCompact(post.views)}</td><td className={post.fans_growth > 0 ? "growth-up" : post.fans_growth < 0 ? "growth-down" : ""}>{post.fans_growth > 0 ? "+" : ""}{post.fans_growth}</td><td>{post.day_net_growth === null ? "—" : `${post.day_net_growth >= 0 ? "+" : ""}${post.day_net_growth}`}</td><td>{post.interaction_rate}%</td></tr>)}{!data.contentAttraction.posts.length && <tr><td colSpan={6}>当前周期暂无已入库抖音作品。</td></tr>}</tbody></table></div>
        <p className="fan-attribution-note">{data.contentAttraction.attributionNote}</p>
      </section>

      <section className="panel weekly-fan-report fan-v2-weekly-report">
        <div className="panel-heading light-heading"><div><span className="section-kicker">AI WEEKLY REPORT</span><h2>AI 粉丝运营周报</h2></div><div className="fan-export-actions"><button onClick={exportPdf} disabled={!current.metricsAvailable}>导出PDF</button><button onClick={() => void exportPng()} disabled={exporting || !current.metricsAvailable}>{exporting ? "生成中…" : "导出PNG"}</button></div></div>
        <div className="weekly-report-grid fan-v2-report-grid"><article><span>本周粉丝分析</span><p>{report.growthSummary}</p></article><article><span>画像变化</span><p>{report.profileSummary}</p></article><article><span>增长原因</span><p>{report.growthReason}</p></article><article><span>流失原因</span><p>{report.lossReason}</p></article><article><span>最佳作品</span><p>{report.bestPost ? `“${report.bestPost.title}”带来 ${report.bestPost.fansGrowth} 名涨粉。` : "暂无可归因作品。"}</p></article><article className="fan-next-week-card"><span>下周内容建议</span><ol>{report.nextWeekSuggestions.map((item) => <li key={item}>{item}</li>)}</ol></article></div>
        <p className="fan-report-source">规则模型 V2.0 · 画像快照：{report.profileSnapshotDate ? formatDate(report.profileSnapshotDate) : "暂无"} · 数据缺失不生成模拟值</p>
      </section>
    </> : <section className="panel fan-v2-platform-note"><span>V2.0 SCOPE</span><h2>深度分析当前优先支持抖音</h2><p>快手和微博继续保留原有粉丝总览、趋势与画像展示，本阶段不新增内容吸粉归因、AI周报或导出能力。</p></section>}

    <section className="fan-report-print-sheet" aria-hidden="true">
      <header><span>FAN OPERATIONS WEEKLY REPORT · V2.0</span><h1>抖音粉丝运营周报</h1><p>{data.trendRange.from} 至 {data.trendRange.to}</p></header>
      <div className="print-metrics"><article>当前粉丝<strong>{current.fansCount === null ? "—" : formatCompact(current.fansCount)}</strong></article><article>新增粉丝<strong>{current.newFans === null ? "—" : `+${formatCompact(current.newFans)}`}</strong></article><article>流失粉丝<strong>{current.lostFans === null ? "—" : formatCompact(current.lostFans)}</strong></article><article>增长率<strong>{current.growthRate === null ? "—" : `${current.growthRate}%`}</strong></article></div>
      <section><h2>粉丝增长趋势</h2><GrowthLineChart trend={current.trend} /></section>
      <section className="print-insights"><article><h3>本周粉丝分析</h3><p>{report.growthSummary}</p></article><article><h3>画像变化</h3><p>{report.profileSummary}</p></article><article><h3>增长原因</h3><p>{report.growthReason}</p></article><article><h3>流失原因</h3><p>{report.lossReason}</p></article></section>
      <section><h2>最佳作品</h2><p>{report.bestPost ? `“${report.bestPost.title}”带来 ${report.bestPost.fansGrowth} 名涨粉，播放 ${formatCompact(report.bestPost.views)}。` : "暂无可归因作品。"}</p></section>
      <section><h2>下周内容建议</h2><ol>{report.nextWeekSuggestions.map((item) => <li key={item}>{item}</li>)}</ol></section>
      <footer>数据来源：social_fans、fan_growth_records、social_posts · 生成时间：{formatDate(data.updatedAt)}</footer>
    </section>

    <section className="panel future-collection-note"><div><span>FAN DATA MODEL · V2.0</span><h2>真实粉丝数据分层存储</h2></div><p>账号快照写入 <code>social_fans</code>，周期增长写入 <code>fan_growth_records</code>，画像明细写入 <code>fan_profile_records</code>；缺失维度保持 unavailable。</p><small>接入路径：{data.collectionApi}</small></section>
    <p className="analysis-disclaimer">更新时间：{formatDate(data.updatedAt)} · 粉丝画像缺失时保持空状态，不生成模拟画像。</p>
  </div>;
}
