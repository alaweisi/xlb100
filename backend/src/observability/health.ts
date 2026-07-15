import { loadEnv } from "@xlb/config";
import { pingMysql } from "../dal/db.js";
import { pingRedis } from "../dal/redisClient.js";
import { XLB_RUNTIME_STATUS } from "../projectStatus.js";
import {
  assessDataReliability,
  assessJobWorkerHeartbeat,
  getDataReliabilitySnapshot,
  readSharedDataReliabilitySnapshot,
  readSharedJobWorkerHeartbeat,
  type DataReliabilityAssessment,
} from "./dataReliability.js";

export type DbHealthStatus = {
  ok: boolean;
  mysql: "ok" | "error";
  redis: "ok" | "error";
  database: string;
  phase: string;
  dataReliability: DataReliabilityAssessment;
  jobWorker: ReturnType<typeof assessJobWorkerHeartbeat>;
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
  const [sharedSnapshot, sharedHeartbeat] = redisOk
    ? await Promise.all([
        readSharedDataReliabilitySnapshot(),
        readSharedJobWorkerHeartbeat(),
      ])
    : [null, null];

  return {
    ok: mysqlOk && redisOk,
    mysql: mysqlOk ? "ok" : "error",
    redis: redisOk ? "ok" : "error",
    database: env.mysqlDatabase,
    phase: XLB_RUNTIME_STATUS.phase,
    // These are cached, bounded signals. Connectivity stays authoritative for
    // the legacy `ok` field; stale/backlogged data is exposed separately so a
    // monitoring scrape cannot turn into an expensive database scan.
    dataReliability: assessDataReliability(sharedSnapshot ?? getDataReliabilitySnapshot()),
    jobWorker: assessJobWorkerHeartbeat(sharedHeartbeat),
  };
}
