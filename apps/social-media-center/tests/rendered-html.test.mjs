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
  ["app/marketing-operations/page.tsx", "营销运营中心"],
  ["app/page.tsx", "新媒体运营驾驶舱"],
  ["app/content/page.tsx", "内容分析"],
  ["app/tasks/page.tsx", "任务管理"],
  ["app/imports/page.tsx", "新媒体智能数据导入中心"],
  ["app/hot-topics/page.tsx", "热点监测与AI选题推荐中心"],
  ["app/hot-topic-archive/page.tsx", "热点档案库"],
  ["app/content-planning/page.tsx", "AI内容策划中心"],
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

test("frozen data surfaces still only query Douyin, Kuaishou and Weibo", async () => {
  const sourceFiles = [];
  for (const directory of ["app/api", "db"]) {
    const names = await readdir(join(rootPath, directory), { recursive: true });
    sourceFiles.push(...names.filter((name) => /\.(?:ts|tsx|css)$/.test(name)).map((name) => join(rootPath, directory, name)));
  }
  const sources = await Promise.all(sourceFiles.map((path) => readFile(path, "utf8")));
  for (const source of sources) assert.doesNotMatch(source, /wechat_channels|视频号|微信视频号/);
});

test("V2 primary navigation exposes eight isolated centers and keeps legacy pages", async () => {
  const [shell, overview, platformPage, aiPlanning, taskCenter, reports] = await Promise.all([
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
    readFile(new URL("app/overview/page.tsx", root), "utf8"),
    readFile(new URL("app/platform/[platform]/[[...section]]/page.tsx", root), "utf8"),
    readFile(new URL("app/ai-planning/page.tsx", root), "utf8"),
    readFile(new URL("app/task-center/page.tsx", root), "utf8"),
    readFile(new URL("app/reports/page.tsx", root), "utf8"),
  ]);
  for (const [code, label, href] of [
    ["01", "总览", "/overview"],
    ["02", "抖音运营中心", "/platform/douyin"],
    ["03", "快手运营中心", "/platform/kuaishou"],
    ["04", "微博运营中心", "/platform/weibo"],
    ["05", "视频号运营中心", "/platform/video-account"],
    ["06", "AI内容策划中心", "/ai-planning"],
    ["07", "任务中心", "/task-center"],
    ["08", "报表中心", "/reports"],
  ]) assert.match(shell, new RegExp(`href: "${href}", label: "${label}", code: "${code}"`));
  assert.match(overview, /\/api\/insights\/fans/);
  assert.match(overview, /\/api\/content-monitoring/);
  assert.match(platformPage, /platformLegacyHref/);
  assert.match(aiPlanning, /content_plans/);
  assert.match(taskCenter, /content_tasks/);
  assert.match(reports, /不重新设计报表计算逻辑/);
  for (const legacyPage of ["app/page.tsx", "app/insights/content/page.tsx", "app/insights/fans/page.tsx", "app/hot-topics/page.tsx", "app/content-planning/page.tsx", "app/tasks/page.tsx"]) await access(new URL(legacyPage, root));
});

