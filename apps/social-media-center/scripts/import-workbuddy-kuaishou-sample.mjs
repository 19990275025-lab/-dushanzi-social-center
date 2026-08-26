// Manual, explicit two-post verification only. No scheduling and no platform collection.
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const directory = join(homedir(), "Desktop", "新媒体内容监测", "快手");
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const selectedPostIds = option("--posts")?.split(",");
if (selectedPostIds?.length !== 2) throw new Error("请用 --posts=新作品ID,已有监测作品ID 明确选择两条真实作品");
const candidates = [];
for (const fileName of (await readdir(directory)).filter(name => /^kuaishou_daily_monitor_\d{8}(?:_r\d+)?\.json$/.test(name))) {
  const fullPath = join(directory, fileName);
  const rawText = await readFile(fullPath, "utf8");
  try {
    const payload = JSON.parse(rawText);
    const time = Date.parse(payload.collection_time.replace(" ", "T") + (/Z$|[+-]\d{2}:\d{2}$/.test(payload.collection_time) ? "" : "+08:00"));
    if (payload.platform === "kuaishou" && payload.data_truthfulness === "real_data_only_no_estimation" && payload.posts?.length && Number.isFinite(time)) candidates.push({ fileName, fullPath, rawText, time, payload });
  } catch { console.warn(`无法解析，跳过但不修改：${fileName}`); }
}
candidates.sort((a, b) => b.time - a.time || b.payload.posts.length - a.payload.posts.length);
const selected = candidates[0];
if (!selected) throw new Error("固定目录没有有效真实每日文件");
if (option("--file") && selected.fileName !== option("--file")) throw new Error(`指定文件不是最新有效批次：${selected.fileName}`);
const checksum = createHash("sha256").update(selected.rawText).digest("hex");
console.log(JSON.stringify({ file: selected.fileName, fullPath: selected.fullPath, collectionTime: selected.payload.collection_time, checksum, selectedPostIds }));
const base = process.env.SOCIAL_CENTER_URL;
const key = process.env.KUAISHOU_ADAPTER_KEY;
if (!base || !key) throw new Error("缺少 SOCIAL_CENTER_URL / KUAISHOU_ADAPTER_KEY；不会默认写入某个环境");
const headers = { "content-type": "application/json", "x-kuaishou-adapter-key": key };
if (process.env.SITES_BYPASS_TOKEN) headers["OAI-Sites-Authorization"] = process.env.SITES_BYPASS_TOKEN;
async function send(endpoint, body) {
  const response = await fetch(`${base}${endpoint}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(data)}`);
  return data;
}
const preview = await send("/api/collections/kuaishou-v1", { rawText: selected.rawText, sourceFile: selected.fileName, sourcePath: selected.fullPath, selectedPostIds });
console.log(JSON.stringify({ preview }));
if (args.includes("--confirm") && preview.status !== "already_processed") console.log(JSON.stringify({ importResult: await send("/api/collections/kuaishou-v1/confirm", { confirmed: true, logId: preview.logId, checksum: preview.checksum }) }));
if (createHash("sha256").update(await readFile(selected.fullPath)).digest("hex") !== checksum) throw new Error("期间原始文件发生变化，请停止后续处理");
