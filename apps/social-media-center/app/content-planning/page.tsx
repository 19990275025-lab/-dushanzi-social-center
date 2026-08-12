"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCompact, formatDate } from "@/lib/format";

type Topic = {
  id: number; topic_name: string; recommendationIndex: number; relevanceScore: number;
  platform: "douyin"; contentType: string; contentTypeLabel: string; direction: string;
};
type Shot = { shot: number; scene: string; visual: string; voiceover: string; duration: string };
type Plan = {
  plan_id: number; hot_topic_id: number; task_id: number | null; related_post_id: number | null;
  content_type: string; title: string; title_options: string[]; script: string; shot_list: Shot[];
  cover_text: string; hashtags: string[]; recommended_topics: string[]; background_music: string | null;
  publish_time: string; live_theme: string | null; target_views: number; target_interaction_rate: number;
  target_fans_growth: number; status: string; created_time: string; topic_name: string; relevance_score: number;
  task_title: string | null; task_status: string | null; post_title: string | null; post_publish_time: string | null;
  views: number | null; likes: number | null; comments: number | null; favorites: number | null; shares: number | null;
  effect_score: number | null; ai_summary: string | null; evaluated_at: string | null; review_due: boolean;
};
type AvailablePost = { id: number; title: string; publish_time: string; views: number; likes: number; comments: number; favorites: number; shares: number };
type Dashboard = {
  topics: Topic[]; plans: Plan[]; availablePosts: AvailablePost[];
  summary: { recommended: number; plans: number; tasks: number; published: number; reviewed: number };
  collectionFreshness: { collected_at: string | null; success_count: number } | null;
  updatedAt: string;
};

const statusLabels: Record<string, string> = { draft: "方案草稿", task_created: "已生成任务", published: "已关联发布", reviewed: "已完成复盘" };
const steps = ["今日推荐选题", "AI内容方案", "内容任务", "发布效果", "AI复盘"];

