import type { ReactNode } from "react";
import { DateRangeSelector } from "@/components/v2/DateRangeSelector";
import { DataStatusBadge } from "@/components/v2/DataStatusBadge";
import { V2PageHeader } from "@/components/v2/V2PageHeader";
import { platformDefinitions, platformSections, type PlatformSection, type V2Platform } from "@/lib/v2-navigation";

export function PlatformHeader({ platform }: { platform: V2Platform }) {
  const definition = platformDefinitions[platform];
  return <V2PageHeader
    eyebrow={`${definition.label.toUpperCase()} OPERATION CENTER`}
    title={`${definition.label}运营中心`}
    description={definition.description}
    aside={<DataStatusBadge status={definition.dataState} />}
  />;
}

export function PlatformTabs({ platform, activeSection }: { platform: V2Platform; activeSection: PlatformSection }) {
  const definition = platformDefinitions[platform];
  return <nav className="v2-platform-tabs" aria-label={`${definition.label}运营中心二级导航`}>
    {definition.sections.map((section) => <a
      aria-current={activeSection === section ? "page" : undefined}
      className={activeSection === section ? "active" : ""}
      href={`/platform/${definition.route}/${section}`}
      key={section}
    >{platformSections[section].label}</a>)}
  </nav>;
}

export function PlatformLayout({ platform, activeSection, children }: {
  platform: V2Platform;
  activeSection: PlatformSection;
  children: ReactNode;
}) {
  return <div className={`page-stack v2-page v2-platform-page platform-${platform}`}>
    <DateRangeSelector />
    <PlatformHeader platform={platform} />
    <PlatformTabs platform={platform} activeSection={activeSection} />
    {children}
  </div>;
}
