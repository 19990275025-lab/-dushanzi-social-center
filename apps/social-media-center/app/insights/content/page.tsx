"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate, platformLabel } from "@/lib/format";
import { dateRangeQuery } from "@/lib/date-range";
import { useGlobalDateRange } from "@/components/GlobalDateFilter";

const platformOptions = ["all", "douyin", "kuaishou", "weibo"];
const contentTypeLabels: Record<string, string> = { video: "短视频", image_text: "图文", live: "直播", article: "文章" };
type Overview = { platform: string; postCount: number; totalViews: number; interactions: number; fansGrowth: number; followers: number };
type Category = { category: string; postCount: number; views: number; interactions: number; ratio: number };
type ContentType = { contentType: string; postCount: number; views: number; interactions: number; fansGrowth: number; fansPerTenThousandViews?: number };
type MonitoredPost = { id: number; platform: string; title: string; content_type: string; publish_time: string; views: number; likes: number; comments: number; favorites: number; shares: number; fans_growth: number; interactions: number; interactionRate: number; aiScore: number; category: string };
type ViralVideo = { id: number; platform: string; category: string; categoryLabel: string; account_name: string | null; title: string; publish_time: string; views: number; likes: number; comments: number; favorites: number; shares: number; interactions: number; interactionRate: number };
type ViralComparison = { category: string; label: string; sampleCount: number; averageViews: number; interactionRate: number; topVideo: null | { id: number; title: string; views: number }; videoStructure?: string; titlePattern?: string; firstThreeSeconds?: string; shootingMethod?: string; interactionMethod?: string; commentFeedback?: string; breakoutReason?: string; replicableElements?: string; dushanziSuggestion?: string; status: string };
type ContentData = {
  platform: string;
  totals: { postCount: number; totalViews: number; likes: number; comments: number; favorites: number; shares: number; interactions: number; interactionRate: number; fansGrowth: number };
  platformOverview: Overview[];
  contentCategories: Category[];
  topPosts: MonitoredPost[];
  monitoredPosts: MonitoredPost[];
  contentFanRelations: ContentType[];
  viralVideos: ViralVideo[];
  viralCategoryComparison: ViralComparison[];
  suggestions: string[];
  dailyReport: { title: string; excellentPost: null | { id: number; title: string; score: number; reason: string }; problems: string[]; causes: string[]; suggestions: string[] };
  viralLibraryImportApi: string;
  updatedAt: string;
};

