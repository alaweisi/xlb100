import { describe, expect, it } from "vitest";
import { stagingDemoRequestPolicy } from "../../backend/src/auth/stagingDemoPolicy.js";

const demoAdmin = { demo: "investor" as const, appType: "admin" as const };

describe("staging demo administrator policy", () => {
  it.each([
    ["GET", "/api/internal/operations/orders"],
    ["GET", "/api/internal/dispatch/board"],
    ["GET", "/api/internal/admin/order-traces/investor-demo-order-active"],
    ["GET", "/api/admin/reviews/moderation"],
    ["GET", "/api/internal/support/tickets/investor-demo-support-ticket"],
    ["POST", "/api/internal/dispatch/run-once"],
    ["POST", "/api/internal/dispatch/match-once"],
  ])("allows the fixed view/dispatch surface: %s %s", (method, path) => {
    expect(stagingDemoRequestPolicy(demoAdmin, method, path)).toEqual({
      allowed: true,
    });
  });

  it.each([
    ["POST", "/api/internal/settlement/run-once"],
    ["POST", "/api/aftersale/refunds/investor-demo/approve"],
    ["POST", "/api/internal/worker-withdrawals/investor-demo/mark-paid"],
    ["POST", "/api/worker/bank-accounts"],
    ["POST", "/api/internal/operations/skus/sku_home_daily_2h/status"],
    ["POST", "/api/admin/marketing/campaigns"],
    ["GET", "/openapi/credentials"],
  ])("denies high-risk or unlisted access: %s %s", (method, path) => {
    expect(stagingDemoRequestPolicy(demoAdmin, method, path)).toMatchObject({
      allowed: false,
      statusCode: 403,
    });
  });

  it("does not alter ordinary or worker sessions", () => {
    expect(stagingDemoRequestPolicy(
      { demo: undefined, appType: "admin" },
      "POST",
      "/api/internal/settlement/run-once",
    )).toEqual({ allowed: true });
    expect(stagingDemoRequestPolicy(
      { demo: "investor", appType: "worker" },
      "POST",
      "/api/worker/tasks/task-1/accept",
    )).toEqual({ allowed: true });
  });
});
