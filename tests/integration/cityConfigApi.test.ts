import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const headers = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" });

describe.skipIf(!runDb)("cityConfigApi integration", () => {
  it("GET /api/city-config/current returns hangzhou config", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/city-config/current",
      headers,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.config.cityCode).toBe("hangzhou");
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/city-config/current",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
