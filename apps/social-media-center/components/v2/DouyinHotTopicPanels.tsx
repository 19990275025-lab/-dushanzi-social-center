"use client";

import { useEffect, useMemo, useState } from "react";
import { useV2DateRange } from "@/components/v2/DateRangeSelector";
import { EmptyState } from "@/components/v2/EmptyState";
import { dateRangeQuery } from "@/lib/date-range";
import { formatDate } from "@/lib/format";

type HotTopic = {
  id: number;
  platform: string;
  rank: number;
  topic_title: string;
  heat_value: string;
  keyword: string;
  category: string | null;
  collect_time: string;
  collection_date: string;
  analysis_id: number | null;
  ai_relevance_score: number | null;
  recommend_follow: number | null;
  recommendation_reason: string | null;
  recommended_topic: string | null;
  video_direction: string | null;
  publish_time_suggestion: string | null;
  recommendation_level: "A" | "B" | "C";
  tourism_conversion_score: number;
  content_direction: string;
  ai_analysis: string | null;
  ai_recommendation: string | null;
};

type TopicResponse = { topics: HotTopic[]; sourceAgent: string };

function readJson(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try { return JSON.parse(value) as Record<string, unknown>; }
  catch { return {} as Record<string, unknown>; }
}

function followLabel(topic: HotTopic) {
  if (topic.recommend_follow === 1) return "建议跟进";
  if (topic.recommendation_level === "B") return "谨慎跟进";
  return "不建议跟进";
}

function planningHref(topic: HotTopic) {
  const params = new URLSearchParams({ platform: "douyin", hot_topic_id: String(topic.id) });
  if (topic.analysis_id !== null) params.set("hot_topic_analysis_id", String(topic.analysis_id));
  return `/ai-planning?${params.toString()}`;
}

