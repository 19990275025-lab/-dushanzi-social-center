import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

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
  ["app/hot-topics/page.tsx", "多平台热点监测与AI选题推荐中心"],
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

test("active system surfaces only support Douyin, Kuaishou and Weibo", async () => {
  const sourceFiles = [];
  for (const directory of ["app", "components", "lib", "db"]) {
    const names = await readdir(join(rootPath, directory), { recursive: true });
    sourceFiles.push(...names.filter((name) => /\.(?:ts|tsx|css)$/.test(name)).map((name) => join(rootPath, directory, name)));
  }
  sourceFiles.push(join(rootPath, "README.md"));
  const sources = await Promise.all(sourceFiles.map((path) => readFile(path, "utf8")));
  for (const source of sources) assert.doesNotMatch(source, /wechat_channels|视频号|微信视频号/);
});

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
  assert.match(content, /三平台汇总/);
  assert.match(fans, /`\$\{currentPlatformLabel\}粉丝分析`/);
  assert.match(fans, /platform: "all"/);
  for (const theme of ["theme-douyin", "theme-kuaishou", "theme-weibo"]) assert.match(styles, new RegExp(theme));
  const themeStyles = styles.slice(styles.indexOf("/* 内容与用户洞察的平台主题"), styles.indexOf(".loading-panel"));
  assert.doesNotMatch(themeStyles, /linear-gradient/);
  assert.match(styles, /theme-douyin[^}]+#ef2b55[^}]+#20cfe1[^}]+#171a1f/);
  assert.match(styles, /theme-kuaishou[^}]+#f26522[^}]+#ffc33d/);
  assert.match(styles, /theme-weibo[^}]+#d9273f/);
  assert.doesNotMatch(content, /wechat_channels|视频号/);
  assert.doesNotMatch(fans, /wechat_channels|视频号/);
  assert.doesNotMatch(styles, /platform-themed-page\.theme-wechat_channels/);
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

test("global date filter resolves today, yesterday, week, month and custom ranges", async () => {
  const { rangeForMonth, rangeForPreset, resolveDateRange } = await import(new URL("../lib/date-range.ts", import.meta.url));
  const now = new Date("2026-08-08T04:00:00.000Z");
  assert.deepEqual(rangeForPreset("today", now), { preset: "today", from: "2026-08-08", to: "2026-08-08", label: "今日" });
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
  for (const label of ["今日", "昨日", "近一周", "自然月", "自定义"]) assert.match(dateRange, new RegExp(label));
  for (const page of [dashboardPage, contentPage, commentPage, aiPage]) assert.match(page, /dateRangeQuery\(range\)/);
  assert.match(fanPage, /dateRangeQuery\(activeTrendRange\)/);
  assert.match(fanPage, /MonthPicker/);
  assert.match(fanPage, /CustomDateRange/);
  assert.match(fanApi, /trendPeriod === "custom"/);
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
  assert.match(contentInsights, /FROM viral_videos/);
  assert.match(contentInsights, /viralCategoryComparison/);
  assert.match(contentInsights, /dailyReport/);
  assert.match(contentInsights, /contentFanRelations/);
  assert.doesNotMatch(contentInsights, /"wechat_channels"/);
  assert.match(contentDetail, /FROM social_posts/);
  assert.match(contentDetail, /FROM social_comments/);
  assert.match(contentDetail, /trafficSources: parseDistribution/);
  assert.match(contentDetail, /FROM content_audience_analysis/);
  assert.match(fanInsights, /FROM social_fans/);
  assert.match(fanInsights, /FROM fan_growth_records/);
  assert.match(fanInsights, /trendPeriod/);
  assert.match(fanInsights, /strategies/);
  assert.match(fanInsights, /FROM social_posts/);
  assert.doesNotMatch(fanInsights, /wechat_channels/);
});

