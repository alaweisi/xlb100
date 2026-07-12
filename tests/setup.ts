import { cleanup } from "@testing-library/react";
import { afterAll, afterEach } from "vitest";
import { closeMysqlPool } from "../backend/src/dal/mysqlPool.js";
import { closeRedisClient } from "../backend/src/dal/redisClient.js";

afterEach(() => {
  cleanup();
});

afterAll(async () => {
  await closeRedisClient();
  await closeMysqlPool();
});
