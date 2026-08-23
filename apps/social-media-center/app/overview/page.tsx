"use client";

import { useEffect, useMemo, useState } from "react";
import { DataStatusBadge } from "@/components/v2/DataStatusBadge";
import { DateRangeSelector, useV2DateRange } from "@/components/v2/DateRangeSelector";
import { MetricCard } from "@/components/v2/MetricCard";
import { V2PageHeader } from "@/components/v2/V2PageHeader";
import { dateRangeQuery } from "@/lib/date-range";
import { formatCompact, formatDate } from "@/lib/format";

type FanData = {
  platforms: Array<{ platform: string; fansCount: number | null; profile: { collectedAt: string } | null }>;
  updatedAt: string;
};

type ContentData = {
  platform: string;
  range: { from: string; to: string; label: string };
  summary: {
    periodPublished: number;
    views: number;
    likes: number;
    comments: number;
    favorites: number;
    shares: number;
    interactions: number;
  };
  updatedAt: string;
};

const platforms = [
  {
    id: "douyin",
    label: "抖音",
    metric: "播放",
    positioning: "短视频传播、热点内容、视觉冲击、项目体验",
    connected: true,
  },
  {
    id: "kuaishou",
    label: "快手",
    metric: "播放",
    positioning: "短视频传播、下沉用户、本地及旅行兴趣人群",
    connected: false,
  },
  {
    id: "weibo",
    label: "微博",
    metric: "曝光 / 阅读",
    positioning: "热点传播、事件传播、图文信息、公共话题",
    connected: false,
  },
  {
    id: "video_account",
    label: "视频号",
    metric: "播放",
    positioning: "微信生态、品牌内容、私域传播",
    connected: false,
  },
] as const;

export default function OverviewPage() {
  const range = useV2DateRange();
  const [fans, setFans] = useState<FanData | null>(null);
  const [content, setContent] = useState<ContentData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = dateRangeQuery(range);
    Promise.all([
      fetch(`/api/insights/fans?${query}&trend=7d`).then((response) => response.ok
        ? response.json() as Promise<FanData>
        : Promise.reject(new Error("粉丝数据读取失败"))),
      fetch(`/api/content-monitoring?platform=douyin&${query}`).then((response) => response.ok
        ? response.json() as Promise<ContentData>
        : Promise.reject(new Error("作品数据读取失败"))),
    ]).then(([fanData, contentData]) => {
      setFans(fanData);
      setContent(contentData);
      setError("");
    }).catch((reason: Error) => setError(reason.message));
  }, [range]);

  const douyinFans = fans?.platforms.find((item) => item.platform === "douyin") ?? null;
  const summary = content?.summary ?? null;
  const hasPeriodContent = Boolean(summary?.periodPublished);
  const hasRealData = douyinFans?.fansCount !== null && douyinFans?.fansCount !== undefined || hasPeriodContent;
  const platformRows = useMemo(() => platforms.map((platform) => ({
    ...platform,
    followers: platform.id === "douyin" ? douyinFans?.fansCount ?? null : null,
    posts: platform.id === "douyin" && summary ? summary.periodPublished : null,
    views: platform.id === "douyin" && summary ? summary.views : null,
    interactions: platform.id === "douyin" && summary ? summary.interactions : null,
  })), [douyinFans?.fansCount, summary]);

  return <div className="page-stack v2-page v2-overview-page">
    <DateRangeSelector />
    <V2PageHeader
      eyebrow="MANAGEMENT OVERVIEW"
      title="总览"
      description="管理层跨平台观察入口；指标来自真实业务数据，并保留各平台原始口径。"
      aside={<DataStatusBadge status={hasRealData ? "ready" : "unavailable"} />}
    />

    {error && <div className="error-panel">{error}</div>}

    <section className="v2-metric-grid" aria-label="跨平台核心指标">
      <MetricCard label="总粉丝数量" value={douyinFans?.fansCount === null || douyinFans?.fansCount === undefined ? "暂无数据" : formatCompact(douyinFans.fansCount)} note="抖音最新真实账号快照" state={douyinFans?.fansCount === null || douyinFans?.fansCount === undefined ? "empty" : "available"} />
      <MetricCard label="发布作品数量" value={hasPeriodContent ? summary?.periodPublished ?? "暂无数据" : "暂无数据"} note={range.label} state={hasPeriodContent ? "available" : "empty"} />
      <MetricCard label="总播放 / 总流量" value={hasPeriodContent ? formatCompact(summary?.views ?? 0) : "暂无数据"} note="当前阶段为抖音播放口径" state={hasPeriodContent ? "available" : "empty"} />
      <MetricCard label="总点赞" value={hasPeriodContent ? formatCompact(summary?.likes ?? 0) : "暂无数据"} note={range.label} state={hasPeriodContent ? "available" : "empty"} />
      <MetricCard label="总评论" value={hasPeriodContent ? formatCompact(summary?.comments ?? 0) : "暂无数据"} note={range.label} state={hasPeriodContent ? "available" : "empty"} />
      <MetricCard label="总收藏" value={hasPeriodContent ? formatCompact(summary?.favorites ?? 0) : "暂无数据"} note={range.label} state={hasPeriodContent ? "available" : "empty"} />
      <MetricCard label="总分享" value={hasPeriodContent ? formatCompact(summary?.shares ?? 0) : "暂无数据"} note={range.label} state={hasPeriodContent ? "available" : "empty"} />
    </section>

    <section className="panel v2-contribution-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">PLATFORM CONTRIBUTION</span><h2>各平台内容贡献</h2></div>
        <span className="section-note">当前仅接入抖音真实数据；不同平台原始口径不强行合并</span>
      </div>
      <div className="v2-platform-contribution-grid">
        {platformRows.map((platform) => <article key={platform.id}>
          <div><strong>{platform.label}</strong><span>{platform.metric}</span></div>
          {platform.connected && hasPeriodContent ? <>
            <b>{formatCompact(platform.views ?? 0)}</b>
            <div className="v2-contribution-track"><i style={{ width: "100%" }} /></div>
            <small>作品 {platform.posts} 条 · 互动 {formatCompact(platform.interactions ?? 0)} · 当前已接入平台贡献 100%</small>
          </> : <div className="v2-platform-not-connected"><b>{platform.connected ? "暂无数据" : "未接入"}</b><small>{platform.connected ? "当前筛选周期没有真实作品" : "不使用抖音数据填充"}</small></div>}
        </article>)}
      </div>
    </section>

    <section className="panel v2-positioning-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">PLATFORM POSITIONING</span><h2>平台运营定位</h2></div>
        <span className="section-note">运营说明，不参与指标计算</span>
      </div>
      <div className="v2-positioning-grid">
        {platformRows.map((platform) => <article key={platform.id}>
          <span>{platform.label}</span>
          <h3>{platform.positioning}</h3>
          <p>{platform.connected ? "已接入真实业务数据" : "平台容器已保留，等待真实数据接入"}</p>
        </article>)}
      </div>
    </section>

    <p className="analysis-disclaimer">数据来源：social_fans、fan_growth_records、social_posts、social_post_snapshots、social_post_evaluations · 粉丝快照：{douyinFans?.profile?.collectedAt ? formatDate(douyinFans.profile.collectedAt) : "暂无"} · 页面更新时间：{content?.updatedAt ? formatDate(content.updatedAt) : "读取中"} · 未知值不转换为0。</p>
  </div>;
}