test("external agents can import hot topics as JSON or Excel without collection logic", async () => {
  const [route, module, schema, migration, workbuddyMigration, page, analysisRoute, localService] = await Promise.all([
    readFile(new URL("app/api/hot-topic/import/route.ts", root), "utf8"),
    readFile(new URL("lib/external-hot-topic-import.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0012_external_agent_hot_topic_import.sql", root), "utf8"),
    readFile(new URL("drizzle/0013_workbuddy_agent_data_center.sql", root), "utf8"),
    readFile(new URL("app/hot-topics/page.tsx", root), "utf8"),
    readFile(new URL("app/api/hot-topic-data/analyze/route.ts", root), "utf8"),
    readFile(new URL("scripts/import-workbuddy-hot-topics.mjs", root), "utf8"),
  ]);
  assert.match(route, /application\/json/);
  assert.match(route, /multipart\/form-data/);
  assert.match(route, /parseWorkBuddyExcel/);
  assert.match(route, /source_agent/);
  assert.match(route, /INSERT INTO HOT_TOPIC_DATA/);
  assert.match(route, /replace_existing/);
  assert.match(route, /DELETE FROM HOT_TOPIC_DATA WHERE source_agent = \?/);
  assert.match(route, /WorkBuddy热点监测Agent|WORKBUDDY_SOURCE_AGENT/);
  assert.doesNotMatch(route, /playwright|douyin\.com|采集今日热点/);
  assert.match(module, /sourceAgent/);
  assert.match(schema, /sourceAgent: text\("source_agent"\)/);
  assert.match(migration, /CREATE VIEW `HOT_TOPIC_DATA`/);
  assert.match(workbuddyMigration, /CREATE TABLE `HOT_TOPIC_DATA`/);
  assert.match(schema, /sqliteTable\(\s*"HOT_TOPIC_DATA"/);
  for (const field of ["ai_relevance_score", "ai_analysis", "ai_recommendation"]) assert.match(workbuddyMigration, new RegExp(field));
  assert.match(page, /多平台热点监测与AI选题推荐中心/);
  assert.match(page, /AI分析/);
  assert.match(page, /选择WorkBuddy文件/);
  assert.match(page, /替换当前数据/);
  assert.match(page, /replace_existing: true/);
  assert.match(page, /\/api\/hot-topic\/import/);
  assert.match(analysisRoute, /analyzeWorkBuddyTopic/);
  assert.match(analysisRoute, /shortVideoTitle/);
  assert.match(analysisRoute, /liveTheme/);
  assert.match(localService, /hot_topic_\\d\{8\}/);
  assert.match(localService, /--dry-run/);
  assert.doesNotMatch(localService, /playwright|douyin\.com|weibo\.com|kuaishou\.com/);
});

test("hot topic center presents WorkBuddy TOP20 with unified platform filters", async () => {
  const [page, shell, filter, api, agentApi, analysisApi, schema, migration] = await Promise.all([
    readFile(new URL("app/hot-topics/page.tsx", root), "utf8"),
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
    readFile(new URL("components/GlobalDateFilter.tsx", root), "utf8"),
    readFile(new URL("app/api/hot-topics/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topic-data/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topic-data/analyze/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0015_hot_topic_data_source.sql", root), "utf8"),
  ]);
  for (const label of ["全部热点", "抖音", "快手", "微博", "其他平台", "TOP20", "AI热点分析与选题推荐"]) {
    assert.match(page, new RegExp(label));
  }
  for (const removedCard of ["hot-module-tabs", "平台热点趋势", "内容热度分析"]) assert.doesNotMatch(page, new RegExp(removedCard));
  assert.match(page, /insight-platform-tabs/);
  for (const label of ["分析报告", "TOP20列表", "热点总数", "强烈推荐借势", "推荐直播主题", "今日运营建议"]) assert.match(page, new RegExp(label));
  assert.match(page, /viewMode === "report"/);
  assert.match(page, /reportTopics\.map/);
  assert.match(page, /topic\.url.*target="_blank"/);
  assert.match(page, /不展示模拟结果/);
  assert.match(shell, /isHotTopicsPage && <GlobalDateFilter defaultPreset="today" scope="hot-topics"/);
  assert.match(page, /useGlobalDateRange\(\{ defaultPreset: "today", scope: "hot-topics" \}\)/);
  assert.match(page, /date >= range\.from && date <= range\.to/);
  assert.match(page, /topicsInRange/);
  assert.match(filter, /scope === "global"/);
  assert.match(page, /WorkBuddy热点监测Agent/);
  assert.match(page, /slice\(0, 20\)/);
  for (const field of ["排名", "平台", "热点名称", "热度", "趋势", "采集时间"]) assert.match(page, new RegExp(field));
  for (const output of ["关联度", "是否推荐跟进|worthFollowingLabel", "推荐短视频标题|shortVideoTitle", "推荐拍摄方向|shootingDirection"]) assert.match(page, new RegExp(output));
  for (const suggestion of ["抖音短视频内容建议", "快手互动和直播建议", "微博品牌传播建议"]) assert.match(page, new RegExp(suggestion));
  assert.match(analysisApi, /FROM HOT_TOPIC_DATA/);
  assert.match(analysisApi, /FROM social_posts/);
  assert.match(api, /searchParams/);
  assert.match(api, /platform = \?/);
  assert.match(api, /data_source = \?/);
  for (const source of ["douyin_hot_rank", "douyin_seed_rank", "douyin_challenge_rank", "douyin_content_hot"]) {
    assert.match(api, new RegExp(source));
    assert.match(migration, new RegExp(source === "douyin_content_hot" ? source : "data_source"));
  }
  assert.match(agentApi, /WHERE platform = \?/);
  for (const label of ["平台热点跟进判断", "抖音热点跟进判断", "快手热点跟进判断", "微博热点跟进判断"]) {
    assert.match(api, new RegExp(label));
  }
  assert.match(schema, /dataSource: text\("data_source"\)/);
  assert.match(migration, /UPDATE `hot_topics`[\s\S]*douyin_content_hot/);
  assert.doesNotMatch(migration, /DELETE FROM `hot_topics`/);
  assert.match(migration, /idx_hot_topics_platform_data_source_ranking/);
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
  assert.doesNotMatch(detail, /<h2>流量来源<\/h2>/);
  assert.doesNotMatch(detail, /搜索与评论关键词/);
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

test("viral content comparison uses a category library without fixed scenic accounts", async () => {
  const [page, api, migration, postgresMigration, schema, bootstrap] = await Promise.all([
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/api/insights/content/route.ts", root), "utf8"),
    readFile(new URL("drizzle/0009_viral_video_library.sql", root), "utf8"),
    readProjectMigration("007_create_viral_video_library.sql"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
  ]);
  for (const source of [api, migration, postgresMigration, schema, bootstrap]) assert.match(source, /viral_videos/);
  for (const label of ["旅游类爆款", "景区类爆款", "新疆旅游爆款", "自然风景爆款"]) assert.match(api, new RegExp(label));
  for (const label of ["视频结构", "标题方式", "前三秒内容", "拍摄方式", "互动方式", "评论反馈", "爆款原因", "可复制元素", "适合独山子大峡谷的内容建议"]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(api, /那拉提景区|喀纳斯景区|天山天池|赛里木湖/);
  assert.match(migration, /source_record_id/);
  assert.match(migration, /raw_payload/);
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

test("Douyin V3 confirms the July preview and preserves incomplete real fields", async () => {
  const [previewRoute, confirmRoute, collectionRoute, schema, bootstrap, migration, preview] = await Promise.all([
    readFile(new URL("app/api/collections/douyin-v3/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/douyin-v3/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0010_douyin_collection_v3.sql", root), "utf8"),
    readFile(new URL("data/collection-previews/douyin-v3-dushanzi-2026-07-01_2026-07-30.json", root), "utf8"),
  ]);
  assert.match(previewRoute, /无落库预览/);
  assert.match(confirmRoute, /confirmed !== true/);
  assert.match(confirmRoute, /douyin_v3/);
  assert.match(confirmRoute, /NOT EXISTS/);
  assert.match(collectionRoute, /collection_log_id IS NOT NULL/);
  assert.match(collectionRoute, /log\.entity_type === "douyin_v3"/);
  for (const source of [schema, bootstrap, migration, confirmRoute]) assert.match(source, /skip_rate|skipRate/);
  const payload = JSON.parse(preview);
  assert.equal(payload.schemaVersion, "3.0");
  assert.equal(payload.posts.length, 17);
  assert.equal(payload.posts.flatMap((post) => post.comments).length, 14);
  assert.equal(payload.posts.filter((post) => post.videoUrl === "").length, 9);
});

test("production build artifacts exist", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));
});
