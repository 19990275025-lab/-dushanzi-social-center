import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  WORKBUDDY_V2_SOURCE,
  buildWorkBuddyV2Records,
  groupWorkBuddyV2Batches,
} from "../lib/workbuddy-v2-adapter.ts";

const sourceDirectory = process.env.WORKBUDDY_HOT_TOPIC_DIR
  || join(homedir(), "Desktop", "景区AI营销数据", "hot_topics");
const apiBaseUrl = (process.env.WORKBUDDY_API_BASE_URL
  || "https://dushanzi-social-center.pink-raven-4682.chatgpt.site").replace(/\/$/, "");
const confirm = process.argv.includes("--confirm");
const dryRun = process.argv.includes("--dry-run");
const overwriteSameDay = process.argv.includes("--overwrite-same-day");
const skipSameDay = process.argv.includes("--skip-same-day");
if (overwriteSameDay && skipSameDay) throw new Error("同日数据处理方式只能选择覆盖或跳过其中一种");
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Number(limitArgument?.split("=")[1] ?? 500);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit必须是1至500之间的整数");

const files = (await readdir(sourceDirectory)).filter((name) => /^hot_topic_\d{8}\.json$/.test(name)).sort();
const latestFile = files.at(-1);
if (!latestFile) throw new Error(`未找到WorkBuddy热点文件：${sourceDirectory}`);
const filePath = join(sourceDirectory, latestFile);
const fileInfo = await stat(filePath);
const raw = JSON.parse(await readFile(filePath, "utf8"));
if (!Array.isArray(raw)) throw new Error(`${latestFile}顶层必须是数组`);

const collectedAt = fileInfo.mtime.toISOString();
const converted = buildWorkBuddyV2Records(raw, collectedAt, limit);
if (converted.errors.length) {
  console.log(JSON.stringify({ latestFile, ...converted, status: "mapping_failed" }, null, 2));
  process.exitCode = 1;
} else if (dryRun) {
  console.log(JSON.stringify({
    latestFile,
    source: WORKBUDDY_V2_SOURCE,
    requestedCount: converted.requestedCount,
    mappedCount: converted.records.length,
    batches: groupWorkBuddyV2Batches(converted.records, collectedAt),
    previewOnly: true,
  }, null, 2));
} else {
  const headers = { "content-type": "application/json" };
  if (process.env.WORKBUDDY_AGENT_KEY) headers["x-collector-key"] = process.env.WORKBUDDY_AGENT_KEY;
  if (process.env.WORKBUDDY_SITES_BEARER_TOKEN) {
    headers["OAI-Sites-Authorization"] = `Bearer ${process.env.WORKBUDDY_SITES_BEARER_TOKEN}`;
  }

  async function requestJson(path, init = {}) {
    const requestHeaders = { ...headers, ...init.headers };
    const args = ["--silent", "--show-error", "--location", "--max-time", "30", "--request", init.method || "GET"];
    for (const [name, headerValue] of Object.entries(requestHeaders)) args.push("--header", `${name}: ${headerValue}`);
    if (init.body !== undefined) args.push("--data-binary", "@-");
    args.push("--write-out", "\n%{http_code}", `${apiBaseUrl}${path}`);
    const output = await new Promise((resolve, reject) => {
      const process = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      process.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      process.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      process.on("error", reject);
      process.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `HTTPS请求失败：${code}`)));
      process.stdin.end(init.body ?? "");
    });
    const separator = output.lastIndexOf("\n");
    const status = Number(output.slice(separator + 1));
    const body = output.slice(0, separator);
    let result = {};
    try { result = JSON.parse(body); } catch { /* 非JSON错误页由状态码处理 */ }
    if (status < 200 || status >= 300) throw new Error(result.error || `请求失败：HTTP ${status}`);
    return result;
  }

  const batches = [];
  for (const payload of groupWorkBuddyV2Batches(converted.records, collectedAt)) {
    const received = await requestJson("/api/data-collection/v2/receive", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const preview = await requestJson(`/api/data-collection/v2/preview?id=${received.batchId}&page_size=100`);
    const previewErrors = preview.records.filter((record) => record.validationStatus !== "valid");
    if (preview.records.length !== payload.records.length || previewErrors.length) {
      throw new Error(`批次${received.batchId}预览校验失败`);
    }
    let confirmation = null;
    if (confirm) {
      if (received.requiresDuplicateDecision && !overwriteSameDay && !skipSameDay) {
        throw new Error(`批次${received.batchId}同日已有${received.sameDayExistingCount}条数据，请增加--overwrite-same-day或--skip-same-day`);
      }
      confirmation = await requestJson(`/api/data-collection/v2/confirm?id=${received.batchId}`, {
        method: "POST",
        body: JSON.stringify({
          confirmed: true,
          duplicate_mode: overwriteSameDay ? "overwrite" : skipSameDay ? "skip" : undefined,
        }),
      });
    }
    batches.push({
      batchId: received.batchId,
      platform: payload.platform,
      receivedCount: received.totalCount,
      previewCount: preview.records.length,
      previewErrors: previewErrors.length,
      sameDayDates: received.sameDayDates,
      sameDayExistingCount: received.sameDayExistingCount,
      confirmation,
    });
  }

  let visibleCount = 0;
  if (confirm) {
    const dashboard = await requestJson("/api/hot-topics?platform=all");
    const expected = new Set(converted.records.map((record) => record.topic_name));
    visibleCount = dashboard.topics.filter((topic) => expected.has(topic.topic_name) && topic.source === WORKBUDDY_V2_SOURCE).length;
  }
  console.log(JSON.stringify({
    latestFile,
    source: WORKBUDDY_V2_SOURCE,
    receivedCount: batches.reduce((sum, batch) => sum + batch.receivedCount, 0),
    previewCount: batches.reduce((sum, batch) => sum + batch.previewCount, 0),
    successCount: batches.reduce((sum, batch) => sum + (batch.confirmation?.writtenCount ?? 0), 0),
    insertedCount: batches.reduce((sum, batch) => sum + (batch.confirmation?.insertedCount ?? 0), 0),
    updatedCount: batches.reduce((sum, batch) => sum + (batch.confirmation?.updatedCount ?? 0), 0),
    aiRecommendedCount: batches.reduce((sum, batch) => sum + (batch.confirmation?.aiRecommendedCount ?? 0), 0),
    failedCount: batches.reduce((sum, batch) => sum + batch.previewErrors, 0),
    visibleInHotTopicCenter: visibleCount,
    confirmed: confirm,
    batches,
  }, null, 2));
}
