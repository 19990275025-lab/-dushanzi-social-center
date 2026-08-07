"use client";

import { useSyncExternalStore } from "react";

const navItems = [
  { href: "/", label: "运营驾驶舱", code: "01" },
  { href: "/content", label: "内容分析", code: "02" },
  { href: "/tasks", label: "任务管理", code: "03" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useSyncExternalStore(
    () => () => undefined,
    () => window.location.pathname,
    () => "",
  );

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
            const active = pathname === item.href;
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
        {children}
      </main>
    </div>
  );
}
