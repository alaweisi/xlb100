import fs from "node:fs";
import mysql from "mysql2/promise";
import { getDbPath } from "./paths.js";

export type SeedResult = {
  executed: string[];
};

async function executeSeedFile(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, "utf8");
  const env = await import("@xlb/config").then((m) => m.loadEnv());
  const connection = await mysql.createConnection({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    multipleStatements: true,
  });
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

export async function runSeeds(): Promise<SeedResult> {
  const dir = getDbPath("seed");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const executed: string[] = [];

  for (const file of files) {
    await executeSeedFile(getDbPath("seed", file));
    executed.push(file);
  }

  return { executed };
}
