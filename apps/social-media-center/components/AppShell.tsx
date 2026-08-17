"use client";

import { useSyncExternalStore } from "react";
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useSyncExternalStore(
    () => () => undefined,
    () => window.location.pathname,
    () => "",
  );
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
            const active = pathname === item.href
              || (item.href === "/insights/content" && pathname.startsWith("/insights/content/"))
              || (item.href === "/collector" && pathname === "/imports");
            return (
              <a className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.href}>
                <span>{item.code}</span>
                {item.label}
              </a>
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
