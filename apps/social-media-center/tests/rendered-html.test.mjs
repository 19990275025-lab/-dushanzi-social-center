import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";

const root = new URL("../", import.meta.url);

for (const [path, heading] of [
  ["app/page.tsx", "新媒体运营驾驶舱"],
  ["app/content/page.tsx", "内容分析"],
  ["app/tasks/page.tsx", "任务管理"],
  ["app/imports/page.tsx", "新媒体智能数据导入中心"],
  ["app/hot-topics/page.tsx", "新媒体热点监测中心"],
  ["app/ai-analysis/page.tsx", "AI 内容分析中心"],
  ["app/data-templates/page.tsx", "新媒体数据资产采集模板中心"],
  ["app/collector/page.tsx", "新媒体智能采集中心"],
]) {
  test(`${path} defines the requested page`, async () => {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, new RegExp(heading));
    assert.match(source, /fetch\([`"']\/api\//);
    assert.doesNotMatch(source, /Your site is taking shape|codex-preview/);
  });
}

test("pages use database-backed API routes", async () => {
  const [dashboard, posts, tasks, imports, confirm, hotTopics, aiAnalysis, dataTemplates, collections, collectionConfirm] = await Promise.all([
    readFile(new URL("app/api/dashboard/route.ts", root), "utf8"),
    readFile(new URL("app/api/posts/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/route.ts", root), "utf8"),
    readFile(new URL("app/api/imports/route.ts", root), "utf8"),
    readFile(new URL("app/api/imports/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topics/route.ts", root), "utf8"),
    readFile(new URL("app/api/ai-analysis/route.ts", root), "utf8"),
    readFile(new URL("app/api/data-templates/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/confirm/route.ts", root), "utf8"),
  ]);

  assert.match(dashboard, /FROM social_accounts/);
  assert.match(dashboard, /FROM social_posts/);
  assert.match(dashboard, /FROM hot_topics/);
  assert.match(posts, /FROM social_posts/);
  assert.match(tasks, /FROM content_tasks/);
  assert.match(tasks, /export async function POST/);
  assert.match(tasks, /export async function PATCH/);
  assert.match(imports, /FROM data_import_logs/);
  assert.match(imports, /export async function DELETE/);
  assert.match(confirm, /INSERT INTO social_posts/);
  assert.match(confirm, /d1\.batch/);
  assert.match(hotTopics, /FROM hot_topics/);
  assert.match(hotTopics, /FROM social_posts/);
  assert.match(hotTopics, /export async function POST/);
  assert.match(hotTopics, /export async function PATCH/);
  assert.match(hotTopics, /export async function DELETE/);
  assert.match(hotTopics, /ruleBasedTopicEngine/);
  assert.match(aiAnalysis, /FROM social_posts/);
  assert.match(aiAnalysis, /FROM hot_topics/);
  assert.match(aiAnalysis, /FROM social_accounts/);
  assert.match(aiAnalysis, /ruleBasedContentEngine/);
  assert.match(aiAnalysis, /buildReport\("daily"/);
  assert.match(aiAnalysis, /buildReport\("weekly"/);
  assert.match(dataTemplates, /XLSX\.read/);
  assert.match(dataTemplates, /日期格式|发布时间/);
  assert.match(dataTemplates, /非负整数/);
  assert.match(dataTemplates, /平台名称/);
  assert.doesNotMatch(dataTemplates, /INSERT INTO|UPDATE social_|DELETE FROM/);
  assert.match(collections, /FROM collection_logs/);
  assert.match(collections, /DELETE FROM social_posts WHERE collection_log_id/);
  assert.match(collectionConfirm, /INSERT INTO social_posts/);
  assert.match(collectionConfirm, /collection_log_id/);
  assert.match(collectionConfirm, /d1\.batch/);
});

test("content analysis model defines a 100-point weighted score", async () => {
  const engine = await readFile(new URL("lib/content-analysis-engine.ts", root), "utf8");
  assert.match(engine, /visualAttraction: 25/);
  assert.match(engine, /titleQuality: 20/);
  assert.match(engine, /interactionAbility: 20/);
  assert.match(engine, /propagationAbility: 20/);
  assert.match(engine, /hotMatch: 15/);
  assert.match(engine, /content-rules-v1/);
});

test("five Excel collection templates expose standard headers and guidance", async () => {
  const cases = [
    ["public/templates/douyin-social-posts-template-v1.xlsx", ["平台", "作品标题", "发布时间", "作品链接", "内容类型", "播放量", "点赞量", "评论量", "收藏量", "分享量", "涨粉量", "标签", "备注"]],
    ["public/templates/kuaishou-social-posts-template-v1.xlsx", ["平台", "作品标题", "发布时间", "作品链接", "内容类型", "播放量", "点赞量", "评论量", "收藏量", "分享量", "涨粉量", "标签", "备注"]],
    ["public/templates/weibo-social-posts-template-v1.xlsx", ["平台", "作品标题", "发布时间", "作品链接", "内容类型", "播放量", "点赞量", "评论量", "收藏量", "分享量", "涨粉量", "标签", "备注"]],
    ["public/templates/wechat-channels-social-posts-template-v1.xlsx", ["平台", "作品标题", "发布时间", "作品链接", "内容类型", "播放量", "点赞量", "评论量", "收藏量", "分享量", "涨粉量", "标签", "备注"]],
    ["public/templates/competitor-accounts-template-v1.xlsx", ["平台", "账号名称", "作品标题", "发布时间", "播放量", "点赞", "评论", "收藏", "爆款原因"]],
  ];

  for (const [path, expectedHeaders] of cases) {
    const bytes = await readFile(new URL(path, root));
    const workbook = XLSX.read(bytes, { type: "buffer" });
    assert.deepEqual(workbook.SheetNames, ["数据采集", "填写说明", "填写示例"]);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets["数据采集"], { header: 1, raw: true });
    assert.deepEqual(rows[0], expectedHeaders);
  }
});

test("import schema migration is generated", async () => {
  const migration = await readFile(new URL("drizzle/0001_thick_marrow.sql", root), "utf8");
  assert.match(migration, /CREATE TABLE `data_import_logs`/);
  assert.match(migration, /ADD `import_log_id`/);
});

test("hot topic schema migrations are generated", async () => {
  const [d1Migration, postgresMigration] = await Promise.all([
    readFile(new URL("drizzle/0002_legal_vampiro.sql", root), "utf8"),
    readFile(new URL("../../database/migrations/003_enhance_hot_topics.sql", root), "utf8"),
  ]);
  for (const migration of [d1Migration, postgresMigration]) {
    assert.match(migration, /keyword/);
    assert.match(migration, /status/);
    assert.match(migration, /created_at/);
  }
});

test("collection schema and Chrome adapter are packaged", async () => {
  const [migration, manifest, popup] = await Promise.all([
    readFile(new URL("drizzle/0003_collection_center.sql", root), "utf8"),
    readFile(new URL("public/chrome-extension/douyin-collector-v1/manifest.json", root), "utf8"),
    readFile(new URL("public/chrome-extension/douyin-collector-v1/popup.js", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE `collection_logs`/);
  assert.match(migration, /ADD `collection_log_id`/);
  assert.match(manifest, /creator\.douyin\.com/);
  assert.match(popup, /collectVisibleDouyinPosts/);
  assert.match(popup, /chrome\.scripting\.executeScript/);
  assert.doesNotMatch(popup, /cookie|localStorage|sessionStorage/i);
  await access(new URL("public/chrome-extension/douyin-collector-v1.zip", root));
});

test("production build artifacts exist", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));
});
