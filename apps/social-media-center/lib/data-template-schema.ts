export const platformNames = ["抖音", "快手", "微博", "视频号"] as const;
export const contentTypeNames = ["视频", "图文", "直播", "文章", "文字"] as const;

export const socialTemplateFields = [
  "平台", "作品标题", "发布时间", "作品链接", "内容类型", "播放量", "点赞量",
  "评论量", "收藏量", "分享量", "涨粉量", "标签", "备注",
] as const;
export const competitorTemplateFields = [
  "平台", "账号名称", "作品标题", "发布时间", "播放量", "点赞", "评论", "收藏", "爆款原因",
] as const;

export const dataTemplates = [
  { key: "douyin", type: "social", platform: "抖音", title: "抖音作品数据采集模板", file: "/templates/douyin-social-posts-template-v1.xlsx", fields: socialTemplateFields },
  { key: "kuaishou", type: "social", platform: "快手", title: "快手作品数据采集模板", file: "/templates/kuaishou-social-posts-template-v1.xlsx", fields: socialTemplateFields },
  { key: "weibo", type: "social", platform: "微博", title: "微博作品数据采集模板", file: "/templates/weibo-social-posts-template-v1.xlsx", fields: socialTemplateFields },
  { key: "wechat_channels", type: "social", platform: "视频号", title: "视频号作品数据采集模板", file: "/templates/wechat-channels-social-posts-template-v1.xlsx", fields: socialTemplateFields },
  { key: "competitor", type: "competitor", platform: "全部平台", title: "竞品账号数据采集模板", file: "/templates/competitor-accounts-template-v1.xlsx", fields: competitorTemplateFields },
] as const;

export const validationRules = [
  { key: "date", label: "日期格式", description: "发布时间使用 Excel 日期或 YYYY-MM-DD HH:mm:ss。" },
  { key: "number", label: "数字格式", description: "播放、点赞、评论、收藏、分享必须是非负整数；涨粉量允许负数。" },
  { key: "platform", label: "平台名称", description: "平台只能填写抖音、快手、微博或视频号；单平台模板必须与模板平台一致。" },
] as const;
