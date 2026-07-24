import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

describe("GAP-01 Customer order list authorization", { timeout: 30_000 }, () => {
  it("rejects non-Customer actors and missing city before repository access without leaking orders", async () => {
    const app = await buildApp();
    try {
      const worker = await app.inject({
        method: "GET",
        url: "/api/customer/orders",
        headers: bearerHeaders({
          appType: "worker",
          role: "worker",
          userId: "worker-demo-hangzhou",
          cityCode: "hangzhou",
        }),
      });
      const admin = await app.inject({
        method: "GET",
        url: "/api/customer/orders",
        headers: bearerHeaders({
          appType: "admin",
          role: "operator",
          userId: "operator-hangzhou",
          cityCode: "hangzhou",
        }),
      });
      const missingCity = await app.inject({
        method: "GET",
        url: "/api/customer/orders",
        headers: bearerHeaders({
          appType: "customer",
          role: "customer",
          userId: "customer-demo-001",
        }),
      });
      expect(worker.statusCode).toBe(403);
      expect(admin.statusCode).toBe(403);
      expect(missingCity.statusCode).toBe(400);
      expect(worker.body).not.toContain("order_");
      expect(admin.body).not.toContain("order_");
    } finally {
      await app.close();
    }
  });
});
