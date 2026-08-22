import { DateRangeSelector } from "@/components/v2/DateRangeSelector";
import { DataStatusBadge } from "@/components/v2/DataStatusBadge";
import { EmptyState } from "@/components/v2/EmptyState";
import { V2PageHeader } from "@/components/v2/V2PageHeader";

export default function TaskCenterV2Page() {
  return <div className="page-stack v2-page">
    <DateRangeSelector />
    <V2PageHeader eyebrow="CONTENT EXECUTION" title="任务中心" description="统一承接抖音、快手、微博经人工确认后的内容执行任务。" aside={<DataStatusBadge status="legacy" />} />
    <section className="panel v2-filter-shell">
      {['平台', '状态', '负责人', '日期'].map((label) => <label key={label}><span>{label}</span><button disabled>全部</button></label>)}
    </section>
    <section className="v2-task-field-grid">
      {['平台', '选题', '话题内容', '策划内容', '负责人', '截止时间', '完成状态', '关联作品'].map((field) => <article key={field}><span>{field}</span><p>字段容器</p></article>)}
    </section>
    <EmptyState title="任务数据暂未挂接到V2容器" description="现有content_tasks及任务关联保持不变，本阶段未修改任务业务逻辑。" action={<a className="v2-secondary-link" href="/tasks">访问现有任务管理中心</a>} />
  </div>;
}
