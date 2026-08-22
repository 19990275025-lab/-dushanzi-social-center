"use client";

import { useSyncExternalStore } from "react";
import { GlobalDateFilter } from "@/components/GlobalDateFilter";

const navItems = [
  { href: "/overview", label: "总览", code: "01" },
  { href: "/platform/douyin", label: "抖音运营中心", code: "02" },
  { href: "/platform/kuaishou", label: "快手运营中心", code: "03" },
  { href: "/platform/weibo", label: "微博运营中心", code: "04" },
  { href: "/platform/video-account", label: "视频号运营中心", code: "05" },
  { href: "/ai-planning", label: "AI内容策划中心", code: "06" },
  { href: "/task-center", label: "任务中心", code: "07" },
  { href: "/reports", label: "报表中心", code: "08" },
];

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
  const currentUrl = new URL(location || "/", "https://social-center.local");
  const pathname = location ? currentUrl.pathname : "";
  const dateFilterPages = ["/", "/insights/content", "/insights/fans", "/comment-insights", "/ai-analysis"];
  const isHotTopicsPage = pathname === "/hot-topics";

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
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <div className="nav-group" key={item.href}>
                <a aria-current={active ? "page" : undefined} className={active ? "nav-item active" : "nav-item"} href={item.href}>
                  <span>{item.code}</span>
                  {item.label}
                </a>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="system-card">
          <span className="status-dot" />
          <div><strong>系统运行正常</strong><small>数据库实时连接</small></div>
        </div>
        <div className="sidebar-footer">SOCIAL CENTER · V2.0</div>
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
