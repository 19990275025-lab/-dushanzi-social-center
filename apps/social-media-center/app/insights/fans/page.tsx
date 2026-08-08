"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";

const platforms = ["douyin", "kuaishou", "weibo", "wechat_channels"];
type Distribution = { label: string; value: number };
type Trend = { record_date: string; fans_count: number; net_growth: number; new_fans: number; lost_fans: number; source_type: string };
type FanPlatform = { platform: string; fansCount: number; netGrowth: number; trend: Trend[]; trendSource: string; profile: null | { gender: Distribution[]; ages: Distribution[]; regions: Distribution[]; interests: Distribution[]; activeTimes: Distribution[]; sourceType: string; collectedAt: string } };
type FanData = { platforms: FanPlatform[]; sources: string[]; collectionApi: string; updatedAt: string };

function ProfileBlock({ title, items }: { title: string; items: Distribution[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <article className="fan-profile-card"><h3>{title}</h3>{items.length ? <div className="profile-bars">{items.slice(0, 8).map((item) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${(item.value / max) * 100}%` }} /></i><strong>{item.value}%</strong></div>)}</div> : <p className="profile-empty">等待真实粉丝画像采集</p>}</article>;
}

export default function FanInsightsPage() {
  const [data, setData] = useState<FanData | null>(null);
  const [selected, setSelected] = useState("douyin");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/insights/fans").then(async (response) => {
      if (!response.ok) throw new Error("粉丝洞察数据读取失败");
      return response.json() as Promise<FanData>;
    }).then(setData).catch((reason: Error) => setError(reason.message));
  }, []);

  const current = data?.platforms.find((item) => item.platform === selected) ?? null;
  const maxGrowth = useMemo(() => Math.max(...(current?.trend.map((item) => Math.abs(item.net_growth)) ?? [0]), 1), [current]);

  if (error) return <div className="error-panel">{error}</div>;
  if (!data || !current) return <div className="loading-panel"><span className="loading-dot" />正在读取粉丝资产…</div>;

  return (
    <div className="page-stack fan-insights-page">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">FAN ANALYSIS</p><h1>粉丝分析</h1><p>本页只展示粉丝规模、增长和画像，不混入作品排行与内容建议。</p></div>
        <a className="back-to-insights" href="/insights">← 返回洞察中心</a>
      </header>

      <section className="fan-platform-grid">
        {data.platforms.map((item) => <button className={`fan-platform-card platform-${item.platform} ${selected === item.platform ? "active" : ""}`} key={item.platform} onClick={() => setSelected(item.platform)}><div><span>{platformLabel(item.platform)}</span><small>{item.profile ? "画像已采集" : "画像待采集"}</small></div><strong>{formatCompact(item.fansCount)}<em>粉丝</em></strong><p className={item.netGrowth >= 0 ? "growth-up" : "growth-down"}>{item.netGrowth >= 0 ? "+" : ""}{formatCompact(item.netGrowth)} 期间增长</p></button>)}
      </section>

      <nav className="insight-platform-tabs fan-tabs" aria-label="粉丝分析平台筛选">
        {platforms.map((item) => <button className={selected === item ? "active" : ""} key={item} onClick={() => setSelected(item)}>{platformLabel(item)}</button>)}
      </nav>

      <section className="fan-summary-grid">
        <article><span>粉丝数量</span><strong>{formatCompact(current.fansCount)}</strong><small>当前账号汇总</small></article>
        <article><span>增长记录</span><strong>{current.trend.length}</strong><small>有效时间点</small></article>
        <article><span>净增长</span><strong>{current.netGrowth >= 0 ? "+" : ""}{formatCompact(current.netGrowth)}</strong><small>{current.trendSource}</small></article>
        <article><span>画像状态</span><strong className="status-text">{current.profile ? "已采集" : "待采集"}</strong><small>social_fans</small></article>
      </section>

      <section className="panel fan-trend-panel">
        <div className="panel-heading"><div><span className="section-kicker">GROWTH TREND</span><h2>粉丝增长趋势</h2></div><span className="section-note">来源：{current.trendSource}</span></div>
        {current.trend.length ? <div className="growth-chart" aria-label="粉丝增长趋势图">{current.trend.slice(-30).map((item) => <div key={item.record_date}><span className={item.net_growth >= 0 ? "positive-bar" : "negative-bar"} style={{ height: `${Math.max(8, (Math.abs(item.net_growth) / maxGrowth) * 100)}%` }} /><strong>{item.net_growth >= 0 ? "+" : ""}{item.net_growth}</strong><small>{item.record_date.slice(5)}</small></div>)}</div> : <div className="fan-empty-state"><strong>暂无增长记录</strong><p>未来自动采集写入 fan_growth_records 后，此处将展示连续趋势。</p></div>}
      </section>

      <section>
        <div className="section-title"><div><span className="section-kicker">AUDIENCE PROFILE</span><h2>粉丝画像</h2></div><span className="section-note">不使用模拟画像</span></div>
        <div className="fan-profile-grid">
          <ProfileBlock title="性别" items={current.profile?.gender ?? []} />
          <ProfileBlock title="年龄" items={current.profile?.ages ?? []} />
          <ProfileBlock title="地域" items={current.profile?.regions ?? []} />
          <ProfileBlock title="兴趣" items={current.profile?.interests ?? []} />
          <ProfileBlock title="活跃时间" items={current.profile?.activeTimes ?? []} />
        </div>
      </section>

      <section className="panel future-collection-note"><div><span>API READY</span><h2>自动采集兼容</h2></div><p>画像快照写入 <code>social_fans</code>，每日粉丝变化写入 <code>fan_growth_records</code>；均预留来源标识、外部记录编号、原始数据和采集日志关联。</p><small>预留适配路径：{data.collectionApi}</small></section>
      <p className="analysis-disclaimer">更新时间：{formatDate(data.updatedAt)} · 粉丝画像缺失时保持空状态，不做规则推断。</p>
    </div>
  );
}
