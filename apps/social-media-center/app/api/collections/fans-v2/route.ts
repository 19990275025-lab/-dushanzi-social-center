import {
  FAN_V2_SOURCE_FILE,
  normalizeDouyinFansV2,
  summarizeDouyinFansV2,
  validateDouyinFansV2,
} from "@/lib/douyin-fans-v2";

export async function POST(request: Request) {
  const body = await request.json() as { payload?: unknown; sourceFile?: string } | Record<string, unknown>;
  const payloadValue = "payload" in body ? body.payload : body;
  const sourceFile = typeof body.sourceFile === "string" && body.sourceFile.trim() ? body.sourceFile.trim() : FAN_V2_SOURCE_FILE;
  const payload = normalizeDouyinFansV2(payloadValue, sourceFile);
  if (!payload) return Response.json({ error: "抖音粉丝V2.0原始文件结构无效" }, { status: 400 });

  const errors = validateDouyinFansV2(payload);
  if (errors.length) return Response.json({ error: "粉丝数据校验失败，未写入数据库", errors }, { status: 422 });

  return Response.json({
    message: "粉丝数据模型V2.0预览已生成，未写入数据库",
    preview: {
      accountName: payload.accountName,
      snapshotDate: payload.snapshotDate,
      fansCount: payload.fansCount,
      displayFansCount: payload.displayFansCount,
      growth: payload.growth,
      summary: summarizeDouyinFansV2(payload),
      dataPeriods: payload.dataPeriods,
    },
    confirmed: false,
    databaseWritten: false,
  });
}
