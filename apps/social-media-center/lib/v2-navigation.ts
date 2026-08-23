export const platformDefinitions = {
  douyin: {
    route: "douyin",
    label: "抖音",
    description: "短视频内容增长、粉丝洞察与热点机会统一观察。",
    dataState: "ready",
    sections: ["fans", "content", "hot-topics", "ai-topics"],
  },
  kuaishou: {
    route: "kuaishou",
    label: "快手",
    description: "为快手内容、互动与直播运营预留独立业务空间。",
    dataState: "connecting",
    sections: ["fans", "content", "hot-topics", "ai-topics"],
  },
  weibo: {
    route: "weibo",
    label: "微博",
    description: "聚合品牌传播、热点响应与粉丝规模变化。",
    dataState: "connecting",
    sections: ["fans", "content", "hot-topics", "ai-topics"],
  },
  video_account: {
    route: "video-account",
    label: "视频号",
    description: "为视频号粉丝与内容监测预留平台隔离容器。",
    dataState: "unavailable",
    sections: ["fans", "content"],
  },
} as const;

export type V2Platform = keyof typeof platformDefinitions;
export type PlatformSection = "home" | "fans" | "content" | "hot-topics" | "ai-topics";

export const platformSections = {
  fans: { label: "粉丝分析", summary: "查看粉丝规模、增长与平台实际提供的画像。" },
  content: { label: "内容监测及诊断", summary: "查看作品表现、内容评分与改进方向。" },
  "hot-topics": { label: "热点监测", summary: "从平台热点中识别可跟进的内容机会。" },
  "ai-topics": { label: "AI选题推荐", summary: "将平台和热点上下文传递至统一AI内容策划中心。" },
} as const;

export function platformFromRoute(route: string): V2Platform | null {
  return (Object.entries(platformDefinitions).find(([, definition]) => definition.route === route)?.[0] as V2Platform | undefined) ?? null;
}

export function platformLegacyHref(platform: V2Platform, section: PlatformSection) {
  if (platform !== "douyin") return null;
  if (section === "fans") return "/insights/fans?platform=douyin";
  if (section === "content") return "/insights/content?platform=douyin";
  if (section === "hot-topics") return "/hot-topics?platform=douyin";
  if (section === "ai-topics") return "/ai-planning?platform=douyin";
  return null;
}
