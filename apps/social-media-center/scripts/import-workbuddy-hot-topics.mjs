import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const SOURCE_AGENT = "WorkBuddy热点监测Agent";
const sourceDirectory = process.env.WORKBUDDY_HOT_TOPIC_DIR
  || join(homedir(), "Desktop", "景区AI营销数据", "hot_topics");
const apiBaseUrl = (process.env.WORKBUDDY_API_BASE_URL
  || "https://dushanzi-social-center.pink-raven-4682.chatgpt.site").replace(/\/$/, "");

const files = (await readdir(sourceDirectory))
  .filter((name) => /^hot_topic_\d{8}\.json$/.test(name))
  .sort();
const latestFile = files.at(-1);
if (!latestFile) throw new Error(`未找到 WorkBuddy 热点文件：${sourceDirectory}/hot_topic_YYYYMMDD.json`);

const filePath = join(sourceDirectory, latestFile);
const topics = JSON.parse(await readFile(filePath, "utf8"));
if (!Array.isArray(topics) || topics.length === 0) throw new Error(`${latestFile} 没有热点数据`);

const invalidSource = topics.find((topic) => topic?.source_agent && topic.source_agent !== SOURCE_AGENT);
if (invalidSource) throw new Error(`数据来源必须为“${SOURCE_AGENT}”`);

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ latestFile, filePath, count: topics.length, sourceAgent: SOURCE_AGENT, previewOnly: true }, null, 2));
  process.exit(0);
}

const headers = { "content-type": "application/json" };
if (process.env.WORKBUDDY_AGENT_KEY) headers["x-agent-key"] = process.env.WORKBUDDY_AGENT_KEY;
if (process.env.WORKBUDDY_SITES_BEARER_TOKEN) {
  headers["OAI-Sites-Authorization"] = `Bearer ${process.env.WORKBUDDY_SITES_BEARER_TOKEN}`;
}

const response = await fetch(`${apiBaseUrl}/api/hot-topic/import`, {
  method: "POST",
  headers,
  body: JSON.stringify({ source_agent: SOURCE_AGENT, data: topics }),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(result.error || `导入失败：HTTP ${response.status}`);
console.log(JSON.stringify({ latestFile, ...result }, null, 2));

