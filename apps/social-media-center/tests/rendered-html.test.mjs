import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

for (const [path, heading] of [
  ["app/page.tsx", "新媒体运营驾驶舱"],
  ["app/content/page.tsx", "内容分析"],
  ["app/tasks/page.tsx", "任务管理"],
  ["app/imports/page.tsx", "新媒体智能数据导入中心"],
]) {
  test(`${path} defines the requested page`, async () => {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, new RegExp(heading));
    assert.match(source, /fetch\([`"']\/api\//);
    assert.doesNotMatch(source, /Your site is taking shape|codex-preview/);
  });
}

test("dashboard data comes from database-backed API routes", async () => {
  const [dashboard, posts, tasks, imports, confirm] = await Promise.all([
    readFile(new URL("app/api/dashboard/route.ts", root), "utf8"),
    readFile(new URL("app/api/posts/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/route.ts", root), "utf8"),
    readFile(new URL("app/api/imports/route.ts", root), "utf8"),
    readFile(new URL("app/api/imports/confirm/route.ts", root), "utf8"),
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
});

test("import schema migration is generated", async () => {
  const migration = await readFile(new URL("drizzle/0001_thick_marrow.sql", root), "utf8");
  assert.match(migration, /CREATE TABLE `data_import_logs`/);
  assert.match(migration, /ADD `import_log_id`/);
});

test("production build artifacts exist", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));
});
