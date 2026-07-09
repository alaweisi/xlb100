import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { loadEnv } from "@xlb/config";

let pool: Pool | null = null;

export function createMysqlPool(): Pool {
  const env = loadEnv();
  const connectionLimit = Number.parseInt(process.env.MYSQL_CONNECTION_LIMIT ?? "10", 10);
  const normalizedConnectionLimit = Number.isNaN(connectionLimit) ? 10 : connectionLimit;
  const maxIdle = Number.parseInt(process.env.MYSQL_MAX_IDLE ?? String(normalizedConnectionLimit), 10);
  const idleTimeout = Number.parseInt(process.env.MYSQL_IDLE_TIMEOUT_MS ?? "60000", 10);
  return mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    waitForConnections: true,
    connectionLimit: normalizedConnectionLimit,
    maxIdle: Number.isNaN(maxIdle) ? normalizedConnectionLimit : maxIdle,
    idleTimeout: Number.isNaN(idleTimeout) ? 60000 : idleTimeout,
    namedPlaceholders: true,
  });
}

export function getMysqlPool(): Pool {
  if (!pool) {
    pool = createMysqlPool();
  }
  return pool;
}

export async function pingMysql(): Promise<boolean> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Test-only reset */
export function resetMysqlPoolForTests(): void {
  pool = null;
}
