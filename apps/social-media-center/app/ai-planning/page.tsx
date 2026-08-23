import { DateRangeSelector } from "@/components/v2/DateRangeSelector";
import { DataStatusBadge } from "@/components/v2/DataStatusBadge";
import { EmptyState } from "@/components/v2/EmptyState";
import { V2PageHeader } from "@/components/v2/V2PageHeader";

const platforms = ["抖音", "快手", "微博"];
const areas = [
  { title: "平台选择", description: "统一使用platform参数区分策划上下文，不建立三套AI系统。" },
  { title: "生成脚本", description: "预留选题、标题、脚本、前三秒设计、分镜、拍摄方式和话题建议。" },
  { title: "复盘效果", description: "预留选题、任务、发布作品与内容效果评价的完整关联。" },
];

export default async function AiPlanningV2Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const platform = typeof query.platform === "string" ? query.platform : null;
  const hotTopicId = typeof query.hot_topic_id === "string" ? query.hot_topic_id : null;
  const analysisId = typeof query.hot_topic_analysis_id === "string" ? query.hot_topic_analysis_id : null;
  const hasDouyinContext = platform === "douyin" && Boolean(hotTopicId);
  return <div className="page-stack v2-page">
    <DateRangeSelector />
    <V2PageHeader eyebrow="UNIFIED AI PLANNING" title="AI内容策划中心" description="三个平台共用一套策划主链；平台运营中心只传递platform与hot_topic_id。" aside={<DataStatusBadge status="legacy" />} />
    <section className={`v2-platform-selector-shell ${hasDouyinContext ? "has-topic-context" : ""}`} aria-label="策划平台选择">
      <span>策划平台</span>
      <div>{platforms.map((item) => <button className={item === "抖音" && platform === "douyin" ? "active" : ""} disabled key={item}>{item}</button>)}</div>
      <small>{hasDouyinContext ? `已接收抖音热点 #${hotTopicId}${analysisId ? ` · 分析 #${analysisId}` : ""}` : "请选择平台运营中心中的真实热点进入策划。"}</small>
    </section>
    <section className="v2-structured-area-grid">
      {areas.map((area, index) => <article className="panel" key={area.title}>
        <span>0{index + 1}</span>
        <h2>{area.title}</h2>
        <p>{area.description}</p>
      </article>)}
    </section>
    <EmptyState title={hasDouyinContext ? "抖音选题上下文已就绪" : "策划业务尚未迁移到V2容器"} description={hasDouyinContext ? "当前页面已接收平台、热点和分析编号；完整方案继续复用现有content_plans主链。" : "现有content_plans及效果复盘逻辑保持不变，后续阶段只做挂接。"} action={<a className="v2-secondary-link" href={hotTopicId ? `/content-planning?platform=douyin&hot_topic_id=${encodeURIComponent(hotTopicId)}` : "/content-planning"}>访问现有AI内容策划中心</a>} />
  </div>;
}
