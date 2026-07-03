import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

describe("requestContext contract", () => {
  it("GET /api/debug/context returns context when headers valid", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/debug/context",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
        [XLB_HEADERS.cityCode]: "hangzhou",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.traceId).toBeTruthy();
    expect(body.appType).toBe("customer");
    expect(body.role).toBe("customer");
    expect(body.cityCode).toBe("hangzhou");
    expect(response.headers[XLB_HEADERS.traceId]).toBeTruthy();
    await app.close();
  });

  it("GET /api/debug/context returns 400 without required headers", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/debug/context",
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.ok).toBe(false);
    await app.close();
  });

  it("GET /health remains anonymous", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
