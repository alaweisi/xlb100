import { loadEnv } from "@xlb/config";
import { pingMysql } from "../dal/db.js";
import { pingRedis } from "../dal/redisClient.js";

export type DbHealthStatus = {
  ok: boolean;
  mysql: "ok" | "error";
  redis: "ok" | "error";
  database: string;
  phase: string;
};

export async function checkDbHealth(): Promise<DbHealthStatus> {
  const env = loadEnv();
  let mysqlOk = false;
  let redisOk = false;

  try {
    mysqlOk = await pingMysql();
  } catch {
    mysqlOk = false;
  }

  try {
    redisOk = await pingRedis();
  } catch {
    redisOk = false;
  }

  return {
    ok: mysqlOk && redisOk,
    mysql: mysqlOk ? "ok" : "error",
    redis: redisOk ? "ok" : "error",
    database: env.mysqlDatabase,
    phase: "2",
  };
}
