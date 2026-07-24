import { describe, expect, it, vi } from "vitest";
import { OrderRepository } from "../../backend/src/order/orderRepository.js";

const context = {
  traceId: "trace-gap01",
  appType: "customer" as const,
  role: "customer" as const,
  cityCode: "hangzhou" as const,
  userId: "customer-gap01-a",
  requestStartedAt: "2026-07-24T10:00:00.000Z",
};

describe("GAP-01 Customer order repository", () => {
  it("applies city and owner scope before stable keyset pagination", async () => {
    const query = vi.fn(async () => [[]]);
    const repository = new OrderRepository({ query } as never);
    await repository.listCustomerOrders(
      context,
      "hangzhou",
      "customer-gap01-a",
      "active",
      21,
      { createdAt: "2026-07-24T10:00:00.000Z", orderId: "order-gap01-1" },
    );

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("orders.city_code = ? AND orders.customer_id = ?");
    expect(sql).toContain("orders.status IN ('draft','pending_dispatch','service_completed','pending_payment')");
    expect(sql).toContain("orders.created_at < ?");
    expect(sql).toContain("ORDER BY orders.created_at DESC,orders.order_id DESC");
    expect(params[0]).toBe("hangzhou");
    expect(params[1]).toBe("customer-gap01-a");
    expect(params.at(-1)).toBe(21);
  });

  it("fails closed when repository scope does not match authenticated context", async () => {
    const query = vi.fn();
    const repository = new OrderRepository({ query } as never);
    await expect(repository.listCustomerOrders(
      context,
      "hangzhou",
      "customer-gap01-b",
      "all",
      20,
    )).rejects.toThrow("customer order list scope mismatch");
    expect(query).not.toHaveBeenCalled();
  });
});
