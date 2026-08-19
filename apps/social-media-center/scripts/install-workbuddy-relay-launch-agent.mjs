import { spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const label = "com.dushanzi.social-center.workbuddy-hot-topic-relay";
const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const launchAgentPath = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const logDirectory = join(homedir(), "Library", "Logs", "dushanzi-social-center");
const sourceDirectory = process.env.WORKBUDDY_HOT_TOPIC_DIR
  || join(homedir(), "Desktop", "景区AI营销数据", "hot_topics");
const apiBaseUrl = (process.env.WORKBUDDY_API_BASE_URL || "").trim();

if (!apiBaseUrl) throw new Error("安装前必须设置WORKBUDDY_API_BASE_URL");
if (/chatgpt\.site/i.test(apiBaseUrl) && !process.env.WORKBUDDY_SITES_BEARER_TOKEN) {
  throw new Error("私有Sites部署需要WORKBUDDY_SITES_BEARER_TOKEN，未配置时不会安装失效服务");
}

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const environment = {
  WORKBUDDY_HOT_TOPIC_DIR: sourceDirectory,
  WORKBUDDY_API_BASE_URL: apiBaseUrl.replace(/\/$/, ""),
  ...(process.env.WORKBUDDY_AGENT_KEY ? { WORKBUDDY_AGENT_KEY: process.env.WORKBUDDY_AGENT_KEY } : {}),
  ...(process.env.WORKBUDDY_SITES_BEARER_TOKEN ? { WORKBUDDY_SITES_BEARER_TOKEN: process.env.WORKBUDDY_SITES_BEARER_TOKEN } : {}),
};
const environmentXml = Object.entries(environment)
  .map(([key, value]) => `      <key>${escapeXml(key)}</key>\n      <string>${escapeXml(value)}</string>`)
  .join("\n");
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${label}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${escapeXml(process.execPath)}</string>
      <string>${escapeXml(join(projectDirectory, "scripts", "workbuddy-auto-relay.mjs"))}</string>
    </array>
    <key>WorkingDirectory</key><string>${escapeXml(projectDirectory)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${environmentXml}
    </dict>
    <key>WatchPaths</key><array><string>${escapeXml(sourceDirectory)}</string></array>
    <key>StartInterval</key><integer>600</integer>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>${escapeXml(join(logDirectory, "workbuddy-relay.log"))}</string>
    <key>StandardErrorPath</key><string>${escapeXml(join(logDirectory, "workbuddy-relay-error.log"))}</string>
  </dict>
</plist>
`;

await mkdir(dirname(launchAgentPath), { recursive: true });
await mkdir(logDirectory, { recursive: true });
await writeFile(launchAgentPath, plist, { mode: 0o600 });
await chmod(launchAgentPath, 0o600);

function launchctl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("launchctl", args, { stdio: "pipe" });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `launchctl退出码${code}`)));
  });
}

const domain = `gui/${process.getuid()}`;
try { await launchctl(["bootout", domain, launchAgentPath]); } catch { /* 首次安装时服务尚不存在 */ }
await launchctl(["bootstrap", domain, launchAgentPath]);
await launchctl(["enable", `${domain}/${label}`]);
console.log(JSON.stringify({ installed: true, label, launchAgentPath, sourceDirectory, intervalSeconds: 600 }, null, 2));