export default function ContentMonitoringPage() {
  const range = useGlobalDateRange();
  const [platform, setPlatform] = useState("all");
  const [data, setData] = useState<ContentData | null>(null);
  const [viralCategory, setViralCategory] = useState("tourism");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/insights/content?platform=${platform}&${dateRangeQuery(range)}`);
      if (!response.ok) throw new Error("内容监测数据读取失败");
      setData(await response.json() as ContentData);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "内容监测数据读取失败");
    } finally {
      setLoading(false);
    }
  }, [platform, range]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const platformCards = useMemo(() => {
    if (!data) return [];
    const all = data.platformOverview.reduce<Overview>((summary, item) => ({ platform: "all", postCount: summary.postCount + item.postCount, totalViews: summary.totalViews + item.totalViews, interactions: summary.interactions + item.interactions, fansGrowth: summary.fansGrowth + item.fansGrowth, followers: summary.followers + item.followers }), { platform: "all", postCount: 0, totalViews: 0, interactions: 0, fansGrowth: 0, followers: 0 });
    return platformOptions.map((item) => item === "all" ? all : data.platformOverview.find((row) => row.platform === item)).filter((item): item is Overview => Boolean(item));
  }, [data]);
  const currentPlatformLabel = platform === "all" ? "全部平台" : platformLabel(platform);
  const activeViralComparison = data?.viralCategoryComparison.find((item) => item.category === viralCategory) ?? data?.viralCategoryComparison[0];
  const activeViralVideos = data?.viralVideos.filter((item) => item.category === activeViralComparison?.category).slice(0, 10) ?? [];

  if (loading && !data) return <div className="loading-panel"><span className="loading-dot" />正在读取内容监测数据…</div>;
  if (error || !data) return <div className="error-panel">{error || "暂无内容数据"}</div>;

  return <div className={`page-stack content-monitoring-page platform-themed-page theme-${platform}`}>
    <header className="page-heading compact-heading">
      <div><p className="eyebrow">CONTENT MONITORING CENTER · V1.0</p><h1>{platform === "all" ? "内容监测中心" : `${currentPlatformLabel}内容监测`}</h1><p>每日监测作品效果、同行表现与内容机会，输出可执行的 AI 优化建议。</p></div>
      <span className="current-platform-badge" aria-live="polite"><i />当前平台：{currentPlatformLabel}</span>
    </header>

    <section className="content-platform-grid" aria-label="内容监测平台筛选">
      {platformCards.map((item) => <button aria-pressed={platform === item.platform} className={`fan-platform-card content-platform-card platform-${item.platform} ${platform === item.platform ? "active" : ""}`} key={item.platform} onClick={() => setPlatform(item.platform)}><div><span>{item.platform === "all" ? "全部平台" : platformLabel(item.platform)}</span><small>{platform === item.platform ? "当前平台" : item.platform === "all" ? "三平台汇总" : item.postCount ? "已有作品数据" : "等待数据"}</small></div><strong>{item.postCount}<em>作品</em></strong><p><span>播放 {formatCompact(item.totalViews)}</span><span>互动 {formatCompact(item.interactions)}</span></p></button>)}
    </section>

    <section className="monitor-metric-grid">
      {[['发布数量', data.totals.postCount], ['播放量', data.totals.totalViews], ['点赞量', data.totals.likes], ['评论量', data.totals.comments], ['收藏量', data.totals.favorites], ['分享量', data.totals.shares]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{formatCompact(Number(value))}</strong></article>)}
      <article className="rate-metric"><span>互动率</span><strong>{data.totals.interactionRate}%</strong><small>赞评藏转 / 播放</small></article>
    </section>

    <section className="panel monitored-post-panel">
      <div className="panel-heading"><div><span className="section-kicker">WORK MONITORING</span><h2>作品监测列表</h2></div><span className="section-note">AI 评分来自现有规则模型</span></div>
      <div className="table-wrap"><table className="content-table monitoring-table"><thead><tr><th>作品标题</th><th>平台</th><th>发布时间</th><th>播放</th><th>点赞</th><th>评论</th><th>收藏</th><th>分享</th><th>AI评分</th><th>操作</th></tr></thead><tbody>{data.monitoredPosts.map((post) => <tr key={post.id}><td><strong>{post.title}</strong><small className="table-subline">{post.category}</small></td><td><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span></td><td className="date-cell">{formatDate(post.publish_time)}</td><td className="metric-cell">{formatCompact(post.views)}</td><td>{formatCompact(post.likes)}</td><td>{formatCompact(post.comments)}</td><td>{formatCompact(post.favorites)}</td><td>{formatCompact(post.shares)}</td><td><span className={`score-pill ${post.aiScore >= 75 ? "score-good" : post.aiScore >= 60 ? "score-mid" : "score-low"}`}>{post.aiScore}</span></td><td><a className="content-analysis-link" href={`/insights/content/detail?id=${post.id}`}>数据分析</a></td></tr>)}{!data.monitoredPosts.length && <tr><td className="empty-cell" colSpan={10}>当前周期暂无作品数据</td></tr>}</tbody></table></div>
    </section>

    <section className="content-monitor-grid">
      <article className="panel content-category-panel">
        <div className="panel-heading"><div><span className="section-kicker">CONTENT MIX</span><h2>内容类型分析</h2></div><span className="section-note">按作品标题规则分类</span></div>
        <div className="category-analysis-list">{data.contentCategories.map((item) => <div key={item.category}><div><strong>{item.category}</strong><span>{item.postCount} 条 · {formatCompact(item.views)} 播放</span></div><i><b style={{ width: `${item.ratio}%` }} /></i><em>{item.ratio}%</em></div>)}</div>
      </article>
      <article className="panel ai-content-advice">
        <div className="panel-heading light-heading"><div><span className="section-kicker">AI OPTIMIZATION</span><h2>AI 优化建议</h2></div><span className="rule-badge">RULES V1</span></div>
        <ol>{data.suggestions.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></li>)}</ol>
      </article>
    </section>

    <section className="panel viral-comparison-panel">
      <div className="panel-heading"><div><span className="section-kicker">VIRAL CONTENT LAB</span><h2>爆款内容对比分析</h2></div><span className="section-note">按内容赛道对比，不绑定固定账号</span></div>
      <div className="viral-category-grid" aria-label="爆款视频类别">
        {data.viralCategoryComparison.map((item) => <button aria-pressed={viralCategory === item.category} className={viralCategory === item.category ? "active" : ""} key={item.category} onClick={() => setViralCategory(item.category)}><span>{item.label}</span><strong>{item.sampleCount}<small>条样本</small></strong><p>平均播放 {formatCompact(item.averageViews)} · 互动率 {item.interactionRate}%</p><em className={`collection-status ${item.status === "待采集" ? "status-pending" : "status-completed"}`}>{item.status}</em></button>)}
      </div>
      {activeViralComparison && <>
        <div className="viral-dimension-grid">
          {[['视频结构', activeViralComparison.videoStructure], ['标题方式', activeViralComparison.titlePattern], ['前三秒内容', activeViralComparison.firstThreeSeconds], ['拍摄方式', activeViralComparison.shootingMethod], ['互动方式', activeViralComparison.interactionMethod], ['评论反馈', activeViralComparison.commentFeedback]].map(([label, value]) => <article key={label}><span>{label}</span><p>{value || "待样本补充"}</p></article>)}
        </div>
        <div className="viral-output-grid">
          <article><span>爆款原因</span><p>{activeViralComparison.breakoutReason || "样本入库后根据传播与互动数据生成"}</p></article>
          <article><span>可复制元素</span><p>{activeViralComparison.replicableElements || "待提取可复用的开场、镜头与互动结构"}</p></article>
          <article className="dushanzi-output"><span>适合独山子大峡谷的内容建议</span><p>{activeViralComparison.dushanziSuggestion || "待真实爆款样本达到分析条件后生成针对性建议"}</p></article>
        </div>
        <div className="table-wrap viral-library-table"><table><thead><tr><th>爆款视频</th><th>平台</th><th>发布时间</th><th>播放</th><th>点赞</th><th>评论</th><th>收藏</th><th>分享</th><th>互动率</th></tr></thead><tbody>{activeViralVideos.map((video) => <tr key={video.id}><td><strong>{video.title}</strong>{video.account_name && <small className="table-subline">来源：{video.account_name}</small>}</td><td><span className={`platform-tag tag-${video.platform}`}>{platformLabel(video.platform)}</span></td><td className="date-cell">{formatDate(video.publish_time)}</td><td className="metric-cell">{formatCompact(video.views)}</td><td>{formatCompact(video.likes)}</td><td>{formatCompact(video.comments)}</td><td>{formatCompact(video.favorites)}</td><td>{formatCompact(video.shares)}</td><td>{video.interactionRate}%</td></tr>)}{!activeViralVideos.length && <tr><td className="empty-cell" colSpan={9}>该类别暂无真实爆款样本，请通过数据导入中心补充</td></tr>}</tbody></table></div>
      </>}
      <p className="source-ready-note">爆款样本统一写入 <code>viral_videos</code>，支持 Chrome、Excel、API 和人工录入来源；账号仅作为可选来源信息，不作为固定对标维度。</p>
    </section>

    <section className="panel daily-content-report">
      <div className="panel-heading light-heading"><div><span className="section-kicker">DAILY AI REPORT</span><h2>{data.dailyReport.title}</h2></div><span className="rule-badge">DAILY</span></div>
      <div className="daily-report-grid"><article><span>优秀作品</span>{data.dailyReport.excellentPost ? <><strong>{data.dailyReport.excellentPost.title}</strong><p>{data.dailyReport.excellentPost.reason} · {data.dailyReport.excellentPost.score}分</p></> : <p>当前周期暂无可分析作品</p>}</article><article><span>存在问题</span><ul>{data.dailyReport.problems.map((item) => <li key={item}>{item}</li>)}</ul></article><article><span>原因分析</span><ul>{data.dailyReport.causes.map((item) => <li key={item}>{item}</li>)}</ul></article><article><span>优化建议</span><ul>{data.dailyReport.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></article></div>
    </section>

    <section className="panel breakout-panel">
      <div className="panel-heading"><div><span className="section-kicker">TOP CONTENT</span><h2>爆款作品排行</h2></div><span className="section-note">保留原有作品分析入口</span></div>
      <div className="table-wrap"><table className="content-table"><thead><tr><th>排名</th><th>作品</th><th>平台</th><th>播放</th><th>互动</th><th>涨粉</th><th>AI评分</th><th>操作</th></tr></thead><tbody>{data.topPosts.map((post, index) => <tr key={post.id}><td><span className={`rank-chip rank-${index + 1}`}>TOP {index + 1}</span></td><td><strong>{post.title}</strong><small className="table-subline">{post.category}</small></td><td><span className={`platform-tag tag-${post.platform}`}>{platformLabel(post.platform)}</span></td><td className="metric-cell">{formatCompact(post.views)}</td><td>{formatCompact(post.interactions)}</td><td>{formatCompact(post.fans_growth)}</td><td>{post.aiScore}</td><td><a className="content-analysis-link" href={`/insights/content/detail?id=${post.id}`}>数据分析</a></td></tr>)}{!data.topPosts.length && <tr><td className="empty-cell" colSpan={8}>当前平台暂无作品数据</td></tr>}</tbody></table></div>
    </section>

    <section className="panel content-fan-panel">
      <div className="panel-heading"><div><span className="section-kicker">CONTENT × FANS</span><h2>内容与粉丝关联分析</h2></div><span className="section-note">复用 social_posts.fans_growth</span></div>
      <div className="relation-summary-grid">{data.contentFanRelations.map((item) => <article key={item.contentType}><span>{contentTypeLabels[item.contentType] ?? item.contentType}</span><strong>{formatCompact(item.fansGrowth)}<small>涨粉</small></strong><p>每万次播放带来 <b>{item.fansPerTenThousandViews}</b> 位粉丝</p></article>)}{!data.contentFanRelations.length && <p className="empty-list">暂无可计算的内容转粉数据</p>}</div>
    </section>
    <p className="analysis-disclaimer">更新时间：{formatDate(data.updatedAt)} · 数据来自 social_posts、hot_topics 与 viral_videos。</p>
  </div>;
}
