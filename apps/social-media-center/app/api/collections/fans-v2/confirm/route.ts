import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import {
  FAN_V2_SOURCE_FILE,
  normalizeDouyinFansV2,
  summarizeDouyinFansV2,
  validateDouyinFansV2,
} from "@/lib/douyin-fans-v2";

type BatchRow = { batch_id: number; status: string };

export async function POST(request: Request) {
  const body = await request.json() as { payload?: unknown; sourceFile?: string; confirmed?: boolean };
  if (body.confirmed !== true) {
    return Response.json({ error: "必须人工确认后才能写入粉丝数据库" }, { status: 409 });
  }
  const sourceFile = body.sourceFile?.trim() || FAN_V2_SOURCE_FILE;
  const payload = normalizeDouyinFansV2(body.payload, sourceFile);
  if (!payload) return Response.json({ error: "抖音粉丝V2.0确认参数无效" }, { status: 400 });
  const errors = validateDouyinFansV2(payload);
  if (errors.length) return Response.json({ error: "确认前复核失败，未写入数据库", errors }, { status: 422 });

  await ensureDatabase();
  const d1 = getD1();
  await d1.prepare(`INSERT INTO social_accounts
      (platform, account_name, account_id, followers_count, status)
    VALUES ('douyin', ?, 'dushanzi_daxigu_douyin', ?, 'active')
    ON CONFLICT(platform, account_id) DO UPDATE SET
      account_name = excluded.account_name,
      followers_count = excluded.followers_count,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP`)
    .bind(payload.accountName, payload.fansCount).run();
  const account = await d1.prepare(`SELECT id FROM social_accounts
    WHERE platform = 'douyin' AND account_id = 'dushanzi_daxigu_douyin' LIMIT 1`).first<{ id: number }>();
  if (!account) return Response.json({ error: "抖音账号初始化失败，未写入粉丝数据" }, { status: 500 });

  const existing = await d1.prepare(`SELECT batch_id, status FROM fan_collection_batches
    WHERE platform = 'douyin' AND account_id = ? AND source_file = ? LIMIT 1`)
    .bind(account.id, sourceFile).first<BatchRow>();
  if (existing && existing.status !== "failed") {
    return Response.json({
      message: "同一粉丝采集批次已存在，未重复写入",
      duplicate: true,
      duplicateCount: 1,
      batchId: existing.batch_id,
      status: existing.status,
      inserted: { socialFans: 0, fanGrowthRecords: 0, fanProfileRecords: 0, followKeywords: 0 },
    });
  }

  let batchId: number;
  if (existing?.status === "failed") {
    batchId = existing.batch_id;
    await d1.prepare(`UPDATE fan_collection_batches SET
      collection_date = ?, data_period = ?, raw_metric_count = ?, success_metric_count = ?,
      unavailable_metric_count = ?, status = 'pending' WHERE batch_id = ?`)
      .bind(payload.snapshotDate, JSON.stringify(payload.dataPeriods), payload.rawMetricCount,
        payload.successMetricCount, payload.unavailableMetricCount, batchId).run();
  } else {
    const batchResult = await d1.prepare(`INSERT INTO fan_collection_batches
        (platform, account_id, collection_date, source_file, data_period, raw_metric_count,
         success_metric_count, unavailable_metric_count, status)
      VALUES ('douyin', ?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .bind(
        account.id,
        payload.snapshotDate,
        sourceFile,
        JSON.stringify(payload.dataPeriods),
        payload.rawMetricCount,
        payload.successMetricCount,
        payload.unavailableMetricCount,
      ).run();
    batchId = Number(batchResult.meta.last_row_id);
  }
  const collectedAt = new Date(payload.collectionTime).toISOString();
  const profileChunkSize = 8;
  const profileStatements = Array.from({ length: Math.ceil(payload.profiles.length / profileChunkSize) }, (_, chunkIndex) => {
    const profiles = payload.profiles.slice(chunkIndex * profileChunkSize, (chunkIndex + 1) * profileChunkSize);
    const values = profiles.map(() => "(?, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const bindings = profiles.flatMap((profile) => [
      batchId, account.id, payload.snapshotDate, profile.dimensionType, profile.dimensionName,
      profile.dimensionValue, profile.percentage, profile.ranking, profile.rawValue, collectedAt,
    ]);
    return d1.prepare(`INSERT INTO fan_profile_records
        (batch_id, platform, account_id, snapshot_date, dimension_type, dimension_name,
         dimension_value, percentage, ranking, raw_value, collection_time)
      VALUES ${values}`).bind(...bindings);
  });
  const summary = summarizeDouyinFansV2(payload);

  try {
    await d1.batch([
      d1.prepare("UPDATE social_accounts SET followers_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(payload.fansCount, account.id),
      d1.prepare(`INSERT INTO social_fans
          (account_id, platform, account_name, snapshot_date, fans_count, display_fans_count,
           male_ratio, female_ratio, collection_time, data_period, gender_distribution,
           age_distribution, region_distribution, interest_distribution, active_time_distribution,
           source_type, source_record_id, raw_payload, batch_id, collected_at)
        VALUES (?, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]',
          'chrome', ?, ?, ?, ?)`)
        .bind(
          account.id,
          payload.accountName,
          payload.snapshotDate,
          payload.fansCount,
          payload.displayFansCount,
          payload.maleRatio,
          payload.femaleRatio,
          collectedAt,
          JSON.stringify(payload.dataPeriods),
          payload.sourceRecordId,
          JSON.stringify(payload.rawPayload),
          batchId,
          collectedAt,
        ),
      ...payload.growth.map((growth) => d1.prepare(`INSERT INTO fan_growth_records
          (account_id, platform, record_date, batch_id, snapshot_date, period_type, period_start,
           period_end, fans_count, net_growth, new_fans, lost_fans, new_followers, lost_followers,
           returning_followers, collection_time, source_type, source_record_id, raw_payload)
        VALUES (?, 'douyin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chrome', ?, ?)`)
        .bind(
          account.id,
          growth.periodEnd,
          batchId,
          payload.snapshotDate,
          growth.periodType,
          growth.periodStart,
          growth.periodEnd,
          growth.fansCount,
          growth.netGrowth,
          growth.newFollowers,
          growth.lostFollowers,
          growth.newFollowers,
          growth.lostFollowers,
          growth.returningFollowers,
          collectedAt,
          `${payload.sourceRecordId}:${growth.periodType}`,
          JSON.stringify(growth.rawPayload),
        )),
      ...profileStatements,
      d1.prepare("UPDATE fan_collection_batches SET status = 'completed' WHERE batch_id = ?").bind(batchId),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "粉丝数据批次写入失败";
    await d1.prepare("UPDATE fan_collection_batches SET status = 'failed' WHERE batch_id = ?").bind(batchId).run();
    return Response.json({ error: message, batchId, databaseWritten: false }, { status: 500 });
  }

  return Response.json({
    message: "抖音真实粉丝数据已按V2.0模型入库",
    duplicate: false,
    duplicateCount: 0,
    batchId,
    inserted: {
      socialFans: 1,
      fanGrowthRecords: summary.growthRecords,
      fanProfileRecords: summary.profileRecords,
      followKeywords: summary.followKeywords,
      unavailable: summary.unavailable,
    },
    databaseWritten: true,
  });
}
