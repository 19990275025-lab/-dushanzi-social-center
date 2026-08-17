"use client";

import { useState, useSyncExternalStore } from "react";
import { GlobalDateFilter } from "@/components/GlobalDateFilter";

const navItems = [
  { href: "/marketing-operations", label: "营销运营中心", code: "01" },
  { href: "/", label: "运营驾驶舱", code: "02" },
  { href: "/insights/content", label: "内容监测中心", code: "03" },
  { href: "/insights/fans", label: "粉丝分析中心", code: "04" },
  { href: "/collector", label: "数据采集中心", code: "05" },
  { href: "/hot-topics", label: "热点监测中心", code: "06" },
  { href: "/hot-topic-archive", label: "热点档案库", code: "07" },
  { href: "/content-planning", label: "AI内容策划中心", code: "08" },
  { href: "/ai-analysis", label: "AI内容分析中心", code: "09" },
  { href: "/comment-insights", label: "游客评论洞察中心", code: "10" },
  { href: "/tasks", label: "任务管理中心", code: "11" },
];

const platformSubnav = [
  { value: "douyin", label: "抖音" },
  { value: "kuaishou", label: "快手" },
  { value: "weibo", label: "微博" },
] as const;

const platformNavPaths = new Set(["/insights/content", "/hot-topics"]);

function subscribeLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("platform-navigation", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("platform-navigation", callback);
  };
}

function locationSnapshot() {
  return `${window.location.pathname}${window.location.search}`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useSyncExternalStore(subscribeLocation, locationSnapshot, () => "");
  const [collapsedPlatformMenu, setCollapsedPlatformMenu] = useState<string | null>(null);
  const currentUrl = new URL(location || "/", "https://social-center.local");
  const pathname = currentUrl.pathname;
  const selectedPlatform = platformSubnav.some((item) => item.value === currentUrl.searchParams.get("platform"))
    ? currentUrl.searchParams.get("platform")
    : "douyin";
  const dateFilterPages = ["/", "/insights/content", "/insights/fans", "/comment-insights", "/ai-analysis"];
  const isHotTopicsPage = pathname === "/hot-topics";

  function platformHref(path: string, platform: string) {
    const params = pathname === path ? new URLSearchParams(currentUrl.searchParams) : new URLSearchParams();
    params.set("platform", platform);
    return `${path}?${params.toString()}`;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><span>独</span></div>
          <div><strong>独山子大峡谷</strong><small>AI 营销中台</small></div>
        </div>

        <div className="nav-caption">新媒体运营中心</div>
        <nav aria-label="主要导航">
          {navItems.map((item) => {
            const active = pathname === item.href
              || (item.href === "/insights/content" && pathname.startsWith("/insights/content/"))
              || (item.href === "/collector" && pathname === "/imports");
            const hasPlatformSubnav = platformNavPaths.has(item.href);
            const expanded = active && hasPlatformSubnav && collapsedPlatformMenu !== item.href;
            return (
              <div className={`nav-group ${hasPlatformSubnav ? "platform-nav-group" : ""} ${expanded ? "expanded" : ""}`} key={item.href}>
                <a
                  aria-expanded={hasPlatformSubnav ? expanded : undefined}
                  className={active ? "nav-item active" : "nav-item"}
                  href={hasPlatformSubnav ? platformHref(item.href, "douyin") : item.href}
                  onClick={hasPlatformSubnav && active ? (event) => {
                    event.preventDefault();
                    setCollapsedPlatformMenu((current) => current === item.href ? null : item.href);
                  } : undefined}
                >
                  <span>{item.code}</span>
                  {item.label}
                  {hasPlatformSubnav && <i className={`nav-expand-icon ${expanded ? "expanded" : ""}`} aria-hidden="true">⌄</i>}
                </a>
                {expanded && <div className="platform-subnav" aria-label={`${item.label}平台选择`}>
                  {platformSubnav.map((platform) => <a
                    aria-current={selectedPlatform === platform.value ? "page" : undefined}
                    className={`${selectedPlatform === platform.value ? "active" : ""} platform-${platform.value}`}
                    href={platformHref(item.href, platform.value)}
                    key={platform.value}
                  >{platform.label}</a>)}
                </div>}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="system-card">
          <span className="status-dot" />
          <div><strong>系统运行正常</strong><small>数据库实时连接</small></div>
        </div>
        <div className="sidebar-footer">SOCIAL CENTER · V1.0</div>
      </aside>

      <main className="main-content">
        <div className="mobile-brand">
          <div className="brand-mark"><span>独</span></div>
          <div><strong>新媒体运营中心</strong><small>AI 营销中台</small></div>
        </div>
        {dateFilterPages.includes(pathname) && <GlobalDateFilter />}
        {isHotTopicsPage && <GlobalDateFilter defaultPreset="today" scope="hot-topics" />}
        {children}
      </main>
    </div>
  );
}
