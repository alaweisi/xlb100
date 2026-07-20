import { describe, expect, it, vi } from "vitest";
import { createCustomerOrderApi } from "../../packages/api-client/src/customer.js";
import type { ApiClient, ApiRequestOptions } from "../../packages/api-client/src/createApiClient.js";
import { validateCustomerOrderListResponse } from "../../packages/api-client/src/responseValidators.js";

describe("customer order list API client contract", () => {
  it("uses the customer self-scope route and encodes opaque pagination only", async () => {
    const get = vi.fn().mockResolvedValue(undefined);
    const client = { get, post: vi.fn() } as unknown as ApiClient;
    const api = createCustomerOrderApi(client);
    await api.listOrders({ cursor: "cursor_1", limit: 20 });

    expect(get.mock.calls[0]?.[0]).toBe("/api/customer/orders?cursor=cursor_1&limit=20");
    expect(get.mock.calls[0]?.[0]).not.toContain("customerId");
    expect((get.mock.calls[0]?.[1] as ApiRequestOptions<unknown>).validate)
      .toBe(validateCustomerOrderListResponse);
  });

  it("rejects malformed list envelopes before they reach the customer app", () => {
    expect(validateCustomerOrderListResponse({ ok: true, orders: [], nextCursor: null }))
      .toEqual({ ok: true, orders: [], nextCursor: null });
    expect(() => validateCustomerOrderListResponse({ ok: true, orders: {}, nextCursor: null }))
      .toThrow(/orders must be an array/i);
    expect(() => validateCustomerOrderListResponse({ ok: true, orders: [], nextCursor: 1 }))
      .toThrow(/nextCursor/i);
  });
});
