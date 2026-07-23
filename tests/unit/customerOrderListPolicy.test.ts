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
    traceId: "trace-gap01",
    appType: "customer",
    role: "customer",
    cityCode: "hangzhou",
    userId: "customer-gap01-a",
    requestStartedAt: "2026-07-24T10:00:00.000Z",
    ...overrides,
  };
}

describe("GAP-01 Customer order list policy", () => {
  it("requires an exact authenticated Customer actor and concrete city", () => {
    expect(requireCustomerOrderListScope(context())).toEqual({
      cityCode: "hangzhou",
      customerId: "customer-gap01-a",
    });
    for (const invalid of [
      context({ appType: "worker", role: "worker" }),
      context({ appType: "admin", role: "operator" }),
      context({ userId: undefined }),
      context({ cityCode: undefined }),
      context({ cityCode: "__global__" }),
    ]) {
      expect(() => requireCustomerOrderListScope(invalid))
        .toThrow(CustomerOrderListForbiddenError);
    }
  });

  it("normalizes defaults and rejects ungoverned query fields", () => {
    expect(parseCustomerOrderListQuery({})).toEqual({
      cursor: undefined,
      limit: 20,
      filter: "all",
    });
    expect(parseCustomerOrderListQuery({ limit: "5", filter: "completed" })).toEqual({
      cursor: undefined,
      limit: 5,
      filter: "completed",
    });
    expect(() => parseCustomerOrderListQuery({ status: "paid" }))
      .toThrow(CustomerOrderListValidationError);
  });

  it("binds signed cursors to Customer, city and controlled filter", () => {
    const scope = requireCustomerOrderListScope(context());
    const position = { createdAt: "2026-07-24T10:00:00.000Z", orderId: "order-gap01-1" };
    const cursor = encodeCustomerOrderListCursor(scope, "active", position);
    expect(decodeCustomerOrderListCursor(cursor, scope, "active")).toEqual(position);

    expect(() => decodeCustomerOrderListCursor(cursor, {
      ...scope,
      customerId: "customer-gap01-b",
    }, "active")).toThrow(CustomerOrderListValidationError);
    expect(() => decodeCustomerOrderListCursor(cursor, {
      ...scope,
      cityCode: "shanghai",
    }, "active")).toThrow(CustomerOrderListValidationError);
    expect(() => decodeCustomerOrderListCursor(cursor, scope, "completed"))
      .toThrow(CustomerOrderListValidationError);
    const tampered = `${cursor.slice(0, Math.floor(cursor.length / 2))}x${cursor.slice(Math.floor(cursor.length / 2) + 1)}`;
    expect(() => decodeCustomerOrderListCursor(tampered, scope, "active"))
      .toThrow(CustomerOrderListValidationError);
  });
});
