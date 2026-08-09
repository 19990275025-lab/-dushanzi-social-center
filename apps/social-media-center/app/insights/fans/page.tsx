"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";
import { dateRangeQuery, type DateRange } from "@/lib/date-range";
import { CustomDateRange, MonthPicker, useGlobalDateRange } from "@/components/GlobalDateFilter";

const platforms = ["all", "douyin", "kuaishou", "weibo"];
const trendOptions = [{ value: "7d", label: "7天" }, { value: "30d", label: "30天" }, { value: "month", label: "自然月" }, { value: "custom", label: "自定义" }] as const;
type TrendPeriod = typeof trendOptions[number]["value"];
type Distribution = { label: string; value: number };
type Trend = { record_date: string; fans_count: number; net_growth: number; new_fans: number; lost_fans: number; source_type: string };
type Strategy = { positioning: string; actions: string[] };
type FanPlatform = { platform: string; fansCount: number; netGrowth: number; newFans: number; growthRate: number; trend: Trend[]; trendSource: string; strategy: Strategy; profile: null | { gender: Distribution[]; ages: Distribution[]; regions: Distribution[]; interests: Distribution[]; activeTimes: Distribution[]; sourceType: string; collectedAt: string } };
type FanData = { platforms: FanPlatform[]; trendPeriod: string; trendRange: { from: string; to: string }; sources: string[]; collectionApi: string; updatedAt: string };

