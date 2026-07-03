import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createPaidOrderForDispatch, operatorHeaders } from "./helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("dispatchTaskApi integration", { timeout: 15000 }, () => {
  it("lists dispatch tasks for current city only", async () => {
    const app = await buildApp();
    await createPaidOrderForDispatch(app);

    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/dispatch/tasks",
      headers: operatorHeaders,
    });

    expect(listRes.statusCode).toBe(200);
    const tasks = listRes.json().tasks as { cityCode: string }[];
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.cityCode === "hangzhou")).toBe(true);

    await app.close();
  });
});
