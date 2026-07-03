import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

describe("noDispatchWithoutCity", () => {
  it("rejects dispatch run-once without cityCode header", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: {
        [XLB_HEADERS.appType]: "admin",
        [XLB_HEADERS.role]: "operator",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects dispatch tasks list without cityCode header", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/dispatch/tasks",
      headers: {
        [XLB_HEADERS.appType]: "admin",
        [XLB_HEADERS.role]: "operator",
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
