import { DateRangeSelector } from "@/components/v2/DateRangeSelector";
import { DataStatusBadge } from "@/components/v2/DataStatusBadge";
import { EmptyState } from "@/components/v2/EmptyState";
import { V2PageHeader } from "@/components/v2/V2PageHeader";

export default function ReportsV2Page() {
  return <div className="page-stack v2-page">
    <DateRangeSelector />
    <V2PageHeader eyebrow="PERFORMANCE REPORTS" title="报表中心" description="汇总平台表现、内容效果、粉丝变化、热点使用、AI策划与任务完成情况。" aside={<DataStatusBadge status="unavailable" />} />
    <section className="v2-report-type-grid">
      <article className="panel"><span>WEEKLY</span><h2>周报</h2><p>预留生成报告、历史报告和下载/导出入口。</p><button disabled>等待业务接入</button></article>
      <article className="panel"><span>MONTHLY</span><h2>月报</h2><p>预留跨平台月度经营结果与行动复盘入口。</p><button disabled>等待业务接入</button></article>
    </section>
    <EmptyState title="暂无V2报表" description="本阶段不重新设计报表计算逻辑，也不生成模拟周报或月报。" />
  </div>;
}
