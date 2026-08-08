import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

for (const [path, heading] of [
  ["app/page.tsx", "新媒体运营驾驶舱"],
  ["app/content/page.tsx", "内容分析"],
  ["app/tasks/page.tsx", "任务管理"],
  ["app/imports/page.tsx", "新媒体智能数据导入中心"],
  ["app/hot-topics/page.tsx", "新媒体热点监测中心"],
  ["app/ai-analysis/page.tsx", "AI 内容分析中心"],
  ["app/collector/page.tsx", "新媒体智能采集中心"],
  ["app/comment-insights/page.tsx", "游客评论洞察中心"],
]) {
  test(`${path} defines the requested page`, async () => {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, new RegExp(heading));
    assert.match(source, /fetch\([`"']\/api\//);
    assert.doesNotMatch(source, /Your site is taking shape|codex-preview/);
  });
}

test("pages use database-backed API routes", async () => {
  const [dashboard, posts, tasks, imports, confirm, hotTopics, aiAnalysis, collections, collectionConfirm, commentCollections, commentConfirm, commentInsights] = await Promise.all([
    readFile(new URL("app/api/dashboard/route.ts", root), "utf8"),
    readFile(new URL("app/api/posts/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/route.ts", root), "utf8"),
    readFile(new URL("app/api/imports/route.ts", root), "utf8"),
    readFile(new URL("app/api/imports/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topics/route.ts", root), "utf8"),
    readFile(new URL("app/api/ai-analysis/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/comments/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/comments/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/comment-insights/route.ts", root), "utf8"),
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
  assert.match(collections, /FROM collection_logs/);
  assert.match(collections, /DELETE FROM social_posts WHERE collection_log_id/);
  assert.match(collectionConfirm, /INSERT INTO social_posts/);
  assert.match(collectionConfirm, /collection_log_id/);
  assert.match(collectionConfirm, /d1\.batch/);
  assert.match(commentCollections, /entity_type/);
  assert.match(commentCollections, /comment_count/);
  assert.match(commentConfirm, /INSERT INTO social_comments/);
  assert.match(commentConfirm, /collection_log_id/);
  assert.match(commentConfirm, /d1\.batch/);
  assert.match(commentInsights, /FROM social_comments/);
  assert.match(commentInsights, /UPDATE social_comments/);
  assert.match(commentInsights, /analyzeComment/);
});

test("comment insight model covers all requested visitor needs", async () => {
  const [engine, migration] = await Promise.all([
    readFile(new URL("lib/comment-insight-engine.ts", root), "utf8"),
    readFile(new URL("drizzle/0005_boring_argent.sql", root), "utf8"),
  ]);
  for (const category of ["旅游攻略", "交通路线", "价格咨询", "项目体验", "亲子需求", "老人需求", "服务评价", "其他"]) {
    assert.match(engine, new RegExp(category));
  }
  assert.match(engine, /comment-rules-v1/);
  assert.match(engine, /\/api\/v1\/social\/ai\/comment-insights/);
  assert.match(migration, /ADD `ai_analysis`/);
  assert.match(migration, /idx_social_comments_user_need/);
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
  const [migration, manifest, popup, collectorPage, postConfirm, commentConfirm, postPreview, commentPreview] = await Promise.all([
    readFile(new URL("drizzle/0003_collection_center.sql", root), "utf8"),
    readFile(new URL("public/chrome-extension/douyin-collector-v1/manifest.json", root), "utf8"),
    readFile(new URL("public/chrome-extension/douyin-collector-v1/popup.js", root), "utf8"),
    readFile(new URL("app/collector/page.tsx", root), "utf8"),
    readFile(new URL("app/api/collections/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/comments/confirm/route.ts", root), "utf8"),
    readFile(new URL("data/collection-previews/douyin-dushanzi-2026-07-10_2026-08-08.json", root), "utf8"),
    readFile(new URL("data/collection-previews/douyin-comments-dushanzi-2026-07-10_2026-08-08.json", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE `collection_logs`/);
  assert.match(migration, /ADD `collection_log_id`/);
  assert.match(manifest, /creator\.douyin\.com/);
  assert.match(popup, /collectVisibleDouyinPosts/);
  assert.match(popup, /collectVisibleDouyinComments/);
  assert.match(popup, /rows\.length >= 50/);
  assert.match(popup, /展开\\s\*\\d\+\\s\*条回复/);
  assert.match(popup, /creatorItemId/);
  assert.match(popup, /昨天/);
  assert.match(popup, /chrome\.scripting\.executeScript/);
  assert.doesNotMatch(popup, /cookie|localStorage|sessionStorage/i);
  assert.match(collectorPage, /30 天采集进度/);
  assert.match(collectorPage, /失败明细/);
  assert.match(postConfirm, /UPDATE social_posts/);
  assert.match(commentConfirm, /跳过.*重复评论/);
  const posts = JSON.parse(postPreview);
  const comments = JSON.parse(commentPreview);
  assert.equal(posts.rows.length, 14);
  assert.equal(posts.progress.processed, 16);
  assert.equal(posts.failures.length, 2);
  assert.equal(comments.rows.length, 14);
  assert.equal(comments.progress.total, 16);
  assert.equal(comments.failures.length, 8);
  await access(new URL("public/chrome-extension/douyin-collector-v1.zip", root));
});

test("production build artifacts exist", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));
});
