"use client";

import { useEffect, useMemo, useState } from "react";
import { DataStatusBadge } from "@/components/v2/DataStatusBadge";
import { DateRangeSelector, useV2DateRange } from "@/components/v2/DateRangeSelector";
import { MetricCard } from "@/components/v2/MetricCard";
import { V2PageHeader } from "@/components/v2/V2PageHeader";
import { dateRangeQuery } from "@/lib/date-range";
import { formatCompact } from "@/lib/format";

type DashboardData = {
  overview: Array<{ platform: string; followers: number; todayPosts: number; views: number; interactions: number }>;
  updatedAt: string;
};

type Post = {
  id: number;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
};

const platforms = [
  { id: "douyin", label: "抖音", metric: "播放" },
  { id: "kuaishou", label: "快手", metric: "播放" },
  { id: "weibo", label: "微博", metric: "曝光 / 阅读" },
  { id: "video_account", label: "视频号", metric: "播放" },
] as const;

export default function OverviewPage() {
  const range = useV2DateRange();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = dateRangeQuery(range);
    Promise.all([
      fetch(`/api/dashboard?${query}`).then((response) => response.ok ? response.json() as Promise<DashboardData> : Promise.reject(new Error("总览数据读取失败"))),
      fetch(`/api/posts?platform=all&from=${range.from}&to=${range.to}`).then((response) => response.ok ? response.json() as Promise<{ posts: Post[] }> : Promise.reject(new Error("作品数据读取失败"))),
    ]).then(([dashboardData, postData]) => {
      setDashboard(dashboardData);
      setPosts(postData.posts);
      setError("");
    }).catch((reason: Error) => setError(reason.message));
  }, [range]);

  const totals = useMemo(() => posts.reduce((sum, post) => ({
    views: sum.views + Number(post.views ?? 0),
    likes: sum.likes + Number(post.likes ?? 0),
    comments: sum.comments + Number(post.comments ?? 0),
    favorites: sum.favorites + Number(post.favorites ?? 0),
    shares: sum.shares + Number(post.shares ?? 0),
  }), { views: 0, likes: 0, comments: 0, favorites: 0, shares: 0 }), [posts]);

  const totalFollowers = dashboard?.overview.reduce((sum, item) => sum + Number(item.followers ?? 0), 0) ?? null;
  const platformRows = platforms.map((platform) => {
    const account = dashboard?.overview.find((item) => item.platform === platform.id);
    const platformPosts = posts.filter((post) => post.platform === platform.id);
    const views = platformPosts.reduce((sum, post) => sum + Number(post.views ?? 0), 0);
    return {
      ...platform,
      followers: account?.followers ?? null,
      posts: platformPosts.length,
      views,
      hasData: Boolean(account?.followers || platformPosts.length),
      hasTrafficData: platformPosts.length > 0,
    };
  });

  const hasAnyData = posts.length > 0 || Boolean(totalFollowers);

  return <div className="page-stack v2-page v2-overview-page">
    <DateRangeSelector />
    <V2PageHeader
      eyebrow="MANAGEMENT OVERVIEW"
      title="总览"
      description="管理层跨平台观察入口；统一展示、保留各平台原始指标口径。"
      aside={<DataStatusBadge status={hasAnyData ? "ready" : "unavailable"} />}
    />

    {error && <div className="error-panel">{error}</div>}

    <section className="v2-metric-grid" aria-label="跨平台核心指标">
      <MetricCard label="总粉丝数量" value={totalFollowers ? formatCompact(totalFollowers) : "暂无数据"} note="账号最新真实记录" state={totalFollowers ? "available" : "empty"} />
      <MetricCard label="发布作品数量" value={posts.length || "暂无数据"} note={range.label} state={posts.length ? "available" : "empty"} />
      <MetricCard label="总流量 / 总播放" value={posts.length ? formatCompact(totals.views) : "暂无数据"} note="按平台原始播放或曝光口径展示" state={posts.length ? "available" : "empty"} />
      <MetricCard label="总点赞" value={posts.length ? formatCompact(totals.likes) : "暂无数据"} note={range.label} state={posts.length ? "available" : "empty"} />
      <MetricCard label="总评论" value={posts.length ? formatCompact(totals.comments) : "暂无数据"} note={range.label} state={posts.length ? "available" : "empty"} />
      <MetricCard label="总收藏" value={posts.length ? formatCompact(totals.favorites) : "暂无数据"} note={range.label} state={posts.length ? "available" : "empty"} />
      <MetricCard label="总转发 / 分享" value={posts.length ? formatCompact(totals.shares) : "暂无数据"} note={range.label} state={posts.length ? "available" : "empty"} />
    </section>

    <section className="panel v2-contribution-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">PLATFORM CONTRIBUTION</span><h2>平台流量贡献</h2></div>
        <span className="section-note">DOU+不得计入自然传播占比；当前仅展示业务表原始口径</span>
      </div>
      <div className="v2-platform-contribution-grid">
        {platformRows.map((platform) => {
          const share = totals.views > 0 && platform.hasTrafficData ? platform.views / totals.views * 100 : null;
          return <article key={platform.id}>
            <div><strong>{platform.label}</strong><span>{platform.metric}</span></div>
            {platform.hasTrafficData ? <>
              <b>{formatCompact(platform.views)}</b>
              <div className="v2-contribution-track"><i style={{ width: `${share ?? 0}%` }} /></div>
              <small>周期贡献 {share?.toFixed(1)}% · {platform.posts} 条作品</small>
            </> : <p>暂无数据</p>}
          </article>;
        })}
      </div>
    </section>

    <section className="panel v2-positioning-panel">
      <div className="panel-heading">
        <div><span className="section-kicker">PLATFORM POSITIONING</span><h2>平台内容定位</h2></div>
        <span className="section-note">本阶段仅建立分析容器，不生成模拟结论</span>
      </div>
      <div className="v2-positioning-grid">
        {platformRows.map((platform) => <article key={platform.id}>
          <span>{platform.label}</span>
          <h3>{platform.hasData ? "等待后续阶段接入定位分析" : "暂无真实数据"}</h3>
          <p>{platform.hasData ? "将复用内容、粉丝与效果评价结果形成平台定位。" : "完成该平台数据接入后启用分析。"}</p>
        </article>)}
      </div>
    </section>
  </div>;
}
