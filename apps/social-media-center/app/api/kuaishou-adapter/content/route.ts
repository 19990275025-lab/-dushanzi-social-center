import { ensureDatabase } from "@/db/bootstrap";
import { getD1 } from "@/db";
import { resolveDateRange } from "@/lib/date-range";
import { readKuaishouContent, readKuaishouDetail, readKuaishouFans } from "@/lib/kuaishou-content-data";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  if (search.has("platform") && search.get("platform") !== "kuaishou") return Response.json({ error: "platform_mismatch" }, { status: 400 });
  await ensureDatabase();
  if (search.has("id")) {
    const id = Number(search.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "invalid_id" }, { status: 400 });
    const data = await readKuaishouDetail(getD1(), id);
    return data ? Response.json(data) : Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ...await readKuaishouContent(getD1(), resolveDateRange(search)), fans: await readKuaishouFans(getD1()) });
}
