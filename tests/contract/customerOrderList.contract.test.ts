import { describe, expect, it, vi } from "vitest";
import {
  customerOrderListQuerySchema,
  customerOrderListResponseSchema,
} from "@xlb/validators";
import {
  createCustomerOrderApi,
  validateCustomerOrderListResponse,
  type ApiClient,
} from "@xlb/api-client";

const timestamp = "2026-07-24T10:00:00.000Z";
const summary = {
  orderId: "order-gap01-1",
  cityCode: "hangzhou",
  skuId: "sku_home_daily_2h",
  skuName: "日常保洁2小时",
  quantity: 1,
  unit: "次",
  scheduledAt: timestamp,
  scheduledTimeSlot: "morning",
  priceText: "¥89/2小时",
  totalAmount: 89,
  currency: "CNY",
  status: "pending_dispatch",
  createdAt: timestamp,
  updatedAt: timestamp,
} as const;

describe("GAP-01 Customer order list contract", () => {
  it("accepts only bounded cursor pagination and controlled read groups", () => {
    expect(customerOrderListQuerySchema.parse({
      cursor: "eyJ2IjoxfQ",
      limit: 50,
      filter: "active",
    })).toEqual({ cursor: "eyJ2IjoxfQ", limit: 50, filter: "active" });
    expect(customerOrderListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(customerOrderListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(customerOrderListQuerySchema.safeParse({ filter: "pending_payment" }).success).toBe(false);
    expect(customerOrderListQuerySchema.safeParse({ customerId: "other-customer" }).success).toBe(false);
    expect(customerOrderListQuerySchema.safeParse({ cityCode: "shanghai" }).success).toBe(false);
  });

  it("exposes only the Customer order-center summary projection", () => {
    const response = { ok: true, items: [summary], nextCursor: null } as const;
    expect(customerOrderListResponseSchema.parse(response)).toEqual(response);
    expect(validateCustomerOrderListResponse(response)).toEqual(response);

    for (const forbidden of [
      { customerId: "customer-1" },
      { contactPhone: "13800000001" },
      { detailAddress: "private address" },
      { quoteSnapshot: {} },
      { priceRuleId: "internal-price-rule" },
    ]) {
      expect(() => validateCustomerOrderListResponse({
        ok: true,
        items: [{ ...summary, ...forbidden }],
        nextCursor: null,
      })).toThrow();
    }
  });

  it("wires the shared query to the formal Customer API and validates its response", async () => {
    const get = vi.fn(async () => ({ ok: true, items: [summary], nextCursor: null }));
    const api = createCustomerOrderApi({ get } as unknown as ApiClient);

    await api.listOrders({ cursor: "cursor_1", limit: 20, filter: "cancelled" });

    expect(get.mock.calls[0]?.[0]).toBe(
      "/api/customer/orders?cursor=cursor_1&limit=20&filter=cancelled",
    );
    const options = get.mock.calls[0]?.[1] as { validate?: (value: unknown) => unknown };
    expect(options.validate?.({ ok: true, items: [summary], nextCursor: null }))
      .toEqual({ ok: true, items: [summary], nextCursor: null });
  });
});
