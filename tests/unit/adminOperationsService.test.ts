import type { RequestContext } from "@xlb/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdminCanAccessCity: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../../backend/src/dal/adminQueryGuard.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../backend/src/dal/adminQueryGuard.js")>();
  return { ...actual, assertAdminCanAccessCity: mocks.assertAdminCanAccessCity };
});
vi.mock("../../backend/src/dal/mysqlPool.js", () => ({
  getMysqlPool: () => ({ query: mocks.query }),
}));

import {
  AdminOperationsError,
  AdminOperationsService,
} from "../../backend/src/adminOperations/adminOperationsService.js";

const adminContext: RequestContext = {
  traceId: "admin-orders-null-schedule",
  appType: "admin",
  role: "operator",
  cityCode: "hangzhou",
  userId: "admin-1",
  requestStartedAt: "2026-08-04T00:00:00.000Z",
};

describe("AdminOperationsService.listOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertAdminCanAccessCity.mockResolvedValue(undefined);
  });

  it("serializes nullable schedules without changing city scope or order fields", async () => {
    mocks.query.mockResolvedValue([[
      {
        order_id: "order-null-schedule",
        city_code: "hangzhou",
        customer_id: "customer-1",
        sku_id: "sku-1",
        sku_name: "Home cleaning",
        status: "pending_dispatch",
        total_amount: "89.00",
        scheduled_at: null,
        created_at: new Date("2026-08-04T01:00:00.000Z"),
      },
      {
        order_id: "order-with-schedule",
        city_code: "hangzhou",
        customer_id: "customer-2",
        sku_id: "sku-2",
        sku_name: "Deep cleaning",
        status: "service_completed",
        total_amount: "168.50",
        scheduled_at: new Date("2026-08-05T02:00:00.000Z"),
        created_at: new Date("2026-08-04T02:00:00.000Z"),
      },
    ]]);

    const orders = await new AdminOperationsService().listOrders(adminContext);

    expect(mocks.assertAdminCanAccessCity).toHaveBeenCalledWith(adminContext, "hangzhou");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM orders WHERE city_code=\?/u),
      ["hangzhou"],
    );
    expect(orders).toEqual([
      {
        orderId: "order-null-schedule",
        cityCode: "hangzhou",
        customerId: "customer-1",
        skuId: "sku-1",
        skuName: "Home cleaning",
        status: "pending_dispatch",
        totalAmount: 89,
        scheduledAt: "",
        createdAt: "2026-08-04T01:00:00.000Z",
      },
      {
        orderId: "order-with-schedule",
        cityCode: "hangzhou",
        customerId: "customer-2",
        skuId: "sku-2",
        skuName: "Deep cleaning",
        status: "service_completed",
        totalAmount: 168.5,
        scheduledAt: "2026-08-05T02:00:00.000Z",
        createdAt: "2026-08-04T02:00:00.000Z",
      },
    ]);
  });

  it("rejects a non-admin before any database query", async () => {
    const customerContext: RequestContext = {
      ...adminContext,
      appType: "customer",
      role: "customer",
      userId: "customer-1",
    };

    await expect(new AdminOperationsService().listOrders(customerContext))
      .rejects.toBeInstanceOf(AdminOperationsError);
    expect(mocks.assertAdminCanAccessCity).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
