import { cleanup } from "@testing-library/react";
import { afterAll, afterEach } from "vitest";
import { closeMysqlPool } from "../backend/src/dal/mysqlPool.js";

afterEach(() => {
  cleanup();
});

afterAll(async () => {
  await closeMysqlPool();
});
