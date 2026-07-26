import type { Order, RequestContext } from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import {
  OrderOwnershipError,
  OrderService,
} from "../../backend/src/order/orderService.js";
import {
  RefundOwnershipError,
  RefundService,
} from "../../backend/src/aftersale/refund/refundService.js";

function context(
  appType: RequestContext["appType"],
  role: RequestContext["role"],
  userId: string,
): RequestContext {
  return {
    traceId: `trace-${appType}-${userId}`,
    appType,
    role,
    cityCode: "hangzhou",
    userId,
    requestStartedAt: "2026-07-26T00:00:00.000Z",
  };
}

const order = {
  orderId: "order-1",
  cityCode: "hangzhou",
  customerId: "customer-owner",
} as Order;

function orderService(options: { assigned?: boolean } = {}) {
  const repository = {
    findById: vi.fn().mockResolvedValue(order),
    isWorkerAssignedToOrder: vi.fn().mockResolvedValue(options.assigned ?? false),
  };
  return {
    repository,
    service: new OrderService(repository as never, {} as never, {} as never, {} as never),
  };
}

describe("critical resource authorization", () => {
  it("allows only the owning customer to read an order", async () => {
    const { service } = orderService();

    await expect(
      service.getOrder(context("customer", "customer", "customer-owner"), order.orderId),
    ).resolves.toBe(order);
    await expect(
      service.getOrder(context("customer", "customer", "customer-other"), order.orderId),
    ).rejects.toBeInstanceOf(OrderOwnershipError);
  });

  it("allows only the worker assigned through fulfillment to read an order", async () => {
    const denied = orderService({ assigned: false });
    await expect(
      denied.service.getOrder(context("worker", "worker", "worker-other"), order.orderId),
    ).rejects.toBeInstanceOf(OrderOwnershipError);

    const allowed = orderService({ assigned: true });
    await expect(
      allowed.service.getOrder(context("worker", "worker", "worker-assigned"), order.orderId),
    ).resolves.toBe(order);
    expect(allowed.repository.isWorkerAssignedToOrder).toHaveBeenCalledWith(
      expect.anything(),
      "hangzhou",
      order.orderId,
      "worker-assigned",
    );
  });

  it("retains scoped backoffice order reads", async () => {
    const { service, repository } = orderService();
    await expect(
      service.getOrder(context("admin", "auditor", "auditor-hangzhou"), order.orderId),
    ).resolves.toBe(order);
    expect(repository.isWorkerAssignedToOrder).not.toHaveBeenCalled();
  });

  it("rejects refund creation when the order snapshot belongs to another customer", async () => {
    const repository = {
      findByOrderForUpdate: vi.fn().mockResolvedValue(null),
      loadRefundableOrderSnapshot: vi.fn().mockResolvedValue({
        orderId: order.orderId,
        customerId: "customer-owner",
        fulfillmentId: "fulfillment-1",
        paymentOrderId: "payment-1",
        amount: 89,
        currency: "CNY",
      }),
    };
    const transaction = async <T>(callback: (connection: never) => Promise<T>) =>
      callback({} as never);
    const service = new RefundService(
      repository as never,
      {} as never,
      transaction,
    );

    await expect(
      service.createRefundRequest(
        context("customer", "customer", "customer-other"),
        { orderId: order.orderId, reason: "not mine" },
      ),
    ).rejects.toBeInstanceOf(RefundOwnershipError);
  });

  it("does not leak an existing refund to a non-owner replay", async () => {
    const repository = {
      findByOrderForUpdate: vi.fn().mockResolvedValue({
        orderId: order.orderId,
        customerId: "customer-owner",
      }),
    };
    const transaction = async <T>(callback: (connection: never) => Promise<T>) =>
      callback({} as never);
    const service = new RefundService(
      repository as never,
      {} as never,
      transaction,
    );

    await expect(
      service.createRefundRequest(
        context("customer", "customer", "customer-other"),
        { orderId: order.orderId },
      ),
    ).rejects.toBeInstanceOf(RefundOwnershipError);
  });
});
