import {
  normalizeDouyinCollectionV2,
  summarizeDouyinCollectionV2,
  validateDouyinCollectionV2,
} from "@/lib/douyin-collection-v2";

export async function POST(request: Request) {
  const payload = normalizeDouyinCollectionV2(await request.json());
  if (!payload) return Response.json({ error: "V2.1 采集文件结构无效" }, { status: 400 });

  const errors = validateDouyinCollectionV2(payload);
  if (errors.length) return Response.json({ error: "采集数据校验失败，未写入数据库", errors }, { status: 422 });

  const summary = summarizeDouyinCollectionV2(payload);
  return Response.json({
    payload,
    summary,
    message: summary.eligibleForConfirmation
      ? "V2.1 数据已生成无落库预览，三类完整率均达到 80%，等待人工确认"
      : "V2.1 数据已生成无落库预览，完整率未全部达到 80%，禁止确认入库",
  });
}
