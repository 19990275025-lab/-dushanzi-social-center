import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "新媒体运营驾驶舱｜独山子大峡谷 AI 营销中台",
    template: "%s｜新媒体运营中心",
  },
  description: "独山子大峡谷抖音、快手和微博内容运营数据中心。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
