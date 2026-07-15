import { loadEnv } from "@xlb/config";
import { pingMysql } from "../dal/db.js";
import { pingRedis } from "../dal/redisClient.js";
import { XLB_RUNTIME_STATUS } from "../projectStatus.js";

export type DbHealthStatus = {
  ok: boolean;
  mysql: "ok" | "error";
  redis: "ok" | "error";
  database: string;
  phase: string;
};

async function safePing(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

export async function checkDbHealth(): Promise<DbHealthStatus> {
  const env = loadEnv();
  const mysqlOk = await safePing(pingMysql);
  const redisOk = await safePing(pingRedis);

  return {
    ok: mysqlOk && redisOk,
    mysql: mysqlOk ? "ok" : "error",
    redis: redisOk ? "ok" : "error",
    database: env.mysqlDatabase,
    phase: XLB_RUNTIME_STATUS.phase,
  };
}
