import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const headers = {
  [XLB_HEADERS.appType]: "customer",
  [XLB_HEADERS.role]: "customer",
  [XLB_HEADERS.cityCode]: "hangzhou",
};

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
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