export default function ContentPlanningPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/content-planning");
      if (!response.ok) throw new Error("AI内容策划数据读取失败");
      const result = await response.json() as Dashboard;
      setData(result);
      setSelectedPlanId((current) => current && result.plans.some((plan) => plan.plan_id === current) ? current : result.plans[0]?.plan_id ?? null);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "数据读取失败"); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const selectedPlan = useMemo(() => data?.plans.find((plan) => plan.plan_id === selectedPlanId) ?? null, [data, selectedPlanId]);

  async function run(action: string, payload: Record<string, unknown>, success: string, nextStep?: number) {
    setBusy(`${action}-${payload.hotTopicId ?? payload.planId ?? "all"}`);
    setMessage(""); setError("");
    try {
      const response = await fetch("/api/content-planning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const result = await response.json() as { error?: string; planId?: number; dashboard?: Dashboard };
      if (!response.ok || !result.dashboard) throw new Error(result.error ?? "操作失败");
      setData(result.dashboard);
      if (result.planId) setSelectedPlanId(result.planId);
      else if (payload.planId) setSelectedPlanId(Number(payload.planId));
      if (nextStep !== undefined) setActiveStep(nextStep);
      setMessage(success);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(""); }
  }

  if (!data) return <div className={error ? "error-panel" : "loading-panel"}>{error || "正在读取AI内容策划数据…"}</div>;

  return <div className="page-stack content-planning-page">
    <header className="page-heading compact-heading">
      <div><p className="eyebrow">AI CONTENT PLANNING CENTER · V1.0</p><h1>AI内容策划中心</h1><p>把A级热点转化为抖音内容方案、任务和发布复盘，连接热点监测与任务执行。</p></div>
      <span className="planning-platform-badge"><i />当前平台：抖音</span>
    </header>

    <section className="planning-flow" aria-label="内容运营闭环">
      {steps.map((step, index) => <button className={activeStep === index ? "active" : ""} key={step} onClick={() => setActiveStep(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></button>)}
    </section>

    <section className="planning-summary-grid">
      {[ ["A级推荐", data.summary.recommended, "今日推荐选题"], ["内容方案", data.summary.plans, "已持久化方案"], ["内容任务", data.summary.tasks, "已进入任务中心"], ["关联发布", data.summary.published, "已关联作品"], ["完成复盘", data.summary.reviewed, "发布满7日"] ].map(([label, value, note]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>

    {(message || error) && <div className={error ? "error-panel inline-error" : "planning-message"}>{error || message}</div>}

    <section className="panel today-topic-panel">
      <div className="panel-heading"><div><span className="section-kicker">TODAY AI TOPICS</span><h2>今日推荐选题 TOP5</h2></div><span className="section-note">仅展示抖音 A 级热点</span></div>
      <div className="planning-topic-grid">
        {data.topics.map((topic, index) => {
          const existing = data.plans.find((plan) => plan.hot_topic_id === topic.id);
          return <article key={topic.id}>
            <div className="topic-plan-head"><span>TOP {index + 1}</span><b>{topic.recommendationIndex}<small>推荐指数</small></b></div>
            <h3>{topic.topic_name}</h3>
            <div className="topic-plan-meta"><span>关联度 {topic.relevanceScore}%</span><span>抖音</span><span>{topic.contentTypeLabel}</span></div>
            <p>{topic.direction}</p>
            <div className="topic-plan-actions">
              <button onClick={() => existing ? (setSelectedPlanId(existing.plan_id), setActiveStep(1)) : void run("generate_plan", { hotTopicId: topic.id }, "AI内容方案已生成", 1)} disabled={Boolean(busy)}>{existing ? "查看方案" : "查看方案"}</button>
              <button className="primary" onClick={async () => {
                if (existing) await run("generate_task", { planId: existing.plan_id }, "任务已生成并进入任务管理中心", 2);
                else {
                  setBusy(`task-${topic.id}`);
                  try {
                    const first = await fetch("/api/content-planning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate_plan", hotTopicId: topic.id }) });
                    const generated = await first.json() as { planId?: number; error?: string };
                    if (!first.ok || !generated.planId) throw new Error(generated.error ?? "方案生成失败");
                    await run("generate_task", { planId: generated.planId }, "方案与任务已生成", 2);
                  } catch (reason) { setError(reason instanceof Error ? reason.message : "任务生成失败"); setBusy(""); }
                }
              }} disabled={Boolean(busy)}>生成任务</button>
            </div>
          </article>;
        })}
        {!data.topics.length && <div className="empty-monitor-state">当前没有可用于抖音策划的 A 级热点，请先在热点监测中心完成 AI 分析。</div>}
      </div>
    </section>

    <section className="planning-workspace">
      <aside className="panel plan-library">
        <div className="panel-heading"><div><span className="section-kicker">PLAN LIBRARY</span><h2>AI内容方案</h2></div></div>
        <div className="plan-library-list">{data.plans.map((plan) => <button className={plan.plan_id === selectedPlanId ? "active" : ""} key={plan.plan_id} onClick={() => { setSelectedPlanId(plan.plan_id); setActiveStep(1); }}><span>{statusLabels[plan.status] ?? plan.status}</span><strong>{plan.title}</strong><small>{plan.topic_name}</small></button>)}{!data.plans.length && <p>生成方案后将在此保存。</p>}</div>
      </aside>

      <article className="panel plan-detail">
        {!selectedPlan ? <div className="empty-monitor-state">请从今日推荐选题中生成或查看内容方案。</div> : <>
          <div className="plan-detail-header"><div><span>{statusLabels[selectedPlan.status] ?? selectedPlan.status}</span><h2>{selectedPlan.title}</h2><p>来源热点：{selectedPlan.topic_name} · 关联度 {selectedPlan.relevance_score}%</p></div><button onClick={() => void run("generate_task", { planId: selectedPlan.plan_id }, "任务已生成并进入任务管理中心", 2)} disabled={Boolean(selectedPlan.task_id || busy)}>{selectedPlan.task_id ? "任务已生成" : "一键生成任务"}</button></div>
          <div className="plan-title-options"><span>短视频标题（5个）</span><ol>{selectedPlan.title_options.map((title) => <li key={title}>{title}</li>)}</ol></div>
          <div className="plan-two-column">
            <section><span>视频脚本</span><pre>{selectedPlan.script}</pre></section>
            <section><span>拍摄分镜</span><div className="shot-list">{selectedPlan.shot_list.map((shot) => <article key={shot.shot}><b>{String(shot.shot).padStart(2, "0")}</b><div><strong>{shot.scene} · {shot.duration}</strong><p>{shot.visual}</p><small>{shot.voiceover}</small></div></article>)}</div></section>
          </div>
          <div className="plan-assets-grid">
            <div><span>封面文案</span><strong className="cover-copy">{selectedPlan.cover_text}</strong></div>
            <div><span>推荐发布时间</span><strong>{selectedPlan.publish_time}</strong></div>
            <div><span>推荐标签</span><p>{selectedPlan.hashtags.map((item) => <em key={item}>#{item}</em>)}</p></div>
            <div><span>推荐话题</span><p>{selectedPlan.recommended_topics.map((item) => <em key={item}>{item}</em>)}</p></div>
            <div><span>推荐背景音乐</span><strong>{selectedPlan.background_music || "待人工选择"}</strong></div>
            <div><span>直播主题</span><strong>{selectedPlan.live_theme || "本方案不强制直播"}</strong></div>
          </div>
          <div className="plan-target-grid"><article><span>预计播放量</span><strong>{formatCompact(selectedPlan.target_views)}</strong></article><article><span>预计互动率</span><strong>{selectedPlan.target_interaction_rate}%</strong></article><article><span>涨粉预估</span><strong>+{formatCompact(selectedPlan.target_fans_growth)}</strong></article></div>
        </>}
      </article>
    </section>

    <section className="panel planning-tasks-panel">
      <div className="panel-heading"><div><span className="section-kicker">CONTENT TASKS</span><h2>内容任务</h2></div><a className="content-analysis-link" href="/tasks">进入任务管理中心</a></div>
      <div className="planning-task-grid">{data.plans.filter((plan) => plan.task_id).map((plan) => <article key={plan.plan_id}><span>{plan.task_status || "idea"}</span><strong>{plan.task_title}</strong><p>任务来源：AI内容策划</p><small>来源热点：{plan.topic_name}</small></article>)}{!data.plans.some((plan) => plan.task_id) && <div className="empty-monitor-state">暂无由AI内容策划生成的任务。</div>}</div>
    </section>

    <section className="panel publish-link-panel">
      <div className="panel-heading"><div><span className="section-kicker">PUBLISH LINK</span><h2>发布效果</h2></div><span className="section-note">关联现有 social_posts，作品会继续进入内容监测中心</span></div>
      <div className="publish-link-list">{data.plans.filter((plan) => plan.task_id).map((plan) => <article key={plan.plan_id}><div><span>{plan.post_title ? "已关联作品" : "等待发布关联"}</span><strong>{plan.title}</strong><small>{plan.post_title || "任务完成后选择对应抖音作品"}</small></div>{plan.post_title ? <div className="published-metrics"><span>播放 {formatCompact(plan.views ?? 0)}</span><span>赞 {formatCompact(plan.likes ?? 0)}</span><span>评 {formatCompact(plan.comments ?? 0)}</span><span>藏 {formatCompact(plan.favorites ?? 0)}</span><span>转 {formatCompact(plan.shares ?? 0)}</span></div> : <select aria-label={`关联${plan.title}作品`} defaultValue="" onChange={(event) => event.target.value && void run("link_post", { planId: plan.plan_id, postId: Number(event.target.value) }, "作品已关联，将进入内容监测和7日复盘", 3)}><option value="">选择已发布作品</option>{data.availablePosts.map((post) => <option key={post.id} value={post.id}>{post.publish_time.slice(0, 10)} · {post.title}</option>)}</select>}</article>)}{!data.plans.some((plan) => plan.task_id) && <div className="empty-monitor-state">先生成内容任务，再关联发布作品。</div>}</div>
    </section>

    <section className="panel planning-review-panel">
      <div className="panel-heading"><div><span className="section-kicker">7-DAY AI REVIEW</span><h2>AI复盘</h2></div><button className="secondary-button" onClick={() => void run("refresh_feedback", {}, "复盘数据已刷新", 4)} disabled={Boolean(busy)}>刷新7日复盘</button></div>
      <div className="planning-review-grid">{data.plans.filter((plan) => plan.related_post_id).map((plan) => <article key={plan.plan_id} className={plan.effect_score !== null ? "reviewed" : "pending"}><span>{plan.effect_score !== null ? "复盘完成" : plan.review_due ? "待生成复盘" : "发布未满7日"}</span><h3>{plan.post_title}</h3>{plan.effect_score !== null ? <><strong>{Math.round(plan.effect_score)}分</strong><p>{plan.ai_summary}</p><small>复盘时间：{formatDate(plan.evaluated_at || "")}</small></> : <p>目标：播放 {formatCompact(plan.target_views)} · 互动率 {plan.target_interaction_rate}% · 涨粉 +{plan.target_fans_growth}</p>}</article>)}{!data.plans.some((plan) => plan.related_post_id) && <div className="empty-monitor-state">关联发布作品后，满7天将自动生成AI复盘报告。</div>}</div>
    </section>

    <p className="analysis-disclaimer">数据来源：hot_topics、hot_topic_analysis、hot_topic_feedback、social_posts、collection_logs、content_tasks · 最近作品采集：{data.collectionFreshness?.collected_at ? formatDate(data.collectionFreshness.collected_at) : "暂无记录"} · 更新时间：{formatDate(data.updatedAt)} · V1.0仅支持抖音。</p>
  </div>;
}
