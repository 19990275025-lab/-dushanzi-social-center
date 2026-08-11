import { env } from "cloudflare:workers";

export const DATA_COLLECTION_V2_MAX_BYTES = 2 * 1024 * 1024;

export function collectionApiHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-collector-key",
  };
}

export function collectionApiJson(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { ...collectionApiHeaders(), ...init?.headers },
  });
}

export function collectionApiAuthorized(request: Request) {
  const key = (env as unknown as { EXTERNAL_AGENT_API_KEY?: string }).EXTERNAL_AGENT_API_KEY?.trim();
  return !key || request.headers.get("x-collector-key") === key;
}

export function parsePositiveId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseJsonObject<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

export function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}
