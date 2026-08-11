"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { platformLabel } from "@/lib/format";

type ArchiveRow = {
  id: number;
  archive_date: string;
  hot_topic_id: number;
  topic_name: string;
  platform: string;
  topic_type: string;
  heat_value: number;
  ai_score: number | null;
  recommendation_level: "A" | "B" | "C";
  recommended_title: string | null;
  content_direction: string | null;
  related_post_id: number | null;
  related_post_title: string | null;
  effect_score: number | null;
  generated_at: string;
};

type ArchiveData = {
  archiveDate: string;
  rows: ArchiveRow[];
  availableDates: Array<{ archive_date: string; count: number }>;
  topicTypes: string[];
  summary: { total: number; aLevel: number; linked: number; averageAiScore: number; averageEffectScore: number };
  reportFileName: string;
};

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function HotTopicArchivePage() {
  const [date, setDate] = useState(localDate);
  const [platform, setPlatform] = useState("all");
  const [topicType, setTopicType] = useState("all");
  const [data, setData] = useState<ArchiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ date, platform, topicType });
      const response = await fetch(`/api/hot-topic-archive?${query.toString()}`, { cache: "no-store" });
      const result = await response.json() as ArchiveData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "热点档案读取失败");
      setData(result);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "热点档案读取失败" });
    } finally {
      setLoading(false);
    }
  }, [date, platform, topicType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadArchive(), 0);
    return () => window.clearTimeout(timer);
  }, [loadArchive]);

  async function generateDailyReport() {
    setGenerating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/hot-topic-archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const result = await response.json() as { error?: string; archivedCount?: number; fileName?: string };
      if (!response.ok) throw new Error(result.error ?? "热点日报生成失败");
      setMessage({ type: "success", text: `已归档 ${result.archivedCount ?? 0} 条热点，并生成 ${result.fileName ?? "Excel报告"}。` });
      await loadArchive();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "热点日报生成失败" });
    } finally {
      setGenerating(false);
    }
  }

  const dateCoverage = useMemo(() => data?.availableDates.find((item) => item.archive_date === date)?.count ?? 0, [data, date]);

  return <div className="page-stack hot-archive-page">
    <header className="page-heading compact-heading">
      <div><p className="eyebrow">DAILY HOT TOPIC ASSETS</p><h1>热点档案库</h1><p>按日沉淀原始热点、AI分析、推荐建议和效果复盘，形成可查询、可下载的数据资产。</p></div>
      <div className="archive-heading-actions"><button className="primary-button" onClick={() => void generateDailyReport()} disabled={generating}>{generating ? "生成中…" : "生成当日报告"}</button><a className="secondary-button" href={`/api/hot-topic-archive/download?date=${date}`}>下载Excel</a></div>
    </header>

    <section className="panel archive-filter-panel">
      <div><span className="section-kicker">ARCHIVE QUERY</span><h2>热点历史查询</h2></div>
      <label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>平台<select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">全部平台</option><option value="douyin">抖音</option><option value="kuaishou">快手</option><option value="weibo">微博</option><option value="web">其他平台</option></select></label>
      <label>热点类型<select value={topicType} onChange={(event) => setTopicType(event.target.value)}><option value="all">全部类型</option>{data?.topicTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      <div className="archive-coverage"><strong>{dateCoverage}</strong><span>当日归档总量</span></div>
    </section>

    {message && <div className={`import-message ${message.type}`}><span>{message.type === "success" ? "✓" : "!"}</span>{message.text}</div>}

    <section className="archive-kpi-grid">
      <article><span>归档热点</span><strong>{data?.summary.total ?? 0}</strong><small>当前筛选结果</small></article>
      <article><span>A级推荐</span><strong>{data?.summary.aLevel ?? 0}</strong><small>优先进入选题池</small></article>
      <article><span>平均AI评分</span><strong>{data?.summary.averageAiScore ?? 0}</strong><small>热点关联与内容适配</small></article>
      <article><span>已关联作品</span><strong>{data?.summary.linked ?? 0}</strong><small>可进入效果复盘</small></article>
      <article className="archive-primary-kpi"><span>平均效果评分</span><strong>{data?.summary.averageEffectScore ?? 0}</strong><small>仅统计已复盘作品</small></article>
    </section>

    <section className="panel archive-list-panel">
      <div className="panel-heading light-heading"><div><span className="section-kicker">DAILY ARCHIVE</span><h2>{date} 热点档案</h2></div><div className="archive-file-meta"><strong>{data?.reportFileName ?? `${date}_新媒体热点分析报告.xlsx`}</strong><span>每日08:30自动归档，可随时重新生成</span></div></div>
      {loading ? <div className="loading-panel"><span className="loading-dot" />正在读取热点档案…</div> : <div className="table-wrap"><table className="archive-table">
        <thead><tr><th>日期</th><th>热点名称</th><th>平台 / 类型</th><th>热度</th><th>AI评分</th><th>推荐等级</th><th>推荐标题</th><th>内容方向</th><th>关联作品</th><th>效果评分</th></tr></thead>
        <tbody>{data?.rows.map((row) => <tr key={row.id}><td>{row.archive_date}</td><td className="archive-topic-name"><strong>{row.topic_name}</strong><small>归档于 {row.generated_at}</small></td><td><span className={`platform-tag tag-${row.platform}`}>{platformLabel(row.platform)}</span><small>{row.topic_type}</small></td><td><strong>{row.heat_value.toLocaleString()}</strong></td><td>{row.ai_score === null ? "待分析" : `${Math.round(row.ai_score)}分`}</td><td><span className={`hot-level-badge level-${row.recommendation_level.toLowerCase()}`}>{row.recommendation_level}级</span></td><td>{row.recommended_title ?? "待生成"}</td><td>{row.content_direction ?? "待生成"}</td><td>{row.related_post_title ?? "未关联"}</td><td><strong className="archive-effect-score">{row.effect_score === null ? "待评估" : `${row.effect_score}分`}</strong></td></tr>)}{!data?.rows.length && <tr><td className="empty-cell" colSpan={10}>该日期及筛选条件暂无热点档案。可点击“生成当日报告”归档已有热点。</td></tr>}</tbody>
      </table></div>}
    </section>
  </div>;
}
