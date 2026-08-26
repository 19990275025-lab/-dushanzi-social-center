import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { confirmKuaishou } from "@/lib/kuaishou-adapter-service";
import { authorizedKuaishou } from "../route";

export async function POST(request: Request) {
  if (!authorizedKuaishou(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmed?: boolean; logId?: number; checksum?: string } | null;
  if (body?.confirmed !== true || !Number.isSafeInteger(body.logId) || !/^[a-f0-9]{64}$/.test(body.checksum ?? "")) {
    return Response.json({ error: "必须确认预览logId和checksum；阶段3A仅处理所选两条" }, { status: 409 });
  }
  try {
    await ensureDatabase();
    return Response.json(await confirmKuaishou(getD1(), body.logId!, body.checksum!), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "快手样本写入失败" }, { status: 422 });
  }
}