export function DouyinHotTopicsPanel() {
  const range = useV2DateRange();
  const [data, setData] = useState<TopicResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/hot-topic-data?platform=douyin&${dateRangeQuery(range)}`)
      .then(async (response) => {
        const body = await response.json() as TopicResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "抖音热点读取失败");
        setData(body);
        setError("");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "抖音热点读取失败"));
  }, [range]);

  const topics = (data?.topics ?? []).filter((topic) => topic.platform === "douyin").slice(0, 20);
  if (error) return <div className="error-panel">{error}</div>;
  if (!data) return <div className="loading-panel"><span className="loading-dot" />正在读取抖音真实热点…</div>;
  if (!topics.length) return <EmptyState title="当前周期暂无抖音热点" description="只读取 WorkBuddy 已入库的抖音热点，不使用快手或微博数据填充。" />;

  return <section className="panel v2-douyin-hot-panel">
    <div className="panel-heading">
      <div><span className="section-kicker">DOUYIN HOT TOP 20</span><h2>抖音平台热点 TOP20</h2></div>
      <span className="section-note">{range.from} — {range.to} · 来源 {data.sourceAgent}</span>
    </div>
    <div className="table-wrap">
      <table className="content-table v2-hot-topic-table">
        <thead><tr><th>排名</th><th>热点名称</th><th>热度</th><th>分类</th><th>趋势</th><th>AI关联度</th><th>是否跟进</th><th>推荐内容方向</th><th>采集时间</th></tr></thead>
        <tbody>{topics.map((topic) => <tr key={topic.id}>
          <td><strong className={topic.rank <= 3 ? "top-rank-number" : ""}>TOP {topic.rank}</strong></td>
          <td><strong>{topic.topic_title}</strong><small className="table-subline">{topic.keyword || "平台未提供关键词"}</small></td>
          <td className="agent-heat-value">{topic.heat_value || "暂无数据"}</td>
          <td>{topic.category || "其他"}</td>
          <td><span className="v2-topic-trend-unavailable">暂无连续快照</span></td>
          <td>{topic.ai_relevance_score === null ? "待分析" : `${Math.round(topic.ai_relevance_score)}分`}</td>
          <td><span className={`hot-level-badge level-${topic.recommendation_level.toLowerCase()}`}>{followLabel(topic)}</span></td>
          <td>{topic.content_direction || topic.video_direction || "暂无数据"}</td>
          <td className="date-cell">{topic.collect_time ? formatDate(topic.collect_time) : topic.collection_date}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="analysis-disclaimer">仅展示 platform=douyin 的真实热点。趋势缺少连续榜单快照时保持“暂无连续快照”，不生成模拟涨跌。</p>
  </section>;
}

export function DouyinAiTopicsPanel() {
  const range = useV2DateRange();
  const [data, setData] = useState<TopicResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/hot-topic-data?platform=douyin&${dateRangeQuery(range)}`)
      .then(async (response) => {
        const body = await response.json() as TopicResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "AI选题读取失败");
        setData(body);
        setError("");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "AI选题读取失败"));
  }, [range]);

  const recommendations = useMemo(() => (data?.topics ?? [])
    .filter((topic) => topic.platform === "douyin" && topic.analysis_id !== null && topic.ai_relevance_score !== null
      && (topic.recommend_follow === 1 || topic.recommendation_level === "A" || topic.recommendation_level === "B"))
    .sort((a, b) => b.tourism_conversion_score - a.tourism_conversion_score || Number(b.ai_relevance_score) - Number(a.ai_relevance_score))
    .slice(0, 20), [data]);

  if (error) return <div className="error-panel">{error}</div>;
  if (!data) return <div className="loading-panel"><span className="loading-dot" />正在读取抖音AI选题…</div>;
  if (!recommendations.length) return <EmptyState title="当前周期暂无已分析抖音选题" description="先由热点分析形成真实关联度，再从这里进入统一AI内容策划中心。" />;

  return <section className="v2-ai-topic-stack">
    <div className="v2-ai-topic-intro panel">
      <div><span className="section-kicker">WHAT TO CREATE NEXT</span><h2>抖音AI选题推荐</h2><p>这里负责发现值得做的内容；标题、脚本、前三秒和分镜统一由AI内容策划中心完成。</p></div>
      <strong>{range.from} — {range.to}</strong>
    </div>
    <div className="v2-ai-topic-grid">
      {recommendations.map((topic) => {
        const analysis = readJson(topic.ai_analysis);
        const recommendation = readJson(topic.ai_recommendation);
        const title = String(recommendation.shortVideoTitle ?? topic.recommended_topic ?? `独山子大峡谷 × ${topic.keyword}`);
        const shooting = String(recommendation.shootingDirection ?? topic.video_direction ?? "暂无真实拍摄方向");
        const reason = String(analysis.analysis ?? topic.recommendation_reason ?? "暂无推荐理由");
        return <article className="panel" key={topic.id}>
          <div className="v2-ai-topic-card-head"><span className={`hot-level-badge level-${topic.recommendation_level.toLowerCase()}`}>{topic.recommendation_level}级</span><strong>{topic.tourism_conversion_score}<small>推荐指数</small></strong></div>
          <h3>{topic.topic_title}</h3>
          <dl>
            <div><dt>推荐理由</dt><dd>{reason}</dd></div>
            <div><dt>适合内容形式</dt><dd>抖音短视频 · {topic.content_direction || "平台暂未提供"}</dd></div>
            <div><dt>标题方向</dt><dd>{title}</dd></div>
            <div><dt>拍摄方向</dt><dd>{shooting}</dd></div>
            <div><dt>建议发布时间</dt><dd>平台暂未提供该维度数据</dd></div>
            <div><dt>风险提示</dt><dd>{topic.recommendation_level === "A" ? "借势内容仍需保持景区真实场景与信息准确。" : topic.recommendation_level === "B" ? "关联度有限，发布前需人工复核热点时效。" : "不建议为追逐热度强行关联景区。"}</dd></div>
          </dl>
          <a className="v2-primary-link" href={planningHref(topic)}>进入AI内容策划中心 →</a>
        </article>;
      })}
    </div>
    <p className="analysis-disclaimer">数据来源：hot_topics + hot_topic_analysis · 当前仅展示抖音真实热点分析，不在平台页生成第二套内容方案。</p>
  </section>;
}
