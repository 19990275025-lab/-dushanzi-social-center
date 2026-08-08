export type CollectedCommentRow = {
  rowNumber: number;
  postUrl: string;
  username: string;
  commentText: string;
  commentTime: string;
  likes: number;
};

export type CommentCollectionPayload = {
  schemaVersion: "1.0";
  source: "chrome-extension";
  entityType: "comment";
  platform: "douyin";
  collectedAt: string;
  pageUrl: string;
  rows: CollectedCommentRow[];
};

export type CommentCollectionValidationError = {
  rowNumber: number;
  field: string;
  message: string;
};

function isDouyinVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("douyin.com") && /\/(video|note)\//.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeCommentCollectionPayload(value: unknown): CommentCollectionPayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.rows)) return null;

  return {
    schemaVersion: String(raw.schemaVersion ?? "") as "1.0",
    source: String(raw.source ?? "") as "chrome-extension",
    entityType: String(raw.entityType ?? "") as "comment",
    platform: String(raw.platform ?? "") as "douyin",
    collectedAt: String(raw.collectedAt ?? ""),
    pageUrl: String(raw.pageUrl ?? ""),
    rows: raw.rows.slice(0, 150).map((item, index) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return {
        rowNumber: Number.isInteger(Number(row.rowNumber)) ? Number(row.rowNumber) : index + 1,
        postUrl: String(row.postUrl ?? "").trim(),
        username: String(row.username ?? "").trim(),
        commentText: String(row.commentText ?? "").trim(),
        commentTime: String(row.commentTime ?? ""),
        likes: Number(row.likes),
      };
    }),
  };
}

export function validateCommentCollectionPayload(payload: CommentCollectionPayload) {
  const errors: CommentCollectionValidationError[] = [];
  if (payload.schemaVersion !== "1.0") errors.push({ rowNumber: 0, field: "schemaVersion", message: "采集文件版本不受支持" });
  if (payload.source !== "chrome-extension") errors.push({ rowNumber: 0, field: "source", message: "采集来源无效" });
  if (payload.entityType !== "comment") errors.push({ rowNumber: 0, field: "entityType", message: "数据类型必须为评论" });
  if (payload.platform !== "douyin") errors.push({ rowNumber: 0, field: "platform", message: "V1.0 仅支持抖音评论" });
  if (!payload.collectedAt || Number.isNaN(Date.parse(payload.collectedAt))) errors.push({ rowNumber: 0, field: "collectedAt", message: "采集时间格式无效" });
  if (!payload.rows.length) errors.push({ rowNumber: 0, field: "rows", message: "采集文件中没有评论" });
  if (payload.rows.length > 150) errors.push({ rowNumber: 0, field: "rows", message: "单批最多采集 3 个作品、每个作品 50 条评论" });

  const perPost = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of payload.rows) {
    if (!isDouyinVideoUrl(row.postUrl)) errors.push({ rowNumber: row.rowNumber, field: "postUrl", message: "作品链接必须为抖音作品详情页" });
    if (!row.username || row.username.length > 200) errors.push({ rowNumber: row.rowNumber, field: "username", message: "用户名不能为空且不能超过 200 字" });
    if (!row.commentText || row.commentText.length > 2000) errors.push({ rowNumber: row.rowNumber, field: "commentText", message: "评论内容不能为空且不能超过 2000 字" });
    if (!row.commentTime || Number.isNaN(Date.parse(row.commentTime))) errors.push({ rowNumber: row.rowNumber, field: "commentTime", message: "评论时间格式无效" });
    if (!Number.isInteger(row.likes) || row.likes < 0) errors.push({ rowNumber: row.rowNumber, field: "likes", message: "评论点赞数必须为非负整数" });

    const count = (perPost.get(row.postUrl) ?? 0) + 1;
    perPost.set(row.postUrl, count);
    if (count > 50) errors.push({ rowNumber: row.rowNumber, field: "postUrl", message: "单个作品最多采集 50 条评论" });

    const fingerprint = `${row.postUrl}\n${row.username.toLocaleLowerCase("zh-CN")}\n${row.commentText}\n${row.commentTime}`;
    if (seen.has(fingerprint)) errors.push({ rowNumber: row.rowNumber, field: "commentText", message: "采集文件内评论重复" });
    seen.add(fingerprint);
  }
  return errors;
}
