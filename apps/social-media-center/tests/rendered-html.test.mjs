import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readProjectMigration(fileName) {
  try {
    return await readFile(new URL(`../../database/migrations/${fileName}`, root), "utf8");
  } catch {
    return readFile(new URL(`database/migrations/${fileName}`, root), "utf8");
  }
}

for (const [path, heading] of [
  ["app/page.tsx", "新媒体运营驾驶舱"],
  ["app/content/page.tsx", "内容分析"],
  ["app/tasks/page.tsx", "任务管理"],
  ["app/imports/page.tsx", "新媒体智能数据导入中心"],
  ["app/hot-topics/page.tsx", "新媒体热点监测中心"],
  ["app/ai-analysis/page.tsx", "AI 内容分析中心"],
  ["app/collector/page.tsx", "新媒体数据采集中心"],
  ["app/comment-insights/page.tsx", "游客评论洞察中心"],
  ["app/insights/content/page.tsx", "内容监测中心"],
  ["app/insights/content/detail/page.tsx", "作品数据分析"],
  ["app/insights/fans/page.tsx", "粉丝分析"],
]) {
  test(`${path} defines the requested page`, async () => {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, new RegExp(heading));
    assert.match(source, /fetch\([`"']\/api\//);
    assert.doesNotMatch(source, /Your site is taking shape|codex-preview/);
  });
}

test("content monitoring and fan analysis are independent navigation modules", async () => {
  const [source, shell] = await Promise.all([
    readFile(new URL("app/insights/page.tsx", root), "utf8"),
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
  ]);
  assert.match(source, /内容与用户洞察中心/);
  assert.match(source, /href="\/insights\/content"/);
  assert.match(source, /href="\/insights\/fans"/);
  assert.match(shell, /href: "\/insights\/content", label: "内容监测中心", code: "02"/);
  assert.match(shell, /href: "\/insights\/fans", label: "粉丝分析中心", code: "03"/);
  assert.match(shell, /href: "\/tasks", label: "任务管理中心", code: "08"/);
  assert.doesNotMatch(shell, /label: "内容与用户洞察"/);
});

test("content and fan insights switch platform themes without changing the app background", async () => {
  const [content, fans, styles] = await Promise.all([
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/fans/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const source of [content, fans]) {
    assert.match(source, /platform-themed-page/);
    assert.match(source, /current-platform-badge/);
    assert.match(source, /当前平台/);
    assert.match(source, /theme-\$\{/);
  }
  assert.match(content, /`\$\{currentPlatformLabel\}内容监测`/);
  assert.match(content, /content-platform-grid/);
  assert.match(content, /content-platform-card/);
  assert.match(content, /四平台汇总/);
  assert.match(fans, /`\$\{currentPlatformLabel\}粉丝分析`/);
  assert.match(fans, /platform: "all"/);
  for (const theme of ["theme-douyin", "theme-kuaishou", "theme-weibo", "theme-wechat_channels"]) assert.match(styles, new RegExp(theme));
  const themeStyles = styles.slice(styles.indexOf("/* 内容与用户洞察的平台主题"), styles.indexOf(".loading-panel"));
  assert.doesNotMatch(themeStyles, /linear-gradient/);
  assert.match(styles, /theme-douyin[^}]+#ef2b55[^}]+#20cfe1[^}]+#171a1f/);
  assert.match(styles, /theme-kuaishou[^}]+#f26522[^}]+#ffc33d/);
  assert.match(styles, /theme-weibo[^}]+#d9273f/);
  assert.match(styles, /theme-wechat_channels[^}]+#08a957[^}]+#ff8a34/);
});

test("data collection center combines automatic collection and imports without removing compatibility page", async () => {
  const [collector, imports, shell] = await Promise.all([
    readFile(new URL("app/collector/page.tsx", root), "utf8"),
    readFile(new URL("app/imports/page.tsx", root), "utf8"),
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
  ]);
  assert.match(collector, /自动采集/);
  assert.match(collector, /数据导入/);
  assert.match(collector, /DataImportPanel/);
  assert.match(imports, /export function DataImportPanel/);
  assert.match(imports, /export default function ImportsPage/);
  assert.match(shell, /label: "数据采集中心"/);
  assert.doesNotMatch(shell, /label: "数据导入中心"/);
  assert.doesNotMatch(shell, /label: "智能采集中心"/);
});

test("global date filter resolves yesterday, week, month and custom ranges", async () => {
  const { rangeForMonth, rangeForPreset, resolveDateRange } = await import(new URL("../lib/date-range.ts", import.meta.url));
  const now = new Date("2026-08-08T04:00:00.000Z");
  assert.deepEqual(rangeForPreset("yesterday", now), { preset: "yesterday", from: "2026-08-07", to: "2026-08-07", label: "昨日" });
  assert.deepEqual(rangeForPreset("week", now), { preset: "week", from: "2026-08-02", to: "2026-08-08", label: "近一周" });
  assert.deepEqual(rangeForPreset("month", now), { preset: "month", from: "2026-08-01", to: "2026-08-08", label: "2026年8月" });
  assert.deepEqual(rangeForMonth(2026, 7, now), { preset: "month", from: "2026-07-01", to: "2026-07-31", label: "2026年7月" });
  assert.deepEqual(resolveDateRange(new URLSearchParams("preset=month&from=2026-07-01&to=2026-07-31"), now), { preset: "month", from: "2026-07-01", to: "2026-07-31", label: "2026年7月" });
  assert.deepEqual(resolveDateRange(new URLSearchParams("preset=custom&from=2026-07-10&to=2026-08-08"), now), { preset: "custom", from: "2026-07-10", to: "2026-08-08", label: "2026-07-10 至 2026-08-08" });
});

test("global date filter is wired to every requested dashboard and API", async () => {
  const [shell, filter, dateRange, dashboardPage, contentPage, fanPage, commentPage, aiPage, dashboardApi, contentApi, fanApi, commentApi, aiApi] = await Promise.all([
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
    readFile(new URL("components/GlobalDateFilter.tsx", root), "utf8"),
    readFile(new URL("lib/date-range.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/fans/page.tsx", root), "utf8"),
    readFile(new URL("app/comment-insights/page.tsx", root), "utf8"),
    readFile(new URL("app/ai-analysis/page.tsx", root), "utf8"),
    readFile(new URL("app/api/dashboard/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/content/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/fans/route.ts", root), "utf8"),
    readFile(new URL("app/api/comment-insights/route.ts", root), "utf8"),
    readFile(new URL("app/api/ai-analysis/route.ts", root), "utf8"),
  ]);
  assert.match(shell, /GlobalDateFilter/);
  assert.match(filter, /datePresetLabels/);
  assert.match(filter, /MonthPicker/);
  assert.match(filter, /month-picker-grid/);
  assert.match(filter, /dual-calendar/);
  assert.match(filter, /CalendarMonth/);
  assert.doesNotMatch(filter, /type="date"/);
  for (const label of ["昨日", "近一周", "自然月", "自定义"]) assert.match(dateRange, new RegExp(label));
  for (const page of [dashboardPage, contentPage, fanPage, commentPage, aiPage]) assert.match(page, /dateRangeQuery\(range\)/);
  for (const api of [dashboardApi, contentApi, fanApi, commentApi, aiApi]) {
    assert.match(api, /resolveDateRange/);
    assert.match(api, /BETWEEN date\(\?\) AND date\(\?\)/);
  }
});

test("pages use database-backed API routes", async () => {
  const [dashboard, posts, tasks, imports, confirm, hotTopics, aiAnalysis, collections, collectionConfirm, commentCollections, commentConfirm, v2Collections, v2Confirm, commentInsights, contentInsights, contentDetail, fanInsights] = await Promise.all([
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
    readFile(new URL("app/api/collections/douyin-v2/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/douyin-v2/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/comment-insights/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/content/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/content/detail/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/fans/route.ts", root), "utf8"),
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
  assert.doesNotMatch(v2Collections, /ensureDatabase|getD1|INSERT INTO collection_logs/);
  assert.match(v2Confirm, /INSERT INTO social_fans/);
  assert.match(v2Confirm, /INSERT INTO content_audience_analysis/);
  assert.match(v2Confirm, /INSERT INTO social_comments/);
  assert.match(v2Confirm, /d1\.batch/);
  assert.match(commentInsights, /FROM social_comments/);
  assert.match(commentInsights, /UPDATE social_comments/);
  assert.match(commentInsights, /analyzeComment/);
  assert.match(contentInsights, /FROM social_posts/);
  assert.match(contentInsights, /FROM competitor_posts/);
  assert.match(contentInsights, /industryComparison/);
  assert.match(contentInsights, /dailyReport/);
  assert.match(contentInsights, /contentFanRelations/);
  assert.match(contentDetail, /FROM social_posts/);
  assert.match(contentDetail, /FROM social_comments/);
  assert.match(contentDetail, /trafficSources: parseDistribution/);
  assert.match(contentDetail, /FROM content_audience_analysis/);
  assert.match(fanInsights, /FROM social_fans/);
  assert.match(fanInsights, /FROM fan_growth_records/);
  assert.match(fanInsights, /trendPeriod/);
  assert.match(fanInsights, /strategies/);
  assert.match(fanInsights, /FROM social_posts/);
});

test("Douyin V2.1 preview is database-free and blocks confirmation below 80 percent", async () => {
  const [previewRoute, confirmRoute, collector, rawPreview, collectionModule] = await Promise.all([
    readFile(new URL("app/api/collections/douyin-v2/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/douyin-v2/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/collector/page.tsx", root), "utf8"),
    readFile(new URL("data/collection-previews/douyin-v2-dushanzi-2026-08-01_2026-08-07.json", root), "utf8"),
    import(new URL("../lib/douyin-collection-v2.ts", import.meta.url)),
  ]);
  assert.doesNotMatch(previewRoute, /ensureDatabase|getD1|INSERT INTO/);
  assert.match(previewRoute, /无落库预览/);
  assert.ok(confirmRoute.indexOf("eligibleForConfirmation") < confirmRoute.indexOf("await ensureDatabase"));
  assert.match(collector, /完整率未达 80%/);
  assert.match(collector, /数据库写入为 0 条/);

  const payload = collectionModule.normalizeDouyinCollectionV2(JSON.parse(rawPreview));
  assert.ok(payload);
  assert.equal(collectionModule.validateDouyinCollectionV2(payload).length, 0);
  const summary = collectionModule.summarizeDouyinCollectionV2(payload);
  assert.deepEqual(summary.completeness, { fans: 71.43, posts: 56.67, comments: 88.89, overall: 65.22, threshold: 80 });
  assert.equal(summary.eligibleForConfirmation, false);
  for (const field of ["粉丝增长趋势", "粉丝活跃时间", "作品1.观众性别", "作品2.平均播放时长", "作品3.评论热词"]) {
    assert.ok(summary.failedFields.includes(field), field);
  }
});

test("top content opens a real-data work analysis with separate tabs", async () => {
  const [content, detail, api] = await Promise.all([
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/content/detail/page.tsx", root), "utf8"),
    readFile(new URL("app/api/insights/content/detail/route.ts", root), "utf8"),
  ]);
  assert.match(content, /\/insights\/content\/detail\?id=/);
  assert.match(content, /数据分析/);
  for (const tab of ["流量分析", "观众分析", "评论热词", "评论管理"]) assert.match(detail, new RegExp(tab));
  assert.match(detail, /未采集指标不会生成模拟数据/);
  assert.match(api, /interactionRate: percent/);
  assert.doesNotMatch(api, /个人主页|推荐页|关注页/);
});

test("content and user insight tables are generated for both databases", async () => {
  const [d1Migration, postgresMigration, schema, bootstrap] = await Promise.all([
    readFile(new URL("drizzle/0006_handy_warstar.sql", root), "utf8"),
    readProjectMigration("004_create_content_user_insights_v1.sql"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
  ]);
  for (const source of [d1Migration, postgresMigration, schema, bootstrap]) {
    assert.match(source, /social_fans/);
    assert.match(source, /fan_growth_records/);
  }
  assert.match(schema, /rawPayload/);
  assert.match(postgresMigration, /raw_payload/);
});

test("content monitoring competitor posts schema supports future collection", async () => {
  const [d1Migration, postgresMigration, schema, bootstrap] = await Promise.all([
    readFile(new URL("drizzle/0008_content_monitoring_v1.sql", root), "utf8"),
    readProjectMigration("006_create_content_monitoring_v1.sql"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
  ]);
  for (const source of [d1Migration, postgresMigration, schema, bootstrap]) {
    assert.match(source, /competitor_posts/);
    assert.match(source, /source_record_id/);
    assert.match(source, /raw_payload/);
  }
  assert.match(bootstrap, /PRAGMA optimize/);
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
    readProjectMigration("003_enhance_hot_topics.sql"),
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
  assert.equal(posts.rows.length, 15);
  assert.equal(posts.progress.processed, 16);
  assert.equal(posts.failures.length, 1);
  assert.equal(comments.rows.length, 49);
  assert.equal(comments.progress.total, 16);
  assert.equal(comments.failures.length, 0);
  await access(new URL("public/chrome-extension/douyin-collector-v1.zip", root));
});

test("production build artifacts exist", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));
});
