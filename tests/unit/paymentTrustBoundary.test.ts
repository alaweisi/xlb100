import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

const customerHeaders = bearerHeaders({
  appType: "customer",
  role: "customer",
  userId: "customer-payment-boundary",
  cityCode: "hangzhou",
});

describe("payment trust boundary", () => {
  it("keeps the mock callback out of the Customer API client and UI", async () => {
    const [apiClient, customerPage, customerApp] = await Promise.all([
      readFile(new URL("../../packages/api-client/src/customer.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../apps/customer/src/pages/CustomerOrdersPage.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../apps/customer/src/app/App.tsx", import.meta.url), "utf8"),
    ]);
    for (const source of [apiClient, customerPage, customerApp]) {
      expect(source).not.toContain("mockPaySuccess");
      expect(source).not.toContain("/api/payments/mock-webhook");
    }
  });

  it("does not register the mock callback route in development by default", async () => {
    process.env.NODE_ENV = "development";
    process.env.PAYMENT_MOCK_WEBHOOK_ENABLED = "false";
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/payments/mock-webhook",
        headers: customerHeaders,
        payload: {
          paymentOrderId: "pay-not-used",
          providerTradeNo: "trade-not-used",
          status: "paid",
        },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("rejects an ordinary logged-in caller without the test-only ingress secret", async () => {
    process.env.NODE_ENV = "test";
    process.env.PAYMENT_MOCK_WEBHOOK_ENABLED = "true";
    process.env.PAYMENT_MOCK_WEBHOOK_SECRET =
      "payment-trust-boundary-test-secret";
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/payments/mock-webhook",
        headers: customerHeaders,
        payload: {
          paymentOrderId: "pay-not-used",
          providerTradeNo: "trade-not-used",
          status: "paid",
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        ok: false,
        error: "Mock payment webhook secret is invalid",
      });
    } finally {
      await app.close();
    }
  });
});
