import { ensureDatabase } from "@/db/bootstrap";
import { getD1, getUploads } from "@/db";
import { beijingDate } from "@/lib/hot-topic-archive";
import { collectionApiAuthorized, collectionApiJson } from "@/lib/data-collection-api-v2";
import {
  failWorkBuddyRelay,
  finalizeWorkBuddyRelay,
  getWorkBuddyRelayStatus,
  preflightWorkBuddyRelay,
  startWorkBuddyRelay,
  workBuddyFileDate,
} from "@/lib/workbuddy-relay";

export async function OPTIONS() {
  return collectionApiJson({}, { status: 204 });
}

export async function GET() {
  await ensureDatabase();
  return collectionApiJson(await getWorkBuddyRelayStatus(getD1(), beijingDate()));
}

export async function POST(request: Request) {
  if (!collectionApiAuthorized(request)) return collectionApiJson({ error: "采集接口密钥无效" }, { status: 401 });
  await ensureDatabase();
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");
  const fileName = String(payload.fileName ?? "").trim();
  const fileDate = String(payload.fileDate ?? "").trim();
  if (!fileName || !fileDate || workBuddyFileDate(fileName) !== fileDate) {
    return collectionApiJson({ error: "WorkBuddy文件名或文件日期无效" }, { status: 400 });
  }
  const d1 = getD1();
  try {
    if (action === "start") {
      return collectionApiJson(await startWorkBuddyRelay(d1, {
        fileName,
        fileDate,
        originalCount: Number(payload.originalCount),
        standardizedCount: Number(payload.standardizedCount),
      }));
    }
    if (action === "finalize") {
      return collectionApiJson(await finalizeWorkBuddyRelay(d1, getUploads(), {
        relayLogId: Number(payload.relayLogId),
        fileName,
        fileDate,
        originalCount: Number(payload.originalCount),
        standardizedCount: Number(payload.standardizedCount),
        batchIds: Array.isArray(payload.batchIds) ? payload.batchIds.map(Number) : [],
      }));
    }
    if (action === "preflight") {
      return collectionApiJson(await preflightWorkBuddyRelay(d1, {
        relayLogId: Number(payload.relayLogId),
        fileName,
        fileDate,
        standardizedCount: Number(payload.standardizedCount),
        batchIds: Array.isArray(payload.batchIds) ? payload.batchIds.map(Number) : [],
      }));
    }
    if (action === "fail") {
      return collectionApiJson(await failWorkBuddyRelay(d1, {
        relayLogId: payload.relayLogId ? Number(payload.relayLogId) : null,
        fileName,
        fileDate,
        stage: String(payload.stage ?? "detect") as Parameters<typeof failWorkBuddyRelay>[1]["stage"],
        reason: String(payload.reason ?? "未知失败原因"),
        originalCount: payload.originalCount === undefined ? undefined : Number(payload.originalCount),
        standardizedCount: payload.standardizedCount === undefined ? undefined : Number(payload.standardizedCount),
      }));
    }
    return collectionApiJson({ error: "不支持的自动接力操作" }, { status: 400 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "自动接力处理失败";
    if (action === "finalize") {
      await failWorkBuddyRelay(d1, {
        relayLogId: Number(payload.relayLogId), fileName, fileDate,
        stage: /档案/.test(reason) ? "archive" : /内容策划/.test(reason) ? "content_planning" : /分析/.test(reason) ? "ai_analysis" : "confirm",
        reason,
        originalCount: Number(payload.originalCount) || 0,
        standardizedCount: Number(payload.standardizedCount) || 0,
      });
    }
    return collectionApiJson({ error: reason }, { status: 409 });
  }
}
