import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import * as XLSX from "xlsx";
import {
  WORKBUDDY_V2_SOURCE,
  buildWorkBuddyV2Records,
  groupWorkBuddyV2Batches,
} from "../lib/workbuddy-v2-adapter.ts";

const sourceDirectory = process.env.WORKBUDDY_HOT_TOPIC_DIR
  || join(homedir(), "Desktop", "景区AI营销数据", "hot_topics");
const apiBaseUrl = (process.env.WORKBUDDY_API_BASE_URL
  || "https://dushanzi-social-center.pink-raven-4682.chatgpt.site").replace(/\/$/, "");
const selectedFile = process.argv.find((argument) => argument.startsWith("--file="))?.slice(7);
const dryRun = process.argv.includes("--dry-run");

function fileDate(fileName) {
  const match = /^hot_topic_(\d{4})(\d{2})(\d{2})\.(json|xlsx|xls)$/i.exec(fileName);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function todayInBeijing() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function locateFile() {
  const files = (await readdir(sourceDirectory))
    .filter((name) => /^hot_topic_\d{8}\.(json|xlsx|xls)$/i.test(name))
    .sort((a, b) => (fileDate(a) ?? "").localeCompare(fileDate(b) ?? "") || a.localeCompare(b));
  const expectedDate = todayInBeijing();
  const name = selectedFile || files.filter((candidate) => fileDate(candidate) === expectedDate).at(-1);
  if (!name || !files.includes(name)) throw new Error(`未找到WorkBuddy热点文件：${selectedFile || sourceDirectory}`);
  return { name, path: join(sourceDirectory, name), date: fileDate(name) };
}

async function readRows(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".json") {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed?.records ?? parsed?.data ?? parsed?.topics;
    if (!Array.isArray(rows)) throw new Error("JSON顶层必须是数组，或包含records/data/topics数组");
    return rows;
  }
  const workbook = XLSX.read(await readFile(filePath), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Excel文件没有可读取的工作表");
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

const requestHeaders = { "content-type": "application/json" };
if (process.env.WORKBUDDY_AGENT_KEY) requestHeaders["x-collector-key"] = process.env.WORKBUDDY_AGENT_KEY;
if (process.env.WORKBUDDY_SITES_BEARER_TOKEN) {
  requestHeaders["OAI-Sites-Authorization"] = `Bearer ${process.env.WORKBUDDY_SITES_BEARER_TOKEN}`;
}

async function requestJson(path, init = {}) {
  const args = ["--silent", "--show-error", "--location", "--max-time", "180", "--request", init.method || "GET"];
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(?::|\/|$)/i.test(apiBaseUrl)) args.unshift("--noproxy", "*");
  for (const [name, value] of Object.entries({ ...requestHeaders, ...init.headers })) args.push("--header", `${name}: ${value}`);
  if (init.body !== undefined) args.push("--data-binary", "@-");
  args.push("--write-out", "\n%{http_code}", `${apiBaseUrl}${path}`);
  const output = await new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `HTTPS请求失败：${code}`)));
    child.stdin.end(init.body ?? "");
  });
  const separator = output.lastIndexOf("\n");
  const status = Number(output.slice(separator + 1));
  const rawBody = output.slice(0, separator);
  let body = {};
  try { body = JSON.parse(rawBody); } catch { /* 非JSON响应由状态码处理 */ }
  if (status < 200 || status >= 300) {
    const error = new Error(body.error || `请求失败：HTTP ${status}`);
    error.status = status;
    throw error;
  }
  return body;
}

async function failRelay(context, stage, error) {
  if (!context.fileName || !context.fileDate) return;
  try {
    await requestJson("/api/workbuddy-relay", {
      method: "POST",
      body: JSON.stringify({
        action: "fail", relayLogId: context.relayLogId, fileName: context.fileName,
        fileDate: context.fileDate, stage, reason: error instanceof Error ? error.message : String(error),
        originalCount: context.originalCount, standardizedCount: context.standardizedCount,
      }),
    });
  } catch { /* 原始错误优先输出，本地仍保留失败退出码 */ }
}

const context = {
  relayLogId: null,
  fileName: selectedFile || `hot_topic_${todayInBeijing().replaceAll("-", "")}.json`,
  fileDate: selectedFile ? fileDate(selectedFile) : todayInBeijing(),
  originalCount: 0, standardizedCount: 0, stage: "detect",
};

