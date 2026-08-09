import {
  normalizeDouyinCollectionV3,
  summarizeDouyinCollectionV3,
  validateDouyinCollectionV3,
} from "@/lib/douyin-collection-v3";

export async function POST(request: Request) {
  const payload = normalizeDouyinCollectionV3(await request.json());
  if (!payload) return Response.json({ error: "V3.0 采集文件结构无效" }, { status: 400 });
  const errors = validateDouyinCollectionV3(payload);
  if (errors.length) return Response.json({ error: "采集数据校验失败，未写入数据库", errors }, { status: 422 });
  return Response.json({
    payload,
    summary: summarizeDouyinCollectionV3(payload),
    message: "V3.0 数据已生成无落库预览，等待人工确认",
  });
}
