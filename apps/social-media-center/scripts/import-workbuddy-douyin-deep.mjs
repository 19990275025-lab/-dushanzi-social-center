import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const sourceDirectory = join(homedir(), "Desktop", "新媒体内容监测", "抖音");
const baseUrl = process.env.SOCIAL_CENTER_URL ?? "http://localhost:3000";
const confirmed = process.argv.includes("--confirm");

function collectionTime(data) {
  const values = [
    data?.collection_info?.collection_time,
    data?.file_info?.generated_at,
    ...((Array.isArray(data?.posts) ? data.posts : []).map((post) => post?.collection_time)),
  ].filter((value) => typeof value === "string" && value.trim());
  return values.map((value) => ({ value, time: Date.parse(value.replace(" ", "T") + (/Z$|[+-]\d{2}:?\d{2}$/.test(value) ? "" : "+08:00")) }))
    .filter((item) => Number.isFinite(item.time)).sort((a, b) => b.time - a.time)[0]?.value ?? null;
}

function completeness(data) {
  const checks = (Array.isArray(data?.posts) ? data.posts : []).flatMap((post) => Object.values(post?.checklist ?? {}));
  if (!checks.length) return 0;
  const score = checks.reduce((sum, item) => sum + (item?.status === "completed" ? 1 : item?.status === "partial" ? 0.5 : 0), 0);
  return Number(((score / checks.length) * 100).toFixed(2));
}

async function candidates() {
  const names = (await readdir(sourceDirectory)).filter((name) => /^douyin_posts_deep_.*\.json$/i.test(name));
  const rows = [];
  for (const name of names) {
    const fullPath = join(sourceDirectory, name);
    const info = await stat(fullPath);
    const raw = await readFile(fullPath);
    let data = null;
    let parseError = null;
    try { data = JSON.parse(raw.toString("utf8")); }
    catch (error) { parseError = error instanceof Error ? error.message : "JSON parse failed"; }
    rows.push({
      name, fullPath, size: info.size, modifiedAt: info.mtime.toISOString(), raw, data, parseError,
      checksum: createHash("sha256").update(raw).digest("hex"),
      collectionTime: data ? collectionTime(data) : null,
      collectionDate: data?.collection_info?.collection_date ?? data?.file_info?.generated_at?.slice?.(0, 10) ?? null,
      collectionBatch: data?.collection_info?.collection_batch ?? null,
      actualPosts: Array.isArray(data?.posts) ? data.posts.length : 0,
      completeness: data ? completeness(data) : 0,
      structurallyComplete: Boolean(data?.collection_info && data?.summary && Array.isArray(data?.posts) && data.posts.length),
    });
  }
  return rows.sort((a, b) =>
    (Date.parse(b.collectionTime ?? "") || 0) - (Date.parse(a.collectionTime ?? "") || 0) ||
    b.completeness - a.completeness || b.actualPosts - a.actualPosts,
  );
}

async function send(candidate, endpoint) {
  return fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-source-file": basename(candidate.fullPath),
      "x-source-path-encoded": encodeURIComponent(candidate.fullPath),
      "x-source-checksum": candidate.checksum,
    },
    body: candidate.raw,
  });
}

const rows = await candidates();
console.log(JSON.stringify({ sourceDirectory, candidates: rows.map((row) => ({
  name: row.name, fullPath: row.fullPath, size: row.size, modifiedAt: row.modifiedAt,
  parseError: row.parseError, checksum: row.checksum, collectionTime: row.collectionTime,
  collectionDate: row.collectionDate, collectionBatch: row.collectionBatch,
  actualPosts: row.actualPosts, completeness: row.completeness,
  structurallyComplete: row.structurallyComplete,
})) }, null, 2));
if (!rows.length) throw new Error(`未在 ${sourceDirectory} 找到 douyin_posts_deep_*.json`);

let selected = null;
let preview = null;
for (const candidate of rows.filter((item) => !item.parseError && item.structurallyComplete)) {
  const response = await send(candidate, "/api/collections/posts-deep-v2-1");
  const body = await response.json();
  if (response.status === 409 && body?.completedFile) continue;
  if (!response.ok) throw new Error(`预览失败 ${response.status}: ${JSON.stringify(body)}`);
  selected = candidate;
  preview = body;
  break;
}
if (!selected || !preview) throw new Error("没有完整且尚未成功处理的 WorkBuddy 深度作品文件");
console.log(JSON.stringify({ selected: { fileName: selected.name, fullPath: selected.fullPath, checksum: selected.checksum }, preview }, null, 2));

if (confirmed) {
  const response = await send(selected, "/api/collections/posts-deep-v2-1/confirm?confirmed=true");
  const body = await response.json();
  if (!response.ok) throw new Error(`确认入库失败 ${response.status}: ${JSON.stringify(body)}`);
  console.log(JSON.stringify({ importResult: body }, null, 2));
}
