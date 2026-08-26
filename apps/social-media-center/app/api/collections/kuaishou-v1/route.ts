import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { previewKuaishou, type KuaishouReceive } from "@/lib/kuaishou-adapter-service";

export function authorizedKuaishou(request: Request) {
  const key = (env as unknown as { KUAISHOU_ADAPTER_KEY?: string }).KUAISHOU_ADAPTER_KEY;
  return Boolean(key && request.headers.get("x-kuaishou-adapter-key") === key);
}
export async function POST(request: Request) {
  if (!authorizedKuaishou(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 1_800_000) return Response.json({ error: "文件过大" }, { status: 413 });
    const input = JSON.parse(text) as KuaishouReceive;
    await ensureDatabase();
    return Response.json(await previewKuaishou(getD1(), input), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "快手样本预览失败" }, { status: 422 });
  }
}
