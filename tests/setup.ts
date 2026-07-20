import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach } from "vitest";
import { closeMysqlPool } from "../backend/src/dal/mysqlPool.js";
import { closeRedisClient } from "../backend/src/dal/redisClient.js";

// Full-gate runs load several large React surfaces sequentially. The DOM
// library's 1s default is too short for cold lazy imports on constrained CI
// runners and caused random, file-dependent failures despite a serial worker.
configure({ asyncUtilTimeout: 10_000 });

afterEach(() => {
  cleanup();
});

afterAll(async () => {
  await closeRedisClient();
  await closeMysqlPool();
});
