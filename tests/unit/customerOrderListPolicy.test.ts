import { describe, expect, it } from "vitest";
import type { RequestContext } from "@xlb/types";
import {
  CustomerOrderListForbiddenError,
  CustomerOrderListValidationError,
  decodeCustomerOrderListCursor,
  encodeCustomerOrderListCursor,
  parseCustomerOrderListQuery,
  requireCustomerOrderListScope,
} from "../../backend/src/order/customerOrderListPolicy.js";

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    traceId: "trace-order-list",
    appType: "customer",
    role: "customer",
    cityCode: "hangzhou",
    userId: "customer-a",
    requestStartedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("customer order list policy", () => {
  it("derives customer and city only from authenticated context", () => {
    expect(requireCustomerOrderListScope(context())).toEqual({
      cityCode: "hangzhou",
      customerId: "customer-a",
      traceId: "trace-order-list",
    });
    expect(() => requireCustomerOrderListScope(context({ appType: "worker", role: "worker" })))
      .toThrow(CustomerOrderListForbiddenError);
    expect(() => requireCustomerOrderListScope(context({ cityCode: "__global__" })))
      .toThrow(CustomerOrderListForbiddenError);
  });

  it("normalizes bounded pagination input and rejects unknown identity parameters", () => {
    expect(parseCustomerOrderListQuery({ limit: "25" })).toEqual({ limit: 25, cursor: undefined });
    expect(parseCustomerOrderListQuery({})).toEqual({ limit: 20, cursor: undefined });
    expect(() => parseCustomerOrderListQuery({ limit: 51 })).toThrow(CustomerOrderListValidationError);
    expect(() => parseCustomerOrderListQuery({ customerId: "customer-b" }))
      .toThrow(CustomerOrderListValidationError);
  });

  it("binds signed cursors to both customer and city and rejects tampering", () => {
    const scope = requireCustomerOrderListScope(context());
    const position = { createdAt: "2026-07-19T08:00:00.000Z", orderId: "order-2" };
    const cursor = encodeCustomerOrderListCursor(scope, position);
    expect(decodeCustomerOrderListCursor(cursor, scope)).toEqual(position);

    const otherCustomer = requireCustomerOrderListScope(context({ userId: "customer-b" }));
    const otherCity = requireCustomerOrderListScope(context({ cityCode: "shanghai" }));
    expect(() => decodeCustomerOrderListCursor(cursor, otherCustomer))
      .toThrow(CustomerOrderListValidationError);
    expect(() => decodeCustomerOrderListCursor(cursor, otherCity))
      .toThrow(CustomerOrderListValidationError);
    const tampered = Buffer.from(`${Buffer.from(cursor, "base64url").toString("utf8")}x`).toString("base64url");
    expect(() => decodeCustomerOrderListCursor(tampered, scope))
      .toThrow(CustomerOrderListValidationError);
  });
});
