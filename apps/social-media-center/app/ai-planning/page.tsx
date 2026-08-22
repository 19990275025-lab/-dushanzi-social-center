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

export default function AiPlanningV2Page() {
  return <div className="page-stack v2-page">
    <DateRangeSelector />
    <V2PageHeader eyebrow="UNIFIED AI PLANNING" title="AI内容策划中心" description="三个平台共用一套策划主链；平台运营中心只传递platform与hot_topic_id。" aside={<DataStatusBadge status="legacy" />} />
    <section className="v2-platform-selector-shell" aria-label="策划平台选择">
      <span>策划平台</span>
      <div>{platforms.map((platform) => <button disabled key={platform}>{platform}</button>)}</div>
      <small>阶段1仅建立容器，平台交互将在业务迁移阶段启用。</small>
    </section>
    <section className="v2-structured-area-grid">
      {areas.map((area, index) => <article className="panel" key={area.title}>
        <span>0{index + 1}</span>
        <h2>{area.title}</h2>
        <p>{area.description}</p>
      </article>)}
    </section>
    <EmptyState title="策划业务尚未迁移到V2容器" description="现有content_plans及效果复盘逻辑保持不变，后续阶段只做挂接。" action={<a className="v2-secondary-link" href="/content-planning">访问现有AI内容策划中心</a>} />
  </div>;
}