function ProfileBlock({ title, items, emptyMessage = "等待真实粉丝画像采集" }: { title: string; items: Distribution[]; emptyMessage?: string }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <article className="fan-profile-card"><h3>{title}</h3>{items.length ? <div className="profile-bars">{items.slice(0, 8).map((item) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${(item.value / max) * 100}%` }} /></i><strong>{item.value}%</strong></div>)}</div> : <p className="profile-empty">{emptyMessage}</p>}</article>;
}

function aggregatePlatforms(items: FanPlatform[]): FanPlatform {
  const trendMap = new Map<string, Trend>();
  for (const item of items) for (const point of item.trend) {
    const current = trendMap.get(point.record_date) ?? { record_date: point.record_date, fans_count: 0, net_growth: 0, new_fans: 0, lost_fans: 0, source_type: "platform_aggregate" };
    current.fans_count += point.fans_count; current.net_growth += point.net_growth; current.new_fans += point.new_fans; current.lost_fans += point.lost_fans;
    trendMap.set(point.record_date, current);
  }
  const trend = [...trendMap.values()].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const fansCount = items.reduce((sum, item) => sum + item.fansCount, 0);
  const netGrowth = items.reduce((sum, item) => sum + item.netGrowth, 0);
  return { platform: "all", fansCount, netGrowth, newFans: items.reduce((sum, item) => sum + item.newFans, 0), growthRate: fansCount - netGrowth > 0 ? Number(((netGrowth / (fansCount - netGrowth)) * 100).toFixed(2)) : 0, trend, trendSource: "三平台增长记录汇总", strategy: { positioning: "分平台制定运营策略", actions: ["选择具体平台查看定位建议"] }, profile: null };
}

export default function FanAnalysisCenterPage() {
  const range = useGlobalDateRange();
  const [data, setData] = useState<FanData | null>(null);
  const [selected, setSelected] = useState("all");
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("7d");
  const [trendRange, setTrendRange] = useState<DateRange | null>(null);
  const [openTrendPicker, setOpenTrendPicker] = useState<"month" | "custom" | null>(null);
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenTrendPicker(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openTrendPicker]);

  function selectTrendPeriod(period: TrendPeriod) {
    if (period === "month" || period === "custom") {
      setOpenTrendPicker((current) => current === period ? null : period);
      return;
    }
    setTrendPeriod(period);
    setTrendRange(null);
    setOpenTrendPicker(null);
  }

  function applyTrendRange(nextRange: DateRange) {
    setTrendPeriod(nextRange.preset === "month" ? "month" : "custom");
    setTrendRange(nextRange);
    setOpenTrendPicker(null);
  }

  const platformData = useMemo(() => data ? [aggregatePlatforms(data.platforms), ...data.platforms] : [], [data]);
  const current = platformData.find((item) => item.platform === selected) ?? null;
  const maxGrowth = useMemo(() => Math.max(...(current?.trend.map((item) => Math.abs(item.net_growth)) ?? [0]), 1), [current]);
  const currentPlatformLabel = selected === "all" ? "全部平台" : platformLabel(selected);

  if (error) return <div className="error-panel">{error}</div>;
  if (!data || !current) return <div className="loading-panel"><span className="loading-dot" />正在读取粉丝资产…</div>;

  const weeklyReport = {
    change: `${currentPlatformLabel}粉丝净增长 ${current.netGrowth >= 0 ? "+" : ""}${formatCompact(current.netGrowth)}，新增粉丝 ${formatCompact(current.newFans)}。`,
    issue: current.trend.length === 0 ? "当前周期缺少连续增长记录，暂不能判断增长稳定性。" : current.growthRate <= 0 ? "粉丝净增长未转正，需要复盘内容触达与取关原因。" : "粉丝保持增长，应继续验证增长来源是否可持续。",
    suggestion: selected === "all" ? "分别进入三个平台，按平台定位制定差异化运营动作。" : current.strategy.actions[0],
    nextWeek: selected === "all" ? "完成三平台粉丝画像和增长记录补采。" : `围绕“${current.strategy.positioning}”执行 1 个重点动作，并在下周复盘增长率。`,
  };

  return <div className={`page-stack fan-analysis-center-page fan-insights-page platform-themed-page theme-${selected}`}>
    <header className="page-heading compact-heading">
      <div><p className="eyebrow">FAN ANALYSIS CENTER · V1.0</p><h1>{selected === "all" ? "粉丝分析中心" : `${currentPlatformLabel}粉丝分析`}</h1><p>每周分析粉丝结构、增长变化与活跃特征，形成分平台运营策略。</p></div>
      <span className="current-platform-badge" aria-live="polite"><i />当前平台：{currentPlatformLabel}</span>
    </header>

    <section className="fan-platform-grid">
      {platformData.map((item) => <button aria-pressed={selected === item.platform} className={`fan-platform-card platform-${item.platform} ${selected === item.platform ? "active" : ""}`} key={item.platform} onClick={() => setSelected(item.platform)}><div><span>{item.platform === "all" ? "全部平台" : platformLabel(item.platform)}</span><small>{selected === item.platform ? "当前平台" : item.platform === "all" ? "三平台汇总" : item.profile ? "画像已采集" : "画像待采集"}</small></div><strong>{formatCompact(item.fansCount)}<em>粉丝</em></strong><p className={item.netGrowth >= 0 ? "growth-up" : "growth-down"}>{item.netGrowth >= 0 ? "+" : ""}{formatCompact(item.netGrowth)} 净增长</p></button>)}
    </section>

    <nav className="insight-platform-tabs fan-tabs" aria-label="粉丝分析平台筛选">{platforms.map((item) => <button aria-pressed={selected === item} className={`${selected === item ? "active" : ""} platform-tab-${item}`} key={item} onClick={() => setSelected(item)}>{item === "all" ? "全部平台" : platformLabel(item)}</button>)}</nav>

    <section className="fan-summary-grid fan-overview-grid">
      <article><span>粉丝数量</span><strong>{formatCompact(current.fansCount)}</strong><small>当前账号汇总</small></article>
      <article><span>新增粉丝</span><strong>+{formatCompact(current.newFans)}</strong><small>{data.trendRange.from} 至 {data.trendRange.to}</small></article>
      <article><span>增长率</span><strong>{current.growthRate}%</strong><small>净增长 / 期初粉丝</small></article>
      <article><span>画像状态</span><strong className="status-text">{selected === "all" ? "分平台查看" : current.profile ? "已采集" : "待采集"}</strong><small>social_fans</small></article>
    </section>

    <section className="panel fan-trend-panel">
      <div className="panel-heading"><div><span className="section-kicker">GROWTH TREND</span><h2>粉丝增长趋势</h2></div><div className="fan-trend-controls"><div className="trend-period-switch">{trendOptions.map((item) => <button aria-expanded={item.value === "month" || item.value === "custom" ? openTrendPicker === item.value : undefined} className={trendPeriod === item.value || openTrendPicker === item.value ? "active" : ""} key={item.value} onClick={() => selectTrendPeriod(item.value)}>{item.label}</button>)}</div>{openTrendPicker === "month" && <MonthPicker range={activeTrendRange} onClose={() => setOpenTrendPicker(null)} onSelect={applyTrendRange} />}{openTrendPicker === "custom" && <CustomDateRange key={`${activeTrendRange.from}-${activeTrendRange.to}`} range={activeTrendRange} onApply={applyTrendRange} onClose={() => setOpenTrendPicker(null)} />}</div></div>
      {current.trend.length ? <div className="growth-chart" aria-label="粉丝增长趋势图">{current.trend.map((item) => <div key={item.record_date}><span className={item.net_growth >= 0 ? "positive-bar" : "negative-bar"} style={{ height: `${Math.max(8, (Math.abs(item.net_growth) / maxGrowth) * 100)}%` }} /><strong>{item.net_growth >= 0 ? "+" : ""}{item.net_growth}</strong><small>{item.record_date.slice(5)}</small></div>)}</div> : <div className="fan-empty-state"><strong>暂无增长记录</strong><p>自动采集写入 fan_growth_records 后，此处将展示连续趋势。</p></div>}
      <small className="chart-source">来源：{current.trendSource} · {data.trendRange.from} — {data.trendRange.to}</small>
    </section>

    <section><div className="section-title"><div><span className="section-kicker">AUDIENCE PROFILE</span><h2>粉丝画像</h2></div><span className="section-note">地域、年龄、性别、兴趣与活跃时间</span></div><div className="fan-profile-grid">
      <ProfileBlock title="地域" items={current.profile?.regions ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="年龄" items={current.profile?.ages ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="性别" items={current.profile?.gender ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="兴趣标签" items={current.profile?.interests ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
      <ProfileBlock title="活跃时间" items={current.profile?.activeTimes ?? []} emptyMessage={selected === "all" ? "请选择具体平台查看画像" : undefined} />
    </div></section>

    <section className="panel platform-position-panel">
      <div className="panel-heading"><div><span className="section-kicker">PLATFORM POSITIONING</span><h2>平台定位分析</h2></div><span className="section-note">选择平台后查看建议</span></div>
      {selected === "all" ? <div className="positioning-grid">{data.platforms.map((item) => <article key={item.platform}><span>{platformLabel(item.platform)}</span><strong>{item.strategy.positioning}</strong><p>{item.strategy.actions[0]}</p></article>)}</div> : <div className="selected-positioning"><span>{currentPlatformLabel}</span><h3>{current.strategy.positioning}</h3><ol>{current.strategy.actions.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</li>)}</ol></div>}
    </section>

    <section className="panel weekly-fan-report">
      <div className="panel-heading light-heading"><div><span className="section-kicker">AI WEEKLY REPORT</span><h2>AI 粉丝运营周报</h2></div><span className="rule-badge">WEEKLY</span></div>
      <div className="weekly-report-grid"><article><span>粉丝变化</span><p>{weeklyReport.change}</p></article><article><span>问题分析</span><p>{weeklyReport.issue}</p></article><article><span>运营建议</span><p>{weeklyReport.suggestion}</p></article><article><span>下周计划</span><p>{weeklyReport.nextWeek}</p></article></div>
    </section>

    <section className="panel future-collection-note"><div><span>API READY</span><h2>自动采集兼容</h2></div><p>画像快照继续写入 <code>social_fans</code>，每日粉丝变化继续写入 <code>fan_growth_records</code>；原有抖音采集逻辑保持不变。</p><small>预留适配路径：{data.collectionApi}</small></section>
    <p className="analysis-disclaimer">更新时间：{formatDate(data.updatedAt)} · 粉丝画像缺失时保持空状态，不生成模拟画像。</p>
  </div>;
}
