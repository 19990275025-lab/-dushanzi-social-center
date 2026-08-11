import { ensureDatabase } from "@/db/bootstrap";
import { getD1, getUploads } from "@/db";
import { archiveFileName, archiveObjectKey, beijingDate, generateAndStoreDailyArchive } from "@/lib/hot-topic-archive";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  await ensureDatabase();
  const value = new URL(request.url).searchParams.get("date") ?? "";
  const date = datePattern.test(value) ? value : beijingDate();
  const uploads = getUploads();
  let object = await uploads.get(archiveObjectKey(date));
  if (!object) {
    await generateAndStoreDailyArchive(getD1(), uploads, date);
    object = await uploads.get(archiveObjectKey(date));
  }
  if (!object) return Response.json({ error: "该日期暂无热点档案数据" }, { status: 404 });
  const fileName = archiveFileName(date);
  return new Response(object.body, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, max-age=300",
    },
  });
}
