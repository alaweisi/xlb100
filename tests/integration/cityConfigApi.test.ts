import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { adminAuthHeaders, bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const headers = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" });
const adminHeaders = adminAuthHeaders("admin-hangzhou", "hangzhou", "admin");

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

  it("requires expectedVersion on admin updates", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/city-config/update",
      headers: adminHeaders,
      payload: { cityCode: "hangzhou", isOpen: true },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("allows exactly one of two concurrent updates at the same version", async () => {
    const app = await buildApp();
    let originalVersion: number | undefined;
    try {
      const currentResponse = await app.inject({
        method: "GET",
        url: "/api/city-config/current",
        headers,
      });
      const current = currentResponse.json().config as {
        version: number;
        serviceEnabled: boolean;
        pricingEnabled: boolean;
      };
      originalVersion = current.version;

      const request = (payload: Record<string, unknown>) => app.inject({
        method: "POST",
        url: "/api/admin/city-config/update",
        headers: adminHeaders,
        payload: {
          cityCode: "hangzhou",
          expectedVersion: current.version,
          ...payload,
        },
      });

      const responses = await Promise.all([
        request({ serviceEnabled: current.serviceEnabled }),
        request({ pricingEnabled: current.pricingEnabled }),
      ]);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);

      const conflict = responses.find((response) => response.statusCode === 409);
      expect(conflict?.json()).toMatchObject({
        ok: false,
        code: "CITY_CONFIG_VERSION_CONFLICT",
        expectedVersion: current.version,
        currentVersion: current.version + 1,
      });

      const latestResponse = await app.inject({
        method: "GET",
        url: "/api/city-config/current",
        headers,
      });
      expect(latestResponse.json().config.version).toBe(current.version + 1);
    } finally {
      if (originalVersion !== undefined) {
        await getMysqlPool().query(
          "UPDATE city_configs SET version = ? WHERE city_code = 'hangzhou'",
          [originalVersion],
        );
      }
      await app.close();
    }
  });
});
