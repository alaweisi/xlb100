import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { loadEnv } from "@xlb/config";

let pool: Pool | null = null;

export function createMysqlPool(): Pool {
  const env = loadEnv();
  return mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    waitForConnections: true,
    connectionLimit: 10,
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
