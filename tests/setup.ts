import { afterAll } from "vitest";
import { closeMysqlPool } from "../backend/src/dal/mysqlPool.js";

afterAll(async () => {
  await closeMysqlPool();
});
