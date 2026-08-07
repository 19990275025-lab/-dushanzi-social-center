export const supportedPlatforms = [
  "douyin",
  "kuaishou",
  "weibo",
  "wechat_channels",
] as const;

export type SupportedPlatform = (typeof supportedPlatforms)[number];

export type ImportPostRow = {
  rowNumber: number;
  title: string;
  platform: string;
  publishTime: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  fansGrowth: number;
};

export type RowValidationError = {
  rowNumber: number;
  message: string;
};

export function isSupportedPlatform(value: string): value is SupportedPlatform {
  return supportedPlatforms.includes(value as SupportedPlatform);
}

function isNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

export function validateImportRows(rows: ImportPostRow[], selectedPlatform: string) {
  const errors: RowValidationError[] = [];
  const titles = new Set<string>();

  if (!isSupportedPlatform(selectedPlatform)) {
    return [{ rowNumber: 0, message: "导入平台无效" }];
  }
  if (rows.length === 0) {
    return [{ rowNumber: 0, message: "Excel 中没有可导入的数据" }];
  }
  if (rows.length > 200) {
    return [{ rowNumber: 0, message: "单次最多导入 200 条作品" }];
  }

  for (const row of rows) {
    if (!row.title.trim()) errors.push({ rowNumber: row.rowNumber, message: "标题不能为空" });
    if (row.title.length > 500) errors.push({ rowNumber: row.rowNumber, message: "标题不能超过 500 字" });
    if (row.platform !== selectedPlatform) errors.push({ rowNumber: row.rowNumber, message: "平台与页面选择不一致" });
    if (!row.publishTime || Number.isNaN(Date.parse(row.publishTime))) {
      errors.push({ rowNumber: row.rowNumber, message: "发布时间格式无效" });
    }

    for (const [label, value] of [
      ["播放量", row.views],
      ["点赞", row.likes],
      ["评论", row.comments],
      ["收藏", row.favorites],
      ["分享", row.shares],
    ] as const) {
      if (!isNonNegativeInteger(value)) {
        errors.push({ rowNumber: row.rowNumber, message: `${label}必须为非负整数` });
      }
    }
    if (!Number.isInteger(row.fansGrowth)) {
      errors.push({ rowNumber: row.rowNumber, message: "涨粉必须为整数" });
    }

    const normalizedTitle = row.title.trim().toLocaleLowerCase("zh-CN");
    if (normalizedTitle && titles.has(normalizedTitle)) {
      errors.push({ rowNumber: row.rowNumber, message: "文件内作品标题重复" });
    }
    titles.add(normalizedTitle);
  }

  return errors;
}
