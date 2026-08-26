import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const realFile = process.env.KUAISHOU_REAL_FILE ?? "/Users/akram/Desktop/新媒体内容监测/快手/kuaishou_daily_monitor_20260822.json";
const backupFile = process.env.KUAISHOU_BASELINE_DB ?? resolve(root, "outputs/kuaishou-pre-adapter-20260826.nm48ul/local-d1.sqlite");
const cache = new Map();
async function moduleUrl(file) {
  if (cache.has(file)) return cache.get(file);
  let source = ts.transpileModule(await readFile(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const match of [...source.matchAll(/from ["'](\.\.?\/[^"']+)["']/g)]) {
    const child = await moduleUrl(resolve(dirname(file), `${match[1]}.ts`));
    source = source.replace(match[0], `from ${JSON.stringify(child)}`);
  }
  source += `\n//# sourceURL=${file}\n`;
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(file, url); return url;
}
const load = async file => import(await moduleUrl(resolve(root, file)));
export function sqliteD1(sqlite) {
  return {
    prepare(sql) {
      let values = [];
      return { bind(...v) { values = v; return this; },
        async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async run() { const r = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
function openCopy() {
  // Only a disposable in-memory copy is changed; no source / real business database mutation.
  const original = new DatabaseSync(backupFile, { readOnly: true });
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=OFF");
  const schema = original.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END").all();
  for (const row of schema.filter(s => s.type === "table")) {
    db.exec(row.sql);
    const data = original.prepare(`SELECT * FROM "${row.name}"`).all();
    for (const record of data) db.prepare(`INSERT INTO "${row.name}" (${Object.keys(record).map(k => `"${k}"`).join(",")}) VALUES (${Object.keys(record).map(() => "?").join(",")})`).run(...Object.values(record));
  }
  for (const row of schema.filter(s => s.type !== "table")) db.exec(row.sql);
  db.exec("PRAGMA foreign_keys=ON"); original.close(); return db;
}
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tables = ["social_posts", "social_post_snapshots", "social_post_metric_series", "social_post_traffic", "social_post_traffic_sources", "social_post_paid_traffic", "social_post_audience", "social_post_comment_keywords", "social_comments", "social_comment_replies", "social_post_evaluations"];
function baseline(db) { return new Map(tables.map(t => [t, { columns: db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name), rows: db.prepare(`SELECT * FROM ${t} ORDER BY id`).all() }])); }
function unchanged(db, before) { for (const [t, b] of before) for (const row of b.rows) {
  const after = db.prepare(`SELECT ${b.columns.join(",")} FROM ${t} WHERE id=?`).get(row.id);
  assert.equal(hash(after), hash(row), `frozen row changed: ${t}/${row.id}`);
} }
let present = true;
try { await access(realFile); await access(backupFile); } catch { present = false; }

test("Kuaishou migration source matches reviewed Drizzle SQL", async () => {
  const { kuaishouAdapterMigration } = await load("db/kuaishou-adapter-schema.ts");
  assert.equal(kuaishouAdapterMigration.trim(), (await readFile(resolve(root, "drizzle/0032_kuaishou_adapter_v1.sql"), "utf8")).trim());
  assert.doesNotMatch(kuaishouAdapterMigration, /PRAGMA foreign_keys=OFF/);
});

test("Stage3A real-file acceptance, migrations, import, isolation and deduplication", { skip: !present && "Requires actual WorkBuddy file and read-only baseline backup; no mock fixture fallback" }, async t => {
  const rawText = await readFile(realFile, "utf8"), originalHash = hash(rawText);
  const { normalizeKuaishouDaily, selectKuaishouSample } = await load("lib/kuaishou-adapter.ts");
  const { previewKuaishou, confirmKuaishou, kuaishouCounts } = await load("lib/kuaishou-adapter-service.ts");
  const { ensureKuaishouAdapterSchema, kuaishouAdapterMigration } = await load("db/kuaishou-adapter-schema.ts");
  const { readKuaishouContent, readKuaishouDetail, readKuaishouFans } = await load("lib/kuaishou-content-data.ts");
  const { KuaishouEvaluationStrategy } = await load("lib/kuaishou-evaluation.ts");
  const batch = normalizeKuaishouDaily(JSON.parse(rawText));
  const selectedPostIds = ["3xnbhb99sxti6gy", "3xffm3ri4q6966y"];
  const selected = selectKuaishouSample(batch, selectedPostIds);
  const input = { rawText, sourceFile: "kuaishou_daily_monitor_20260822.json", sourcePath: realFile, selectedPostIds };
  const db = openCopy(), d1 = sqliteD1(db), before = baseline(db);
  try {
    await t.test("exact real schema, missing values and actual rather than benchmark curves", () => {
      assert.equal(batch.date, "2026-08-22"); assert.equal(batch.posts.length, 5); assert.equal(batch.fans, 341);
      assert.equal(selected.reduce((n, p) => n + p.series.length, 0), 236);
      assert.equal(selected.reduce((n, p) => n + p.sources.length, 0), 70);
      assert.equal(selected.reduce((n, p) => n + p.comments.length, 0), 3);
      assert.equal(selected[0].durationSeconds, 16.7);
      assert.ok(Math.abs(selected[0].quality.avgSeconds - 3.380615) < 1e-9);
      assert.equal(selected[0].quality.completion, 0); // Platform actually reported zero, not a default.
      assert.equal(selected[0].comments[0].publishTime, null);
      assert.equal(selected[0].availability.like_second, "no_data");
      assert.equal(selected[0].availability.audience_age, "unavailable");
      assert.ok(selected.every(p => p.series.every(s => !s.sourcePath.includes("hotDetailList"))));
    });
    await t.test("atomic migration preserves every frozen value including reply rows", async () => {
      db.exec("BEGIN");
      try { for (const sql of kuaishouAdapterMigration.split("--> statement-breakpoint")) if (sql.trim()) db.exec(sql); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
      unchanged(db, before); assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      await ensureKuaishouAdapterSchema(d1); unchanged(db, before);
      db.exec("SAVEPOINT legacy_title_compatibility");
      try {
        const p = db.prepare("SELECT * FROM social_posts WHERE platform='douyin' AND platform_post_id IS NOT NULL LIMIT 1").get();
        db.prepare(`INSERT INTO social_posts(account_id,platform,title,content_type,publish_time,views)
          VALUES(?,?,?,?,?,?) ON CONFLICT(account_id,title) WHERE platform <> 'kuaishou' OR platform_post_id IS NULL
          DO UPDATE SET views=excluded.views`).run(p.account_id,p.platform,p.title,p.content_type,p.publish_time,p.views);
        assert.equal(db.prepare("SELECT count(*) AS n FROM social_posts WHERE platform='douyin' AND account_id=? AND title=?").get(p.account_id,p.title).n, 1);
        unchanged(db, before);
      } finally { db.exec("ROLLBACK TO legacy_title_compatibility; RELEASE legacy_title_compatibility"); }
    });
    await t.test("same real identity can exist in another platform/account without collisions", () => {
      db.exec("SAVEPOINT identity_probe");
      try {
        const account = db.prepare("SELECT id FROM social_accounts WHERE platform='douyin' LIMIT 1").get();
        const p = db.prepare("SELECT * FROM social_posts WHERE platform='douyin' AND platform_post_id IS NOT NULL LIMIT 1").get();
        // Constraint-only projection in rollback scope. No test metric is ever persisted or scored.
        db.prepare("INSERT INTO social_accounts(platform,account_id,account_name) VALUES('kuaishou',?,?)").run(batch.accountId, batch.accountName);
        const aid = db.prepare("SELECT id FROM social_accounts WHERE platform='kuaishou' AND account_id=?").get(batch.accountId).id;
        db.prepare("INSERT INTO social_posts(platform,account_id,platform_post_id,title,content_type,publish_time) VALUES('kuaishou',?,?,?,?,?)").run(aid, p.platform_post_id, selected[0].title, "video", selected[0].publishTime);
        assert.equal(db.prepare("SELECT count(*) AS n FROM social_posts WHERE platform_post_id=?").get(p.platform_post_id).n, 2);
        assert.ok(account);
      } finally { db.exec("ROLLBACK TO identity_probe; RELEASE identity_probe"); }
    });
    const preview = await previewKuaishou(d1, input);
    await t.test("preview only stages; public business tables unchanged", async () => {
      assert.equal(preview.summary.selectedPosts, 2); assert.equal(preview.summary.databaseNewPosts, 2);
      assert.equal((await kuaishouCounts(d1)).social_posts, 0); unchanged(db, before);
    });
    const result = await confirmKuaishou(d1, preview.logId, preview.checksum);
    await t.test("two real works, exact snapshot/series/source/comment/fan counts", () => {
      assert.equal(result.status, "completed");
      assert.equal(result.changes.social_posts, 2); assert.equal(result.changes.social_post_snapshots, 2);
      assert.equal(result.changes.social_post_metric_series, 236); assert.equal(result.changes.social_post_traffic_sources, 70);
      assert.equal(result.changes.social_comments, 3); assert.equal(result.changes.social_fans, 1);
      assert.equal(result.changes.social_post_audience, 0); assert.equal(result.changes.social_post_comment_keywords, 0);
      assert.equal(result.changes.social_post_evaluations, 2);
      assert.equal(db.prepare("SELECT status FROM content_collection_files WHERE checksum=?").get(preview.checksum).status, "validated");
    });
    await t.test("five source dimensions coexist; support is not a paid campaign", () => {
      const rows = db.prepare("SELECT metric_dimension,traffic_value FROM social_post_traffic_sources WHERE snapshot_id=(SELECT id FROM social_post_snapshots WHERE platform='kuaishou' LIMIT 1) AND source_name='发现页'").all();
      assert.equal(rows.length, 5); assert.deepEqual(new Set(rows.map(r => r.metric_dimension)), new Set(["play", "like", "comment", "completion", "follow"]));
      assert.equal(db.prepare("SELECT count(*) AS n FROM social_post_paid_traffic WHERE promotion_source='kuaishou_fentiao' AND promotion_present=1").get().n, 0);
      assert.equal(db.prepare("SELECT count(*) AS n FROM social_post_paid_traffic WHERE promotion_source='kuaishou_platform_support' AND promotion_present=1").get().n, 2);
      assert.equal(db.prepare("SELECT count(*) AS n FROM social_comments WHERE platform='kuaishou' AND comment_time IS NULL").get().n, 3);
    });
    await t.test("platform-native scoring; no audience/keywords or natural-breakout assumption", () => {
      for (const p of selected) {
        const score = KuaishouEvaluationStrategy.evaluate(p, selected);
        assert.equal(score.platform, "kuaishou"); assert.equal(score.isNaturalBreakout, false);
        assert.equal(score.promotionType, "platform_support"); assert.equal(score.naturalViews, null);
        assert.deepEqual(Object.keys(score.dimensions), ["propagation", "interaction", "viewing", "followers"]);
        assert.equal(score.confidence, "low");
      }
    });
    await t.test("missing optional fields stay NULL and fail quality checks without fake zeros", () => {
      const missing = JSON.parse(rawText); delete missing.posts[0].content_quality.finish_rate_percent; delete missing.posts[0].comments.list[0].liked_count;
      const normalized = normalizeKuaishouDaily(missing);
      assert.equal(normalized.posts[0].quality.completion, null); assert.equal(normalized.posts[0].comments[0].likes, null);
      assert.equal(normalized.posts[0].comments[0].availability.like_count, "unavailable");
      db.exec("SAVEPOINT nullability_probe");
      try {
        db.prepare("UPDATE social_comments SET likes=NULL,reply_count=NULL,username=NULL WHERE platform='kuaishou'").run();
        assert.equal(db.prepare("SELECT count(*) AS n FROM social_comments WHERE platform='kuaishou' AND likes IS NULL AND reply_count IS NULL").get().n, 3);
      } finally { db.exec("ROLLBACK TO nullability_probe; RELEASE nullability_probe"); }
    });
    await t.test("same batch rejected on repeated preview/confirmation and source file remains intact", async () => {
      const counts = await kuaishouCounts(d1);
      assert.equal((await confirmKuaishou(d1, preview.logId, preview.checksum)).status, "already_processed");
      assert.equal((await previewKuaishou(d1, input)).status, "already_processed");
      assert.deepEqual(await kuaishouCounts(d1), counts);
      assert.equal(hash(await readFile(realFile, "utf8")), originalHash);
    });
    await t.test("existing real monitored master is reused, not inserted again", async () => {
      const copy = openCopy();
      try {
        const connection = sqliteD1(copy);
        await ensureKuaishouAdapterSchema(connection);
        const p = selected.find(p => !p.isNew);
        copy.prepare("INSERT INTO social_accounts(platform,account_id,account_name,followers_count) VALUES('kuaishou',?,?,?)").run(batch.accountId, batch.accountName, batch.fans);
        const account = copy.prepare("SELECT id FROM social_accounts WHERE platform='kuaishou' AND account_id=?").get(batch.accountId);
        // Preexisting master is this same real source record; no fake date, metrics or extra source batch.
        const existing = copy.prepare(`INSERT INTO social_posts(platform,account_id,platform_post_id,title,content_type,publish_time,views,likes,comments,favorites,shares,fans_growth)
          VALUES('kuaishou',?,?,?,?,?,?,?,?,?,?,?)`).run(account.id,p.id,p.title,p.postType,p.publishTime,p.metrics.plays,p.metrics.likes,p.metrics.comments,p.metrics.favorites,p.metrics.shares,p.metrics.followers);
        const staged = await previewKuaishou(connection, input);
        assert.equal(staged.summary.databaseExistingPosts, 1);
        const imported = await confirmKuaishou(connection, staged.logId, staged.checksum);
        assert.equal(imported.changes.social_posts, 1); assert.equal(imported.changes.social_post_snapshots, 2);
        assert.equal(copy.prepare("SELECT id FROM social_posts WHERE platform='kuaishou' AND platform_post_id=?").get(p.id).id, Number(existing.lastInsertRowid));
      } finally { copy.close(); }
    });
    await t.test("mid-transaction failure rolls back every sample business row", async () => {
      const copy = openCopy();
      try {
        const connection = sqliteD1(copy);
        await ensureKuaishouAdapterSchema(connection);
        const staged = await previewKuaishou(connection, input);
        copy.exec("CREATE TRIGGER reject_sample_source BEFORE INSERT ON social_post_traffic_sources BEGIN SELECT RAISE(ABORT, 'test_transaction_failure'); END");
        await assert.rejects(confirmKuaishou(connection, staged.logId, staged.checksum), /test_transaction_failure/);
        assert.ok(Object.values(await kuaishouCounts(connection)).every(n => n === 0));
        assert.equal(copy.prepare("SELECT status FROM collection_logs WHERE id=?").get(staged.logId).status, "failed");
        unchanged(copy, before);
      } finally { copy.close(); }
    });
    await t.test("platform-scoped reads isolate Kuaishou; no fabricated fan profiles", async () => {
      const response = await readKuaishouContent(d1, { preset: "custom", from: "2026-08-15", to: "2026-08-22", label: "test" });
      assert.equal(response.posts.length, 2); assert.ok(response.posts.every(p => p.platform === "kuaishou"));
      const dy = db.prepare("SELECT id FROM social_posts WHERE platform='douyin' LIMIT 1").get();
      assert.equal(await readKuaishouDetail(d1, dy.id), null);
      const fans = await readKuaishouFans(d1); assert.equal(fans.fansCount, 341); assert.equal(fans.profile, null);
      assert.equal(fans.trendStatus, "insufficient_history"); unchanged(db, before);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    });
    console.log(JSON.stringify({ realFile, sampleResult: result.changes, sourcePosts: selectedPostIds, frozenRowsUnchanged: true }));
  } finally { db.close(); }
});
