import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeEnv = {
  DB?: D1Database;
  LOAD_TEST_DATA?: string;
};

export function getD1() {
  const runtimeEnv = env as unknown as RuntimeEnv;

  if (!runtimeEnv.DB) {
    throw new Error("新媒体运营数据库连接不可用");
  }

  return runtimeEnv.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function shouldLoadTestData() {
  return (env as unknown as RuntimeEnv).LOAD_TEST_DATA === "true";
}
