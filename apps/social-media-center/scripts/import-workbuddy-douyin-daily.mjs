import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const filePath = join(homedir(), "Desktop", "新媒体内容监测", "抖音", "douyin_daily_monitor_20260821.json");
const baseUrl = process.env.SOCIAL_CENTER_URL ?? "http://localhost:3000";
const confirmed = process.argv.includes("--confirm");
const raw = await readFile(filePath);
const info = await stat(filePath);
const parsed = JSON.parse(raw.toString("utf8"));
if (parsed.schema !== "douyin_daily_monitor_v2.2" || parsed.collection_date !== "2026-08-21") {
  throw new Error("目标文件不是 2026-08-21 的 WorkBuddy 日监测 V2.2 正式批次");
}
const checksum = createHash("sha256").update(raw).digest("hex");
const headers = {
  "content-type": "application/json",
  "x-source-file": basename(filePath),
  "x-source-path-encoded": encodeURIComponent(filePath),
  "x-source-checksum": checksum,
};
const request = async (endpoint) => {
  const response = await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers, body: raw });
  const body = await response.json();
  return { status: response.status, ok: response.ok, body };
};

console.log(JSON.stringify({ fileName: basename(filePath), fullPath: filePath, fileSize: info.size, checksum,
  collectionDate: parsed.collection_date, collectionTime: parsed.collection_time,
  collectionBatch: parsed.collection_batch, counts: {
    newPosts: parsed.new_posts?.length ?? 0, monitoredPosts: parsed.monitored_posts?.length ?? 0,
    privatePosts: parsed.private_posts?.length ?? 0, expiredPosts: parsed.expired_posts?.length ?? 0,
    failedPosts: parsed.failed_posts?.length ?? 0,
  } }, null, 2));
const preview = await request("/api/collections/posts-daily-v2-2");
console.log(JSON.stringify({ preview }, null, 2));
if (!preview.ok) process.exit(preview.status === 409 ? 2 : 1);
if (confirmed) {
  const result = await request("/api/collections/posts-daily-v2-2/confirm?confirmed=true");
  console.log(JSON.stringify({ importResult: result }, null, 2));
  if (!result.ok) process.exit(1);
}