test("V2 platform containers share layouts, tabs, date selector and honest empty states", async () => {
  const [navigation, layout, selector, metric, empty, status, styles] = await Promise.all([
    readFile(new URL("lib/v2-navigation.ts", root), "utf8"),
    readFile(new URL("components/v2/PlatformLayout.tsx", root), "utf8"),
    readFile(new URL("components/v2/DateRangeSelector.tsx", root), "utf8"),
    readFile(new URL("components/v2/MetricCard.tsx", root), "utf8"),
    readFile(new URL("components/v2/EmptyState.tsx", root), "utf8"),
    readFile(new URL("components/v2/DataStatusBadge.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const platform of ["douyin", "kuaishou", "weibo", "video_account"]) assert.match(navigation, new RegExp(platform));
  for (const section of ["粉丝分析", "内容监测及诊断", "热点监测", "AI选题推荐"]) assert.match(navigation, new RegExp(section));
  assert.match(navigation, /video_account:[\s\S]+sections: \["fans", "content"\]/);
  assert.match(layout, /PlatformHeader/);
  assert.match(layout, /PlatformTabs/);
  assert.match(selector, /showToday=\{false\}/);
  assert.match(metric, /v2-metric-card/);
  assert.match(empty, /暂无真实数据/);
  assert.match(status, /数据接入中/);
  assert.match(styles, /v2-platform-tabs/);
  assert.match(styles, /v2-platform-contribution-grid/);
});

test("V2 stage 2 reuses real Douyin APIs and mature pages without duplicating data models", async () => {
  const [overview, platformPage, hotPanels, fans, content, detail, detailRoute, planning] = await Promise.all([
    readFile(new URL("app/overview/page.tsx", root), "utf8"),
    readFile(new URL("app/platform/[platform]/[[...section]]/page.tsx", root), "utf8"),
    readFile(new URL("components/v2/DouyinHotTopicPanels.tsx", root), "utf8"),
    readFile(new URL("app/insights/fans/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/content/detail/page.tsx", root), "utf8"),
    readFile(new URL("app/platform/douyin/content/detail/page.tsx", root), "utf8"),
    readFile(new URL("app/ai-planning/page.tsx", root), "utf8"),
  ]);
  for (const label of ["总粉丝数量", "发布作品数量", "总播放 / 总流量", "总点赞", "总评论", "总收藏", "总分享", "各平台内容贡献", "平台运营定位"]) assert.match(overview, new RegExp(label));
  assert.match(overview, /未接入/);
  assert.match(overview, /不使用抖音数据填充/);
  assert.match(platformPage, /FanAnalysisCenterPage embedded forcedPlatform="douyin"/);
  assert.match(platformPage, /ContentMonitoringPage embedded forcedPlatform="douyin"/);
  assert.match(platformPage, /DouyinHotTopicsPanel/);
  assert.match(platformPage, /DouyinAiTopicsPanel/);
  assert.match(fans, /scope: embedded \? "v2" : "global"/);
  assert.match(fans, /真实历史批次不足，暂无法形成趋势/);
  assert.match(content, /作品监测列表/);
  assert.match(content, /较上次/);
  assert.match(content, /含付费流量/);
  assert.match(detail, /系统每日快照趋势/);
  assert.match(detail, /抖音平台趋势/);
  assert.match(detailRoute, /ContentDetailPage embedded/);
  assert.match(hotPanels, /platform=douyin/);
  assert.match(hotPanels, /hot_topic_analysis_id/);
  assert.match(hotPanels, /进入AI内容策划中心/);
  assert.match(planning, /已接收抖音热点/);
  for (const forbidden of ["CREATE TABLE", "ALTER TABLE", "INSERT INTO social_posts", "UPDATE social_posts"]) {
    assert.doesNotMatch(overview + platformPage + hotPanels, new RegExp(forbidden));
  }
});

test("content monitoring and fan insights retain platform themes", async () => {
  const [content, fans, styles] = await Promise.all([
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/fans/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const source of [content, fans]) {
    assert.match(source, /platform-themed-page/);
    assert.match(source, /current-platform-badge/);
    assert.match(source, /当前平台/);
  }
  assert.match(content, /\{currentPlatformLabel\}内容监测中心/);
  assert.match(content, /theme-\$\{platform\}/);
  assert.match(content, /当前平台：\{currentPlatformLabel\}/);
  assert.match(content, /supportedPlatforms/);
  assert.match(content, /platformSnapshot/);
  assert.match(fans, /theme-\$\{/);
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

test("fan analysis V2.1 retains growth, profile history, content acquisition and export", async () => {
  const [page, api, exporter, styles, readme] = await Promise.all([
    readFile(new URL("app/insights/fans/page.tsx", root), "utf8"),
    readFile(new URL("app/api/insights/fans/route.ts", root), "utf8"),
    readFile(new URL("lib/fan-report-export.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
  ]);
  for (const label of ["FAN ANALYSIS CENTER · V2.1", "当前粉丝", "新增粉丝", "流失粉丝", "增长率", "7天", "30天", "自然月", "自定义", "粉丝画像分析", "画像变化", "内容吸粉分析", "AI 粉丝运营周报", "本周粉丝分析", "增长原因", "流失原因", "下周内容建议", "导出PDF", "导出PNG"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /GrowthLineChart/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /downloadFanReportPng/);
  assert.match(page, /selected.*douyin/);
  assert.match(api, /FROM social_fans/);
  assert.match(api, /FROM fan_growth_records/);
  assert.match(api, /FROM social_posts/);
  assert.match(api, /platform = 'douyin'/);
  assert.match(api, /lost_fans/);
  assert.match(api, /profileComparison/);
  assert.match(api, /contentAttraction/);
  assert.match(api, /weeklyReport/);
  assert.match(api, /find\(\(post\) => post\.fans_growth > 0\)/);
  assert.match(api, /find\(\(item\) => item\.fansGrowth > 0\)/);
  assert.match(api, /同日净增长仅作背景校验/);
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|INSERT INTO|DELETE FROM/);
  assert.match(exporter, /canvas\.toBlob/);
  assert.match(exporter, /image\/png/);
  assert.match(styles, /fan-growth-line-chart/);
  assert.match(styles, /profile-comparison-grid/);
  assert.match(styles, /printing-fan-report/);
  assert.match(readme, /粉丝分析中心 V2\.1/);
  assert.match(readme, /另存为PDF/);
});

test("content monitoring uses selected-platform posts, comments and hot-topic feedback", async () => {
  const [page, api, engine, styles] = await Promise.all([
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/api/content-monitoring/route.ts", root), "utf8"),
    readFile(new URL("lib/content-monitoring.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const label of ["今日发布", "播放量", "点赞", "评论", "收藏", "分享", "互动率", "内容效果排行榜", "爆款分析", "爆款原因", "内容结构", "标题特点", "拍摄方式", "低效作品诊断", "播放低原因", "优化建议", "热点关联", "推荐是否有效"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /\/api\/content-monitoring/);
  assert.match(page, /data\.sources\.join/);
  assert.match(api, /FROM social_posts/);
  assert.match(api, /supportedPlatforms/);
  assert.match(api, /searchParams\.get\("platform"\)/);
  assert.match(api, /WHERE platform = \?/);
  assert.match(api, /WHERE p\.platform = \?/);
  assert.match(api, /FROM social_comments/);
  assert.match(api, /FROM hot_topic_feedback/);
  assert.match(api, /JOIN hot_topics/);
  assert.match(api, /COALESCE\(f\.related_post_id, f\.social_post_id\)/);
  assert.match(api, /ruleBasedContentEngine/);
  assert.match(engine, /buildBreakoutAnalysis/);
  assert.match(engine, /buildLowEfficiencyDiagnosis/);
  assert.match(engine, /post\.likes \+ post\.comments \+ post\.favorites \+ post\.shares/);
  assert.match(styles, /content-monitor-kpis/);
  assert.match(styles, /platform-subnav/);
  assert.match(styles, /breakout-analysis-grid/);
  assert.match(styles, /low-efficiency-list/);
  assert.match(styles, /content-hot-link-table/);
  assert.match(styles, /content-monitor-v1[^}]+--monitor-red: var\(--insight-primary\)/);
});

test("WorkBuddy content V2 keeps immutable post identity and snapshot-level real metrics", async () => {
  const [parser, preview, confirm, detail, monitor, collector, schema, migration, docs] = await Promise.all([
    readFile(new URL("lib/workbuddy-posts-v2.ts", root), "utf8"),
    readFile(new URL("app/api/collections/posts-v2/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/posts-v2/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/content/detail/route.ts", root), "utf8"),
    readFile(new URL("app/api/content-monitoring/route.ts", root), "utf8"),
    readFile(new URL("app/collector/page.tsx", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0027_content_data_model_v2.sql", root), "utf8"),
    readProjectMigration("009_create_content_data_model_v2.sql"),
  ]);
  for (const source of [schema, migration, docs]) {
    for (const table of ["social_post_snapshots", "social_post_traffic", "social_post_traffic_sources", "social_post_comment_keywords"]) {
      assert.match(source, new RegExp(table));
    }
  }
  assert.match(parser, /commentOverviewCount/);
  assert.match(parser, /actualLoadedCount/);
  assert.match(parser, /commentRowsCount/);
  assert.match(parser, /trafficNature/);
  assert.match(parser, /DOU\+/);
  assert.match(parser, /expired/);
  assert.match(parser, /commentType/);
  assert.match(preview, /normalizeWorkBuddyPostsV2/);
  assert.match(confirm, /confirmed !== true/);
  assert.match(confirm, /INSERT INTO social_post_snapshots/);
  assert.match(confirm, /INSERT INTO social_post_traffic_sources/);
  assert.match(confirm, /INSERT INTO social_post_comment_keywords/);
  assert.match(detail, /commentOverviewCount/);
  assert.match(detail, /actualLoadedCount/);
  assert.match(detail, /trafficSources/);
  assert.match(monitor, /traffic_nature = 'paid'/);
  assert.match(monitor, /organic_views/);
  assert.match(collector, /WorkBuddy 作品 JSON/);
  assert.match(collector, /确认入库/);
});

test("WorkBuddy deep content V2.1 preserves source files, real series and paid traffic separately", async () => {
  const [parser, preview, confirm, importer, schema, bootstrap, migration, detailApi, detailPage, monitor] = await Promise.all([
    readFile(new URL("lib/workbuddy-posts-deep-v2-1.ts", root), "utf8"),
    readFile(new URL("app/api/collections/posts-deep-v2-1/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/posts-deep-v2-1/confirm/route.ts", root), "utf8"),
    readFile(new URL("scripts/import-workbuddy-douyin-deep.mjs", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0028_workbuddy_deep_posts_v2_1.sql", root), "utf8"),
    readFile(new URL("app/api/insights/content/detail/route.ts", root), "utf8"),
    readFile(new URL("app/insights/content/detail/page.tsx", root), "utf8"),
    readFile(new URL("app/api/content-monitoring/route.ts", root), "utf8"),
  ]);
  for (const source of [schema, bootstrap, migration]) {
    for (const table of ["content_collection_files", "social_post_metric_series", "social_post_paid_traffic", "social_post_audience", "social_comment_replies"]) {
      assert.match(source, new RegExp(table));
    }
  }
  assert.match(parser, /canonicalProfile/);
  assert.match(parser, /sourceRecordStatus/);
  assert.match(parser, /commentOverviewCount/);
  assert.match(parser, /actualLoadedCount/);
  assert.match(parser, /relationshipToOverview/);
  assert.match(preview, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(preview, /同一 checksum 已完成入库/);
  assert.match(confirm, /status = 'processing'/);
  assert.match(confirm, /INSERT INTO social_post_metric_series/);
  assert.match(confirm, /INSERT INTO social_post_paid_traffic/);
  assert.match(confirm, /INSERT INTO social_post_audience/);
  assert.match(confirm, /INSERT INTO social_comment_replies/);
  assert.match(importer, /Desktop.*新媒体内容监测.*抖音/);
  assert.match(importer, /douyin_posts_deep_/);
  assert.match(importer, /completeness/);
  assert.doesNotMatch(importer, /writeFile|unlink|rename/);
  assert.match(detailApi, /FROM social_post_metric_series/);
  assert.match(detailApi, /FROM social_post_paid_traffic/);
  assert.match(detailApi, /FROM social_post_audience/);
  assert.match(detailPage, /数据趋势/);
  assert.match(detailPage, /DOU\+ 独立保存/);
  assert.match(detailPage, /平台未提供/);
  assert.match(monitor, /source_record_status/);
  assert.match(monitor, /social_post_paid_traffic/);
});

test("WorkBuddy daily monitor V2.2 appends deduplicated snapshots, deltas and evaluation history", async () => {
  const [parser, preview, confirm, importer, schema, bootstrap, migration, monitorApi, monitorPage, detailApi, detailPage] = await Promise.all([
    readFile(new URL("lib/workbuddy-posts-daily-v2-2.ts", root), "utf8"),
    readFile(new URL("app/api/collections/posts-daily-v2-2/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/posts-deep-v2-1/confirm/route.ts", root), "utf8"),
    readFile(new URL("scripts/import-workbuddy-douyin-daily.mjs", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0029_workbuddy_daily_monitor_v2_2.sql", root), "utf8"),
    readFile(new URL("app/api/content-monitoring/route.ts", root), "utf8"),
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/api/insights/content/detail/route.ts", root), "utf8"),
    readFile(new URL("app/insights/content/detail/page.tsx", root), "utf8"),
  ]);
  assert.match(parser, /douyin_daily_monitor_v2\.2/);
  assert.match(parser, /new_posts/);
  assert.match(parser, /monitored_posts/);
  assert.match(parser, /private_posts/);
  assert.match(preview, /posts-deep-v2-1/);
  assert.match(importer, /douyin_daily_monitor_20260821\.json/);
  assert.doesNotMatch(importer, /writeFile|unlink|rename/);
  for (const source of [schema, bootstrap, migration]) assert.match(source, /social_post_evaluations/);
  assert.match(migration, /collection_batch/);
  assert.match(migration, /uq_social_post_metric_series_time/);
  assert.match(confirm, /INSERT INTO social_post_evaluations/);
  assert.match(confirm, /ON CONFLICT\(post_id, evaluation_date, snapshot_id\) DO NOTHING/);
  assert.match(confirm, /payload\.collectionBatch/);
  assert.match(monitorApi, /s\.like_count - ps\.like_count/);
  assert.match(monitorPage, /较上次采集/);
  assert.match(detailApi, /snapshotHistory/);
  assert.match(detailApi, /evaluationHistory/);
  assert.match(detailPage, /系统每日快照趋势/);
  assert.match(detailPage, /抖音平台趋势/);
});

test("Douyin content effect V1.0 uses four weighted dimensions, dynamic baselines and paid-traffic protection", async () => {
  const [model, loader, monitorApi, detailApi, monitorPage, detailPage, styles] = await Promise.all([
    readFile(new URL("lib/content-effect-evaluation.ts", root), "utf8"),
    readFile(new URL("lib/content-effect-evaluation-server.ts", root), "utf8"),
    readFile(new URL("app/api/content-monitoring/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/content/detail/route.ts", root), "utf8"),
    readFile(new URL("app/insights/content/page.tsx", root), "utf8"),
    readFile(new URL("app/insights/content/detail/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(model, /weightedDimension\(\[[\s\S]+\], 30\)/);
  assert.match(model, /weightedDimension\(\[[\s\S]+\], 25\)/);
  assert.match(model, /postType\(post\) === "image" \? imageIndicators : videoIndicators, 20/);
  assert.match(model, /availableWeight \? round/);
  assert.match(model, /overallScore\(\[propagation, interaction, attraction, efficiency\]\)/);
  assert.match(model, /medianViews: quantile\(historicalViews, 0\.5\)/);
  assert.match(model, /top25Views: quantile\(historicalViews, 0\.75\)/);
  assert.match(model, /top10Views: quantile\(historicalViews, 0\.9\)/);
  assert.match(model, /历史样本不足，当前评分为初步评价/);
  assert.match(model, /relationshipToOverview === "additional"/);
  assert.doesNotMatch(model, /post\.views\s*-\s*paidViews|views\s*-\s*paid/);
  assert.match(model, /natural\.paidViews > 0.*capGrade\(grade, "A"\)/);
  assert.match(model, /grade === "S" && natural\.paidViews === 0/);
  assert.match(model, /投流放大型高播放作品/);
  assert.match(model, /sourceRecordStatus === "private"/);
  assert.match(model, /私密作品不参与内容效果评价/);
  assert.match(loader, /account_id NOT LIKE 'test_%'/);
  assert.match(loader, /c\.snapshot_id = s\.id/);
  assert.doesNotMatch(loader, /INSERT INTO|UPDATE social_|DELETE FROM/);
  assert.match(monitorApi, /douyin-content-effect-rules-v1/);
  assert.match(monitorApi, /effectEvaluationSummary/);
  assert.match(detailApi, /loadContentEffectEvaluations/);
  assert.match(detailApi, /paidRelationship === "additional" \? views : null/);
  assert.doesNotMatch(detailApi, /views\s*-\s*paidViews/);
  for (const label of ["综合表现", "自然传播", "互动质量", "完播表现", "涨粉能力", "DOU\\+作品", "数据完整度"]) assert.match(monitorPage, new RegExp(label));
  for (const label of ["效果评价", "内容传播力", "互动质量", "用户吸引力", "内容效率", "表现结论", "做得好的地方", "存在的问题", "流量结构判断", "观众特征", "评论反馈", "DOU\\+ 影响", "下一条优化建议"]) assert.match(detailPage, new RegExp(label));
  assert.match(styles, /effect-score-hero/);
  assert.match(styles, /effect-dimension-grid/);
  assert.match(styles, /effect-diagnosis-grid/);
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
  assert.doesNotMatch(shell, /label: "数据采集中心"/);
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
  assert.match(contentDetail, /FROM social_post_traffic_sources/);
  assert.match(contentDetail, /FROM social_post_snapshots/);
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
  assert.match(page, /\{currentLabel\}热点监测与AI选题推荐中心/);
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

test("legacy hot topic center remains query-driven while V2 platform pages own navigation", async () => {
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
  for (const label of ["抖音", "快手", "微博", "TOP20", "AI热点分析与选题推荐"]) {
    assert.match(page, new RegExp(label));
  }
  for (const removedSelector of ["全部热点", "其他平台", "hot-unified-platform-tabs", "selectPlatform"]) assert.doesNotMatch(page, new RegExp(removedSelector));
  for (const removedCard of ["hot-module-tabs", "平台热点趋势", "内容热度分析"]) assert.doesNotMatch(page, new RegExp(removedCard));
  assert.match(page, /platformFromLocation/);
  assert.match(page, /topic\.platform === activePlatform/);
  for (const label of ["分析报告", "TOP20列表", "热点总数", "强烈推荐借势", "推荐直播主题", "今日运营建议"]) assert.match(page, new RegExp(label));
  assert.match(page, /viewMode === "report"/);
  assert.match(page, /reportTopics\.map/);
  assert.match(page, /topic\.url.*target="_blank"/);
  assert.match(page, /不展示模拟结果/);
  assert.match(shell, /isHotTopicsPage && <GlobalDateFilter defaultPreset="today" scope="hot-topics"/);
  assert.doesNotMatch(shell, /platformSubnav|collapsedPlatformMenu/);
  assert.match(page, /useGlobalDateRange\(\{ defaultPreset: "today", scope: "hot-topics" \}\)/);
  assert.match(page, /topic\.collection_date/);
  assert.match(page, /from: range\.from, to: range\.to/);
  assert.match(page, /topicsInRange/);
  assert.match(filter, /scope === "global"/);
  assert.match(page, /WorkBuddy热点监测Agent/);
  assert.match(page, /slice\(0, 20\)/);
  for (const field of ["排名", "平台", "热点名称", "热度", "趋势", "采集时间"]) assert.match(page, new RegExp(field));
  for (const output of ["关联度", "是否推荐跟进|worthFollowingLabel", "推荐短视频标题|shortVideoTitle", "推荐拍摄方向|shootingDirection"]) assert.match(page, new RegExp(output));
  for (const suggestion of ["抖音短视频内容建议", "快手互动和直播建议", "微博品牌传播建议"]) assert.match(page, new RegExp(suggestion));
  assert.match(agentApi, /FROM hot_topics/);
  assert.match(agentApi, /LEFT JOIN hot_topic_analysis/);
  assert.match(agentApi, /collect_time/);
  assert.match(agentApi, /\+8 hours/);
  assert.match(agentApi, /ranking AS rank/);
  assert.match(analysisApi, /FROM hot_topics/);
  assert.match(analysisApi, /INSERT INTO hot_topic_analysis/);
  assert.doesNotMatch(analysisApi, /UPDATE hot_topics/);
  assert.match(analysisApi, /FROM social_posts/);
  assert.match(api, /searchParams/);
  assert.match(api, /platform = \?/);
  assert.match(api, /data_source = \?/);
  for (const source of ["douyin_hot_rank", "douyin_seed_rank", "douyin_challenge_rank", "douyin_content_hot"]) {
    assert.match(api, new RegExp(source));
    assert.match(migration, new RegExp(source === "douyin_content_hot" ? source : "data_source"));
  }
  assert.match(agentApi, /platform = \?/);
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
  for (const tab of ["流量分析", "数据趋势", "观众分析", "评论热词", "评论管理"]) assert.match(detail, new RegExp(tab));
  assert.match(detail, /<h2>流量来源<\/h2>/);
  assert.match(detail, /评论热词/);
  assert.match(detail, /不会转换为 0，也不会由规则模型补齐/);
  assert.match(api, /interactionRate: completeInteractions && views !== null \? percent/);
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

test("fan data model v2 keeps batches, period summaries and normalized profile records", async () => {
  const [migration, postgresMigration, schema, bootstrap, parser, preview, confirm, api, page] = await Promise.all([
    readFile(new URL("drizzle/0026_fan_data_model_v2.sql", root), "utf8"),
    readProjectMigration("008_create_fan_data_model_v2.sql"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("lib/douyin-fans-v2.ts", root), "utf8"),
    readFile(new URL("app/api/collections/fans-v2/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/fans-v2/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/insights/fans/route.ts", root), "utf8"),
    readFile(new URL("app/insights/fans/page.tsx", root), "utf8"),
  ]);
  for (const source of [migration, postgresMigration, schema, bootstrap]) {
    assert.match(source, /fan_collection_batches/);
    assert.match(source, /fan_profile_records/);
    assert.match(source, /period_type/);
    assert.match(source, /returning_followers/);
  }
  assert.match(parser, /follow_keyword/);
  assert.match(parser, /unavailable/);
  assert.match(parser, /successful_metric_values/);
  assert.match(preview, /databaseWritten: false/);
  assert.match(confirm, /同一粉丝采集批次已存在/);
  assert.match(confirm, /INSERT INTO fan_profile_records/);
  assert.match(confirm, /INSERT INTO fan_growth_records/);
  assert.match(api, /period_type = 'daily'/);
  assert.match(api, /FROM fan_profile_records/);
  assert.doesNotMatch(api, /social_posts\.fans_growth"/);
  assert.match(page, /平台暂未提供该维度数据/);
});

test("fan cross-batch analysis v2.1 compares only completed real batches", async () => {
  const [api, page, styles, readme] = await Promise.all([
    readFile(new URL("app/api/insights/fans/route.ts", root), "utf8"),
    readFile(new URL("app/insights/fans/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
  ]);
  assert.match(api, /FROM fan_collection_batches WHERE status = 'completed'/);
  assert.match(api, /item\.account_id === latestBatch\?\.account_id/);
  assert.match(api, /keywordChanges/);
  assert.match(api, /datetime\(publish_time\) > datetime\(\?\)/);
  assert.match(api, /仅表示同期关系，不直接证明粉丝增长因果/);
  assert.match(api, /需要至少2个真实采集批次后才能进行趋势分析。/);
  for (const label of ["FAN ANALYSIS CENTER · V2.1", "本期概览", "与上期对比", "画像变化", "期间内容表现", "暂无上期真实数据。", "等待下一次采集。", "等待形成第二个真实采集批次后启用。"]) {
    assert.match(page, new RegExp(label));
  }
  for (const dimension of ["性别变化", "年龄变化", "地域变化", "兴趣变化", "设备变化", "活跃度变化", "新增热词", "消失热词", "持续热词", "排名上升", "排名下降"]) {
    assert.match(page, new RegExp(dimension));
  }
  assert.match(styles, /batch-comparison-grid/);
  assert.match(readme, /粉丝分析中心 V2\.1/);
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

test("viral content library remains available without fixed scenic accounts", async () => {
  const [api, migration, postgresMigration, schema, bootstrap] = await Promise.all([
    readFile(new URL("app/api/insights/content/route.ts", root), "utf8"),
    readFile(new URL("drizzle/0009_viral_video_library.sql", root), "utf8"),
    readProjectMigration("007_create_viral_video_library.sql"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
  ]);
  for (const source of [api, migration, postgresMigration, schema, bootstrap]) assert.match(source, /viral_videos/);
  for (const label of ["旅游类爆款", "景区类爆款", "新疆旅游爆款", "自然风景爆款"]) assert.match(api, new RegExp(label));
  for (const field of ["video_structure", "title_pattern", "first_three_seconds", "shooting_method", "interaction_method", "comment_feedback", "breakout_reason", "replicable_elements", "dushanzi_suggestion"]) assert.match(api, new RegExp(field));
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

test("data collection V2.1 normalizes, previews and confirms three data types", async () => {
  const [normalizer, receive, preview, confirm, logs, collectionRoute, schema, bootstrap, migration] = await Promise.all([
    import(new URL("../lib/data-collection-v2.ts", import.meta.url)),
    readFile(new URL("app/api/data-collection/v2/receive/route.ts", root), "utf8"),
    readFile(new URL("app/api/data-collection/v2/preview/route.ts", root), "utf8"),
    readFile(new URL("app/api/data-collection/v2/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/data-collection/v2/logs/route.ts", root), "utf8"),
    readFile(new URL("app/api/collections/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0016_data_collection_standardization_v2_1.sql", root), "utf8"),
  ]);

  const parsed = normalizer.parseCollectionEnvelope({
    data_type: "content",
    source: "接口测试",
    platform: "抖音",
    account_id: 1,
    records: [{
      作品标题: "峡谷测试视频",
      发布时间: "2026-08-11 08:30:00",
      播放量: "1.2万",
      点赞量: "800",
      评论量: 30,
      收藏量: 20,
      分享量: 10,
    }],
  });
  assert.deepEqual(parsed.errors, []);
  const [content] = normalizer.normalizeCollectionRecords(parsed.envelope);
  assert.equal(content.normalized.platform, "douyin");
  assert.equal(content.normalized.source, "接口测试");
  assert.equal(content.normalized.views, 12000);
  assert.equal(content.normalized.account_id, 1);
  assert.deepEqual(content.errors, []);

  const invalid = normalizer.parseCollectionEnvelope({
    data_type: "comment",
    source: "接口测试",
    platform: "douyin",
    records: [{ username: "游客", comment_text: "怎么去？", comment_time: "bad-date" }],
  });
  const [comment] = normalizer.normalizeCollectionRecords(invalid.envelope);
  assert.match(comment.errors.join(" "), /comment_time不是有效日期时间/);

  for (const source of [schema, bootstrap, migration]) {
    assert.match(source, /collection_staging_records/);
    assert.match(source, /normalized_payload/);
    assert.match(source, /validation_errors/);
  }
  assert.match(schema, /source: text\("source"\).*default\("system"\)/);
  assert.match(receive, /pending_confirmation/);
  assert.match(receive, /databaseWritten: false/);
  assert.match(preview, /collection_staging_records/);
  assert.match(confirm, /INSERT INTO hot_topics/);
  assert.match(confirm, /INSERT INTO social_posts/);
  assert.match(confirm, /INSERT INTO social_comments/);
  assert.match(confirm, /confirmed !== true/);
  assert.match(confirm, /d1\.batch/);
  assert.match(logs, /FROM collection_logs/);
  assert.match(collectionRoute, /DELETE FROM hot_topics WHERE collection_log_id/);
  for (const route of [receive, preview, confirm, logs]) {
    assert.doesNotMatch(route, /playwright|MediaCrawler|Agent-Reach|WorkBuddy|crawler\/start/);
  }
});

test("WorkBuddy report analysis is stored separately from raw hot topics", async () => {
  const [adapter, reportParser, script, confirmRoute, analysisImport, schema, migration] = await Promise.all([
    import(new URL("../lib/workbuddy-v2-adapter.ts", import.meta.url)),
    import(new URL("../lib/workbuddy-report-analysis.ts", import.meta.url)),
    readFile(new URL("scripts/import-workbuddy-v2.mjs", root), "utf8"),
    readFile(new URL("app/api/data-collection/v2/confirm/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topic-analysis/import/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0018_hot_topic_analysis.sql", root), "utf8"),
  ]);
  const sourceRows = Array.from({ length: 10 }, (_, index) => ({
    platform: index === 0 ? "微博/抖音" : index === 1 ? "快手/抖音" : "抖音",
    rank: index + 1,
    topic: `WorkBuddy测试热点${index + 1}`,
    heat_value: index === 0 ? "🔥微博热搜TOP1/全网热议" : `🔥热度${900 - index * 10}万`,
    keyword: `新疆 热点${index + 1}`,
    category: "旅游",
    url: `https://example.com/topic-${index + 1}`,
    source_agent: "WorkBuddy热点监测Agent",
  }));
  const converted = adapter.buildWorkBuddyV2Records(sourceRows, "2026-08-11T08:00:00+08:00", 10);
  assert.equal(converted.requestedCount, 10);
  assert.equal(converted.records.length, 10);
  assert.deepEqual(converted.errors, []);
  assert.equal(converted.records[0].platform, "weibo");
  assert.equal(converted.records[1].platform, "kuaishou");
  assert.equal(converted.records[2].platform, "douyin");
  assert.equal(converted.records[0].heat_value, 100);
  assert.equal(converted.records[0].keyword, "新疆 热点1");
  assert.equal(converted.records[0].category, "旅游");
  assert.equal(converted.records[0].source_url, "https://example.com/topic-1");
  assert.equal(converted.records[0].raw_payload.topic, "WorkBuddy测试热点1");
  const parsedReport = reportParser.parseWorkBuddyReportAnalyses(`
    <div class="card"><h3>WorkBuddy测试热点1</h3>
    <span class="suit-high">✅ 适合借势</span><span>关联度：96/100</span>
    <p><strong>📸 推荐拍摄方向：</strong>拍峡谷第一视角</p>
    <p><strong>📱 推荐短视频标题：</strong>独库第一站</p>
    <p><strong>🎥 推荐直播主题：</strong>峡谷云直播</p></div>`);
  assert.equal(parsedReport.length, 1);
  assert.equal(parsedReport[0].relevance_score, 96);
  assert.equal(parsedReport[0].recommend_follow, true);
  assert.equal(adapter.groupWorkBuddyV2Batches(converted.records, "2026-08-11T08:00:00+08:00").length, 3);
  assert.match(script, /\/api\/data-collection\/v2\/receive/);
  assert.match(script, /\/api\/data-collection\/v2\/preview/);
  assert.match(script, /\/api\/data-collection\/v2\/confirm/);
  assert.match(script, /\/api\/hot-topic-analysis\/import/);
  assert.match(script, /\/api\/hot-topics\?platform=all/);
  assert.match(script, /--overwrite-same-day/);
  assert.match(script, /duplicate_mode/);
  assert.match(confirmRoute, /douyin_hot_rank/);
  assert.match(confirmRoute, /collection_date/);
  assert.match(confirmRoute, /aiRecommendedCount/);
  assert.match(confirmRoute, /raw_payload/);
  assert.doesNotMatch(confirmRoute, /analyzeImportedHotTopic|analyzeWorkBuddyTopic/);
  assert.match(analysisImport, /INSERT OR IGNORE INTO hot_topic_analysis/);
  assert.match(analysisImport, /unmatchedTopics/);
  assert.match(schema, /sqliteTable\(\s*"hot_topic_analysis"/);
  assert.match(migration, /FOREIGN KEY \(`hot_topic_id`\) REFERENCES `hot_topics`/);
  assert.doesNotMatch(migration, /DELETE FROM `hot_topics`/);
  for (const source of [script, confirmRoute, analysisImport]) assert.doesNotMatch(source, /MediaCrawler|Agent-Reach|crawler\/start/);
});

test("WorkBuddy automatic relay validates, deduplicates, analyzes and archives a complete batch", async () => {
  const [adapter, relayRoute, relayModule, script, collector, schema, bootstrap, migration, planning] = await Promise.all([
    import(new URL("../lib/workbuddy-v2-adapter.ts", import.meta.url)),
    readFile(new URL("app/api/workbuddy-relay/route.ts", root), "utf8"),
    readFile(new URL("lib/workbuddy-relay.ts", root), "utf8"),
    readFile(new URL("scripts/workbuddy-auto-relay.mjs", root), "utf8"),
    readFile(new URL("app/collector/page.tsx", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0025_workbuddy_relay_identity.sql", root), "utf8"),
    readFile(new URL("app/api/content-planning/route.ts", root), "utf8"),
  ]);
  const rows = [
    { platform: "抖音", list_type: "热点榜", rank: 1, topic: "新疆自驾新路线", heat_value: "1000万", trend: "新上榜", keyword: "新疆 自驾", collect_time: "2026-08-16T08:00:00+08:00" },
    { platform: "快手", list_type: "挑战榜", rank: 2, topic: "户外旅行挑战", heat_value: "800万", trend: "上升", keyword: "户外 旅行", collect_time: "2026-08-16T08:00:00+08:00" },
    { platform: "微博", list_type: "热搜榜", rank: 3, topic: "暑期旅游", heat_value: "700万", trend: "持平", keyword: "暑期 旅游", collect_time: "2026-08-16T08:00:00+08:00" },
  ];
  const converted = adapter.buildWorkBuddyV2Records(rows, "2026-08-16T08:00:00+08:00", 500, {
    expectedCollectionDate: "2026-08-16", requireCollectionTime: true, requireTopicType: true,
  });
  assert.deepEqual(converted.errors, []);
  assert.equal(converted.records.length, 3);
  assert.deepEqual(converted.records.map((record) => record.topic_type), ["hot_rank", "challenge_rank", "hot_rank"]);
  assert.deepEqual(converted.records.map((record) => record.trend), ["new", "up", "stable"]);
  const duplicated = adapter.buildWorkBuddyV2Records([...rows, rows[0]], "2026-08-16T08:00:00+08:00", 500, {
    expectedCollectionDate: "2026-08-16", requireCollectionTime: true, requireTopicType: true,
  });
  assert.equal(duplicated.errors.length, 1);
  assert.match(duplicated.errors[0].reason, /重复热点/);
  for (const action of ["start", "preflight", "finalize", "fail"]) assert.match(relayRoute, new RegExp(`action === "${action}"`));
  assert.match(relayModule, /analyzeWorkBuddyTopic/);
  assert.match(relayModule, /generateAndStoreDailyArchive/);
  assert.match(relayModule, /planningRecommendation/);
  assert.match(relayModule, /status = 'success'/);
  assert.match(relayModule, /workBuddyCollectionDate/);
  assert.match(relayModule, /timeZone: "Asia\/Shanghai"/);
  assert.doesNotMatch(relayModule, /String\(record\?\.collect_time \?\? ""\)\.slice\(0, 10\)/);
  assert.match(script, /hot_topic_\\d\{8\}\\\.\(json\|xlsx\|xls\)/);
  assert.match(script, /\/api\/data-collection\/v2\/receive/);
  assert.match(script, /\/api\/data-collection\/v2\/preview/);
  assert.match(script, /\/api\/data-collection\/v2\/confirm/);
  assert.match(script, /\/api\/workbuddy-relay/);
  assert.match(collector, /今日WorkBuddy采集/);
  assert.match(collector, /今日热点入库/);
  assert.match(collector, /今日AI分析/);
  assert.match(collector, /今日归档/);
  for (const source of [schema, bootstrap, migration]) assert.match(source, /uq_hot_topics_relay_identity/);
  assert.match(planning, /h\.collection_date = \?/);
});

test("V2.0 stable baseline formally declares evaluation history and maintenance runs", async () => {
  const [schema, bootstrap, migration, indexParityMigration] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0030_v2_stable_baseline.sql", root), "utf8"),
    readFile(new URL("drizzle/0031_schema_index_parity.sql", root), "utf8"),
  ]);
  for (const source of [schema, bootstrap]) {
    assert.match(source, /social_post_evaluations/);
    assert.match(source, /data_maintenance_runs/);
  }
  assert.match(schema, /export const dataMaintenanceRuns/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS data_maintenance_runs/);
  for (const indexName of ["uq_social_fans_source_record", "uq_fan_growth_source_record", "uq_content_audience_source_record", "uq_competitor_posts_source_record"]) {
    assert.match(indexParityMigration, new RegExp(indexName));
  }
});

test("hot topic V2.5 adds action levels, TOP5, conversion scoring and topic generation without schema changes", async () => {
  const [scoreModel, page, api, generator, styles] = await Promise.all([
    import(new URL("../lib/hot-topic-action-score.ts", import.meta.url)),
    readFile(new URL("app/hot-topics/page.tsx", root), "utf8"),
    readFile(new URL("app/api/hot-topic-data/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topic-data/generate/route.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  const base = {
    heatValue: 95,
    topicName: "新疆自驾攻略",
    keyword: "新疆 自驾 攻略",
    category: "交通自驾",
    recommendedTitle: "独库第一站",
    shootingDirection: "拍摄峡谷第一视角",
    liveTheme: "独库云直播",
  };
  assert.equal(scoreModel.calculateHotTopicActionScore({ ...base, relevanceScore: 90, recommendFollow: true, recommendationReason: "高度相关" }).level, "A");
  assert.equal(scoreModel.calculateHotTopicActionScore({ ...base, relevanceScore: 68, recommendFollow: false, recommendationReason: "具备借势价值，谨慎转化" }).level, "B");
  assert.equal(scoreModel.calculateHotTopicActionScore({ ...base, relevanceScore: 35, recommendFollow: false, recommendationReason: "不建议直接跟进" }).level, "C");
  for (const label of ["A级 · 强烈推荐", "B级 · 谨慎跟进", "C级 · 不建议跟进", "今日推荐热点 TOP5", "旅游转化价值", "生成选题", "拍摄脚本方向"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /levelOrder\[a\.recommendation_level\]/);
  assert.match(page, /activeLevel === "all"/);
  assert.match(page, /\/api\/hot-topic-data\/generate/);
  for (const field of ["recommendation_level", "tourism_conversion_score", "conversion_components", "content_direction"]) assert.match(api, new RegExp(field));
  assert.match(api, /calculateHotTopicActionScore/);
  assert.match(generator, /JOIN hot_topic_analysis/);
  assert.match(generator, /scriptDirection/);
  assert.doesNotMatch(generator, /INSERT INTO hot_topics|UPDATE hot_topics|ALTER TABLE hot_topics/);
  assert.match(styles, /hot-action-top5-grid/);
  assert.match(styles, /hot-level-tabs/);
  assert.match(styles, /level-a/);
  assert.match(styles, /level-b/);
  assert.match(styles, /level-c/);
});

test("hot topic V3.0 persists recommendation feedback and reviews linked social_posts", async () => {
  const [schema, bootstrap, migration, reviewMigration, page, feedbackApi, generator, styles] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0019_hot_topic_feedback.sql", root), "utf8"),
    readFile(new URL("drizzle/0020_hot_topic_feedback_review.sql", root), "utf8"),
    readFile(new URL("app/hot-topics/page.tsx", root), "utf8"),
    readFile(new URL("app/api/hot-topic-feedback/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topic-data/generate/route.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const source of [schema, bootstrap, migration]) {
    assert.match(source, /hot_topic_feedback/);
    for (const field of ["hot_topic_id", "recommended_at", "recommended_content", "social_post_id", "views", "likes", "comments", "favorites", "shares", "is_effective"]) {
      assert.match(source, new RegExp(field));
    }
  }
  assert.match(migration, /REFERENCES `hot_topics`/);
  assert.match(migration, /REFERENCES `social_posts`/);
  assert.doesNotMatch(migration, /ALTER TABLE `hot_topics`|UPDATE `hot_topics`|DELETE FROM `hot_topics`/);
  for (const field of ["related_post_id", "platform", "publish_time", "effect_score", "ai_summary"]) {
    assert.match(schema, new RegExp(field));
    assert.match(bootstrap, new RegExp(field));
    assert.match(reviewMigration, new RegExp(field));
  }
  assert.doesNotMatch(reviewMigration, /ALTER TABLE `hot_topics`|DELETE FROM `hot_topics`/);
  assert.match(generator, /INSERT INTO hot_topic_feedback/);
  assert.match(generator, /feedbackId/);
  assert.doesNotMatch(generator, /UPDATE hot_topics|ALTER TABLE hot_topics/);
  for (const label of ["热点效果复盘", "热点推荐成功率", "高价值热点类型", "低价值热点类型", "AI模型优化建议", "对应作品", "效果评分", "AI总结", "刷新作品数据"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(feedbackApi, /FROM hot_topic_feedback/);
  assert.match(feedbackApi, /JOIN social_posts/);
  assert.match(feedbackApi, /EFFECTIVE_ENGAGEMENT_RATE = 0\.03/);
  assert.match(feedbackApi, /AVG\(views\)/);
  assert.match(feedbackApi, /calculateEffectReview/);
  assert.match(feedbackApi, /score >= 70 \? "成功" : score >= 45 \? "一般" : "失败"/);
  assert.match(feedbackApi, /related_post_id/);
  assert.match(feedbackApi, /ai_summary/);
  assert.match(feedbackApi, /export async function PATCH/);
  assert.match(feedbackApi, /export async function PUT/);
  assert.match(styles, /hot-feedback-kpis/);
  assert.match(styles, /hot-feedback-value-grid/);
  assert.match(styles, /feedback-result\.effective/);
  assert.match(styles, /feedback-result\.success/);
  assert.match(styles, /feedback-result\.general/);
  assert.match(styles, /feedback-result\.failure/);
});

test("hot topic archive V4.0 snapshots daily assets and exports Excel without altering source tables", async () => {
  const [schema, bootstrap, migration, helper, api, download, page, shell, worker, vite, styles] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0021_hot_topic_archive.sql", root), "utf8"),
    readFile(new URL("lib/hot-topic-archive.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topic-archive/route.ts", root), "utf8"),
    readFile(new URL("app/api/hot-topic-archive/download/route.ts", root), "utf8"),
    readFile(new URL("app/hot-topic-archive/page.tsx", root), "utf8"),
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("vite.config.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const source of [schema, bootstrap, migration]) {
    assert.match(source, /hot_topic_archive/);
    for (const field of ["archive_date", "topic_name", "platform", "heat_value", "ai_score", "recommendation_level", "recommended_title", "content_direction", "related_post_id", "effect_score"]) {
      assert.match(source, new RegExp(field));
    }
  }
  assert.doesNotMatch(migration, /ALTER TABLE [`"]?(?:hot_topics|hot_topic_analysis|hot_topic_feedback)/);
  assert.match(helper, /FROM hot_topics h/);
  assert.match(helper, /LEFT JOIN hot_topic_analysis/);
  assert.match(helper, /LEFT JOIN hot_topic_feedback/);
  assert.match(helper, /ON CONFLICT\(archive_date, hot_topic_id\) DO UPDATE/);
  for (const sheet of ["报告总览", "原始热点", "AI分析", "推荐建议", "效果复盘"]) assert.match(helper, new RegExp(sheet));
  assert.match(helper, /XLSX\.write/);
  assert.match(helper, /_新媒体热点分析报告\.xlsx/);
  assert.match(helper, /uploads\.put/);
  assert.match(api, /archive_date = \?/);
  assert.match(api, /topicType/);
  assert.match(download, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(download, /content-disposition/);
  for (const label of ["热点历史查询", "生成当日报告", "下载Excel", "日期", "平台", "热点类型"]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(shell, /href: "\/hot-topic-archive", label: "热点档案库"/);
  assert.match(worker, /async scheduled/);
  assert.match(worker, /generateAndStoreDailyArchive/);
  assert.match(vite, /30 0 \* \* \*/);
  assert.match(styles, /archive-kpi-grid/);
  assert.match(styles, /archive-table/);
});

test("AI content planning V1.0 closes hotspot to plan, task, post and seven-day review", async () => {
  const [schema, bootstrap, migration, engine, api, page, shell, worker, styles] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0022_content_planning_v1.sql", root), "utf8"),
    readFile(new URL("lib/content-planning.ts", root), "utf8"),
    readFile(new URL("app/api/content-planning/route.ts", root), "utf8"),
    readFile(new URL("app/content-planning/page.tsx", root), "utf8"),
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const source of [schema, bootstrap, migration]) {
    assert.match(source, /content_plans/);
    assert.match(source, /content_plan_feedback/);
    for (const field of ["hot_topic_id", "title", "script", "shot_list", "cover_text", "hashtags", "publish_time", "status", "created_time"]) assert.match(source, new RegExp(field));
    for (const field of ["plan_id", "post_id", "views", "likes", "comments", "favorites", "shares", "effect_score", "ai_summary"]) assert.match(source, new RegExp(field));
  }
  assert.match(migration, /REFERENCES `hot_topics`/);
  assert.match(migration, /REFERENCES `content_tasks`/);
  assert.match(migration, /REFERENCES `social_posts`/);
  assert.match(engine, /generateContentPlan/);
  assert.match(engine, /titleOptions/);
  assert.match(engine, /shotList/);
  assert.match(engine, /calculatePlanFeedback/);
  assert.match(engine, /julianday\(\?\) - julianday\(p\.publish_time\) >= 7/);
  assert.match(api, /FROM hot_topics/);
  assert.match(api, /hot_topic_analysis/);
  assert.match(api, /hot_topic_feedback/);
  assert.match(api, /collection_logs/);
  assert.match(api, /INSERT INTO content_tasks/);
  assert.match(api, /related_post_id = \?/);
  assert.match(api, /platform = 'douyin'/);
  for (const label of ["今日推荐选题 TOP5", "查看方案", "生成任务", "短视频标题（5个）", "视频脚本", "拍摄分镜", "封面文案", "推荐发布时间", "推荐标签", "推荐话题", "推荐背景音乐", "直播主题", "预计播放量", "预计互动率", "涨粉预估", "内容任务", "发布效果", "AI复盘"]) assert.match(page, new RegExp(label));
  assert.match(shell, /href: "\/ai-planning", label: "AI内容策划中心", code: "06"/);
  assert.match(worker, /refreshContentPlanFeedback/);
  assert.match(styles, /planning-topic-grid/);
  assert.match(styles, /planning-workspace/);
  assert.match(styles, /planning-review-grid/);
  assert.doesNotMatch(page, /快手|微博/);
});

test("task management V2.0 provides an eight-stage Kanban, automatic post matching and weekly execution report", async () => {
  const [schema, bootstrap, migration, backfill, helper, api, page, planningApi, worker, styles, readme] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("drizzle/0023_task_management_v2.sql", root), "utf8"),
    readFile(new URL("drizzle/0024_task_source_backfill.sql", root), "utf8"),
    readFile(new URL("lib/task-management.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/route.ts", root), "utf8"),
    readFile(new URL("app/tasks/page.tsx", root), "utf8"),
    readFile(new URL("app/api/content-planning/route.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
  ]);
  for (const source of [schema, bootstrap, migration]) {
    for (const field of ["source_type", "source_id", "collaborators", "priority", "related_post_id", "completed_at", "updated_at"]) {
      assert.match(source, new RegExp(field));
    }
  }
  for (const status of ["planning", "shoot_pending", "shooting", "edit_pending", "review_pending", "publish_pending", "published", "reviewed"]) {
    assert.match(helper, new RegExp(status));
    assert.match(page, new RegExp(status));
  }
  for (const label of ["待策划", "待拍摄", "拍摄中", "待剪辑", "待审核", "待发布", "已发布", "已复盘", "热点监测中心", "AI内容策划中心", "人工创建", "节日活动", "运营周报", "负责人"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /draggable/);
  assert.match(page, /onDrop/);
  assert.match(helper, /titleSimilarity/);
  assert.match(helper, /same|platform === task\.platform/);
  assert.match(helper, /refreshContentPlanFeedback/);
  assert.match(helper, /status = 'reviewed'/);
  assert.match(backfill, /source_type` = 'ai_content_plan'/);
  assert.match(backfill, /content_plans/);
  assert.match(api, /content_plan_feedback/);
  assert.match(api, /collection_logs/);
  assert.match(api, /buildWeeklyReport/);
  assert.match(api, /export async function PUT/);
  assert.match(planningApi, /'ai_content_plan'/);
  assert.match(planningApi, /'planning'/);
  assert.match(worker, /syncTaskPostAssociations/);
  assert.match(styles, /task-kanban-board/);
  assert.match(styles, /task-weekly-report/);
  assert.match(readme, /任务管理中心 V2\.0/);
});

test("marketing operations V1.0 is a read-only daily hub backed by existing modules", async () => {
  const [api, page, shell, styles, dashboard, readme] = await Promise.all([
    readFile(new URL("app/api/marketing-operations/route.ts", root), "utf8"),
    readFile(new URL("app/marketing-operations/page.tsx", root), "utf8"),
    readFile(new URL("components/AppShell.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/dashboard/route.ts", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
  ]);
  for (const source of ["hot_topics", "hot_topic_analysis", "content_tasks", "content_plans", "content_plan_feedback", "social_posts", "fan_growth_records", "collection_logs"]) {
    assert.match(api, new RegExp(source));
  }
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|INSERT INTO|DELETE FROM/);
  for (const label of ["今日待办", "今日推荐热点", "今日待拍内容", "今日待发布内容", "今日逾期任务", "今日待复盘内容", "运营日历", "发布计划", "直播计划", "营销活动", "节假日", "热点事件", "营销目标", "AI每日简报", "今日热点", "昨日最佳作品", "风险提醒", "今日建议与运营动作"]) {
    assert.match(page, new RegExp(label));
  }
  for (const label of ["本月作品完成率", "本月直播完成率", "粉丝增长完成率", "播放目标完成率"]) {
    assert.match(api, new RegExp(label));
  }
  assert.match(api, /timeZone: "Asia\/Shanghai"/);
  assert.match(api, /requestedMonth/);
  assert.match(api, /recommendationLevel/);
  assert.match(page, /shiftMonth/);
  assert.match(page, /未设目标/);
  assert.match(shell, /href: "\/overview", label: "总览", code: "01"/);
  assert.match(styles, /operations-todo-grid/);
  assert.match(styles, /operations-calendar-grid/);
  assert.match(styles, /marketing-goals-grid/);
  assert.match(styles, /operations-brief-grid/);
  assert.match(dashboard, /status IN \('published', 'reviewed'\)/);
  assert.match(readme, /营销运营中心 V1\.0/);
});

test("production build artifacts exist", async () => {
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/client", root));
});
