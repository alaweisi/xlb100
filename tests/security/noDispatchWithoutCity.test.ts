import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

describe("noDispatchWithoutCity", () => {
  it("rejects dispatch run-once without cityCode header", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: bearerHeaders({ appType: "admin", role: "operator", userId: "operator-hangzhou" }),
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
      headers: bearerHeaders({ appType: "admin", role: "operator", userId: "operator-hangzhou" }),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