try {
  const file = await locateFile();
  context.fileName = file.name;
  context.fileDate = file.date;
  if (!file.date) throw new Error("WorkBuddy文件名日期无效");
  const rows = await readRows(file.path);
  context.originalCount = rows.length;
  context.stage = "validate";
  if (!rows.length) throw new Error("WorkBuddy热点文件为空");
  const fileInfo = await stat(file.path);
  const collectedAt = `${file.date}T08:00:00+08:00`;
  const converted = buildWorkBuddyV2Records(rows, collectedAt, 500, {
    expectedCollectionDate: file.date,
    requireCollectionTime: true,
    requireTopicType: true,
  });
  context.standardizedCount = converted.records.length;
  if (converted.requestedCount !== rows.length) throw new Error("单个热点文件超过500条安全上限");
  if (converted.errors.length || converted.records.length !== rows.length) {
    const details = converted.errors.slice(0, 20).map((item) => `第${item.row}行：${item.reason}`).join("；");
    throw new Error(`整批数据质量校验失败（${converted.errors.length}条）：${details}`);
  }
  const batches = groupWorkBuddyV2Batches(converted.records, collectedAt, file.name);
  if (dryRun) {
    console.log(JSON.stringify({
      detectedFile: file.path,
      fileModifiedAt: fileInfo.mtime.toISOString(),
      originalCount: rows.length,
      standardizedCount: converted.records.length,
      platformDistribution: Object.fromEntries(batches.map((batch) => [batch.platform, batch.records.length])),
      valid: true,
      databaseWritten: 0,
    }, null, 2));
    process.exit(0);
  }

  context.stage = "receive";
  const started = await requestJson("/api/workbuddy-relay", {
    method: "POST",
    body: JSON.stringify({
      action: "start", fileName: file.name, fileDate: file.date,
      originalCount: rows.length, standardizedCount: converted.records.length,
    }),
  });
  context.relayLogId = started.relayLogId;
  if (started.alreadyProcessed) {
    console.log(JSON.stringify({ detectedFile: file.path, alreadyProcessed: true, ...started.summary }, null, 2));
    process.exit(0);
  }
  if (started.created === false && started.processing) {
    console.log(JSON.stringify({ detectedFile: file.path, alreadyProcessing: true, relayLogId: started.relayLogId }, null, 2));
    process.exit(0);
  }

  const receivedBatches = [];
  for (const payload of batches) {
    const received = await requestJson("/api/data-collection/v2/receive", {
      method: "POST", body: JSON.stringify(payload),
    });
    let previewCount = 0;
    let previewErrors = 0;
    for (let page = 1; previewCount < received.totalCount; page += 1) {
      const preview = await requestJson(`/api/data-collection/v2/preview?id=${received.batchId}&page=${page}&page_size=100`);
      previewCount += preview.records.length;
      previewErrors += preview.records.filter((record) => record.validationStatus !== "valid").length;
      if (!preview.records.length) break;
    }
    if (previewCount !== payload.records.length || previewErrors) throw new Error(`批次${received.batchId}预览校验失败`);
    receivedBatches.push({ batchId: received.batchId, platform: payload.platform, receivedCount: received.totalCount, previewCount });
  }
  const batchIds = receivedBatches.map((batch) => batch.batchId);
  await requestJson("/api/workbuddy-relay", {
    method: "POST",
    body: JSON.stringify({
      action: "preflight", relayLogId: context.relayLogId, fileName: file.name,
      fileDate: file.date, standardizedCount: converted.records.length, batchIds,
    }),
  });

  context.stage = "confirm";
  const confirmations = [];
  for (const batch of receivedBatches) {
    const confirmation = await requestJson(`/api/data-collection/v2/confirm?id=${batch.batchId}`, {
      method: "POST", body: JSON.stringify({ confirmed: true }),
    });
    if (confirmation.writtenCount !== batch.receivedCount) throw new Error(`批次${batch.batchId}正式入库数量不一致`);
    confirmations.push(confirmation);
  }

  context.stage = "ai_analysis";
  const finalized = await requestJson("/api/workbuddy-relay", {
    method: "POST",
    body: JSON.stringify({
      action: "finalize", relayLogId: context.relayLogId, fileName: file.name,
      fileDate: file.date, originalCount: rows.length,
      standardizedCount: converted.records.length, batchIds,
    }),
  });
  console.log(JSON.stringify({
    detectedFile: file.path,
    source: WORKBUDDY_V2_SOURCE,
    fileModifiedAt: fileInfo.mtime.toISOString(),
    platformDistribution: Object.fromEntries(batches.map((batch) => [batch.platform, batch.records.length])),
    ...finalized.summary,
    failedStage: null,
  }, null, 2));
} catch (error) {
  await failRelay(context, context.stage, error);
  console.error(JSON.stringify({
    detectedFile: context.fileName ? join(sourceDirectory, context.fileName) : null,
    fileDate: context.fileDate,
    originalCount: context.originalCount,
    standardizedCount: context.standardizedCount,
    failedStage: context.stage,
    failureReason: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
