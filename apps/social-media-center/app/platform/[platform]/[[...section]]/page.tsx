import { EmptyState } from "@/components/v2/EmptyState";
import { DataStatusBadge } from "@/components/v2/DataStatusBadge";
import { DouyinAiTopicsPanel, DouyinHotTopicsPanel } from "@/components/v2/DouyinHotTopicPanels";
import { PlatformLayout } from "@/components/v2/PlatformLayout";
import ContentMonitoringPage from "@/app/insights/content/page";
import FanAnalysisCenterPage from "@/app/insights/fans/page";
import { platformDefinitions, platformFromRoute, platformLegacyHref, platformSections, type PlatformSection } from "@/lib/v2-navigation";

export default async function PlatformCenterPage({ params }: { params: Promise<{ platform: string; section?: string[] }> }) {
  const routeParams = await params;
  const platform = platformFromRoute(routeParams.platform);
  if (!platform) return <div className="error-panel">平台不存在</div>;

  const definition = platformDefinitions[platform];
  const requestedSection = routeParams.section?.[0] as PlatformSection | undefined;
  const activeSection: PlatformSection = requestedSection && definition.sections.includes(requestedSection as never) ? requestedSection : "home";
  const legacyHref = platformLegacyHref(platform, activeSection);

  if (platform === "douyin" && activeSection !== "home") {
    return <PlatformLayout platform={platform} activeSection={activeSection}>
      {activeSection === "fans" && <FanAnalysisCenterPage embedded forcedPlatform="douyin" />}
      {activeSection === "content" && <ContentMonitoringPage embedded forcedPlatform="douyin" />}
      {activeSection === "hot-topics" && <DouyinHotTopicsPanel />}
      {activeSection === "ai-topics" && <DouyinAiTopicsPanel />}
    </PlatformLayout>;
  }

  return <PlatformLayout platform={platform} activeSection={activeSection}>
    {activeSection === "home" ? <section className="v2-module-grid" aria-label={`${definition.label}运营模块`}>
      {definition.sections.map((section) => <a href={`/platform/${definition.route}/${section}`} key={section}>
        <span>{platformSections[section].label}</span>
        <h2>{platformSections[section].summary}</h2>
        <small>{platform === "douyin" ? "复用现有成熟能力" : "页面容器已建立"}</small>
        <b>进入模块 →</b>
      </a>)}
    </section> : <section className="panel v2-platform-module-container">
      <div className="v2-container-heading">
        <div>
          <span>PLATFORM MODULE</span>
          <h2>{definition.label} · {platformSections[activeSection].label}</h2>
          <p>{platformSections[activeSection].summary}</p>
        </div>
        <DataStatusBadge status={legacyHref ? "legacy" : definition.dataState} />
      </div>
      {legacyHref ? <div className="v2-legacy-entry">
        <div>
          <strong>现有成熟功能保持冻结</strong>
          <p>本阶段不复制页面、不改业务接口，仅提供迁移入口。后续阶段完成挂接后再替换此入口。</p>
        </div>
        <a className="v2-primary-link" href={legacyHref}>{activeSection === "ai-topics" ? "进入统一AI策划中心" : "打开现有成熟功能"}</a>
      </div> : <EmptyState
        title={definition.dataState === "connecting" ? "数据接入中" : "暂无真实数据"}
        description={`${definition.label}${platformSections[activeSection].label}容器已建立；不会使用其他平台数据填充。`}
      />}
    </section>}
  </PlatformLayout>;
}
