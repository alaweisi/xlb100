import { closeMysqlPool } from "./mysqlPool.js";
import { runMigrations } from "./migrationRunner.js";

try {
  const result = await runMigrations();
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeMysqlPool();
}
