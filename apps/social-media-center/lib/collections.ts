import { validateImportRows, type ImportPostRow } from "@/lib/imports";

export const collectionPlatforms = ["douyin"] as const;
export type CollectionPlatform = (typeof collectionPlatforms)[number];

export type CollectedPostRow = ImportPostRow & {
  contentType: "video" | "image_text" | "live";
  videoUrl: string;
  coverUrl: string;
  hashtags: string[];
  duration: number | null;
};

export type CollectionPayload = {
  schemaVersion: "1.0";
  source: "chrome-extension";
  platform: CollectionPlatform;
  collectedAt: string;
  pageUrl: string;
  collectionRange?: { start: string; end: string };
  progress?: { processed: number; total: number; percent: number; stage: string };
  failures?: { target: string; reason: string }[];
  rows: CollectedPostRow[];
};

export type CollectionValidationError = {
  rowNumber: number;
  field: string;
  message: string;
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateCollectionPayload(payload: CollectionPayload) {
  const errors: CollectionValidationError[] = [];

  if (payload.schemaVersion !== "1.0") {
    errors.push({ rowNumber: 0, field: "schemaVersion", message: "采集文件版本不受支持" });
  }
  if (payload.source !== "chrome-extension") {
    errors.push({ rowNumber: 0, field: "source", message: "采集来源无效" });
  }
  if (payload.platform !== "douyin") {
    errors.push({ rowNumber: 0, field: "platform", message: "V1.0 仅支持抖音自动采集" });
  }
  if (!payload.collectedAt || Number.isNaN(Date.parse(payload.collectedAt))) {
    errors.push({ rowNumber: 0, field: "collectedAt", message: "采集时间格式无效" });
  }
  if (!isHttpUrl(payload.pageUrl) || !new URL(payload.pageUrl).hostname.endsWith("douyin.com")) {
    errors.push({ rowNumber: 0, field: "pageUrl", message: "采集页面必须属于 douyin.com" });
  }
  if (payload.collectionRange && (
    Number.isNaN(Date.parse(payload.collectionRange.start))
    || Number.isNaN(Date.parse(payload.collectionRange.end))
    || Date.parse(payload.collectionRange.start) > Date.parse(payload.collectionRange.end)
  )) errors.push({ rowNumber: 0, field: "collectionRange", message: "采集日期范围无效" });
  if (payload.progress && (
    !Number.isInteger(payload.progress.processed)
    || !Number.isInteger(payload.progress.total)
    || payload.progress.processed < 0
    || payload.progress.total < payload.progress.processed
    || payload.progress.percent < 0
    || payload.progress.percent > 100
  )) errors.push({ rowNumber: 0, field: "progress", message: "采集进度无效" });

  const baseErrors = validateImportRows(payload.rows, payload.platform);
  errors.push(
    ...baseErrors.map((error) => ({
      rowNumber: error.rowNumber,
      field: "row",
      message: error.message,
    })),
  );

  for (const row of payload.rows) {
    if (!(["video", "image_text", "live"] as string[]).includes(row.contentType)) {
      errors.push({ rowNumber: row.rowNumber, field: "contentType", message: "内容类型无效" });
    }
    if (!row.videoUrl || !isHttpUrl(row.videoUrl)) {
      errors.push({ rowNumber: row.rowNumber, field: "videoUrl", message: "作品链接无效" });
    } else if (!new URL(row.videoUrl).hostname.endsWith("douyin.com")) {
      errors.push({ rowNumber: row.rowNumber, field: "videoUrl", message: "作品链接必须属于 douyin.com" });
    }
    if (row.coverUrl && !isHttpUrl(row.coverUrl)) {
      errors.push({ rowNumber: row.rowNumber, field: "coverUrl", message: "封面链接无效" });
    }
    if (row.duration !== null && (!Number.isInteger(row.duration) || row.duration < 0)) {
      errors.push({ rowNumber: row.rowNumber, field: "duration", message: "时长必须为非负整数秒" });
    }
    if (!Array.isArray(row.hashtags) || row.hashtags.some((tag) => typeof tag !== "string")) {
      errors.push({ rowNumber: row.rowNumber, field: "hashtags", message: "标签格式无效" });
    }
  }

  return errors;
}

export function normalizeCollectionPayload(value: unknown): CollectionPayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.rows)) return null;

  return {
    schemaVersion: String(raw.schemaVersion ?? "") as "1.0",
    source: String(raw.source ?? "") as "chrome-extension",
    platform: String(raw.platform ?? "") as CollectionPlatform,
    collectedAt: String(raw.collectedAt ?? ""),
    pageUrl: String(raw.pageUrl ?? ""),
    collectionRange: raw.collectionRange && typeof raw.collectionRange === "object" ? {
      start: String((raw.collectionRange as Record<string, unknown>).start ?? ""),
      end: String((raw.collectionRange as Record<string, unknown>).end ?? ""),
    } : undefined,
    progress: raw.progress && typeof raw.progress === "object" ? {
      processed: Number((raw.progress as Record<string, unknown>).processed),
      total: Number((raw.progress as Record<string, unknown>).total),
      percent: Number((raw.progress as Record<string, unknown>).percent),
      stage: String((raw.progress as Record<string, unknown>).stage ?? ""),
    } : undefined,
    failures: Array.isArray(raw.failures) ? raw.failures.slice(0, 200).map((item) => {
      const failure = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return { target: String(failure.target ?? "").slice(0, 500), reason: String(failure.reason ?? "").slice(0, 1000) };
    }).filter((item) => item.target && item.reason) : [],
    rows: raw.rows.slice(0, 201).map((item, index) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const integer = (field: string) => Number(row[field]);
      return {
        rowNumber: Number.isInteger(Number(row.rowNumber)) ? Number(row.rowNumber) : index + 1,
        platform: String(row.platform ?? raw.platform ?? ""),
        title: String(row.title ?? "").trim(),
        publishTime: String(row.publishTime ?? ""),
        contentType: String(row.contentType ?? "video") as CollectedPostRow["contentType"],
        videoUrl: String(row.videoUrl ?? ""),
        coverUrl: String(row.coverUrl ?? ""),
        views: integer("views"),
        likes: integer("likes"),
        comments: integer("comments"),
        favorites: integer("favorites"),
        shares: integer("shares"),
        fansGrowth: integer("fansGrowth"),
        hashtags: Array.isArray(row.hashtags) ? row.hashtags.map(String).slice(0, 30) : [],
        duration: row.duration === null || row.duration === "" || row.duration === undefined
          ? null
          : Number(row.duration),
      };
    }),
  };
}
