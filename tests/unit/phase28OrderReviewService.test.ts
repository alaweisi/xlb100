import { describe, expect, it, vi } from "vitest";
import type { OrderReview, RequestContext } from "@xlb/types";
import {
  OrderReviewNotFoundError,
  OrderReviewService,
} from "../../backend/src/review/orderReviewService.js";

const context: RequestContext = {
  traceId: "trace-review",
  requestStartedAt: "2026-07-13T00:00:00.000Z",
  appType: "customer",
  role: "customer",
  cityCode: "hangzhou",
  userId: "customer-1",
};

const existingReview: OrderReview = {
  reviewId: "review-1", cityCode: "hangzhou", orderId: "order-1",
  customerId: "customer-1", workerId: "worker-1", fulfillmentId: "fulfillment-1",
  rating: 5, comment: "great", status: "created",
  createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
};

function harness(overrides: Record<string, unknown> = {}) {
  const connection = { query: vi.fn() };
  const repository = {
    lockOwnedOrder: vi.fn().mockResolvedValue({ orderId: "order-1", customerId: "customer-1" }),
    findByOrderForUpdate: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(existingReview),
    loadReviewableOrderSnapshot: vi.fn().mockResolvedValue({
      orderId: "order-1", cityCode: "hangzhou", customerId: "customer-1",
      workerId: "worker-1", fulfillmentId: "fulfillment-1",
    }),
    insertReview: vi.fn(),
    ...overrides,
  };
  const moderation = { ensurePendingVisibility: vi.fn() };
  const outbox = { insertEvent: vi.fn() };
  const transaction = async <T>(callback: (c: typeof connection) => Promise<T>) => callback(connection);
  const service = new OrderReviewService(
    repository as never, transaction as never, moderation as never, outbox as never,
  );
  return { service, repository, moderation, outbox, connection };
}

describe("Phase28 Order Review transaction", () => {
  it("checks order ownership before looking up and returning an existing review", async () => {
    const { service, repository } = harness({ lockOwnedOrder: vi.fn().mockResolvedValue(null) });
    await expect(service.createReview(context, "order-1", { rating: 5, comment: "great" }))
      .rejects.toBeInstanceOf(OrderReviewNotFoundError);
    expect(repository.findByOrderForUpdate).not.toHaveBeenCalled();
  });

  it("serializes on the owned order before the idempotent existing-review lookup", async () => {
    const order: string[] = [];
    const { service, repository, outbox } = harness({
      lockOwnedOrder: vi.fn(async () => { order.push("owner-lock"); return { orderId: "order-1", customerId: "customer-1" }; }),
      findByOrderForUpdate: vi.fn(async () => { order.push("existing-lock"); return existingReview; }),
    });
    const result = await service.createReview(context, "order-1", { rating: 5, comment: "great" });
    expect(result).toEqual({ review: existingReview, idempotent: true });
    expect(order).toEqual(["owner-lock", "existing-lock"]);
    expect(repository.insertReview).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("atomically creates pending visibility and the minimal explicit review.created v1 event", async () => {
    const { service, repository, moderation, outbox, connection } = harness();
    const result = await service.createReview(context, "order-1", { rating: 4, comment: "real comment" });
    expect(result.idempotent).toBe(false);
    expect(repository.insertReview).toHaveBeenCalledWith(connection, expect.objectContaining({
      orderId: "order-1", customerId: "customer-1", workerId: "worker-1",
      rating: 4, comment: "real comment",
    }));
    expect(moderation.ensurePendingVisibility).toHaveBeenCalledWith(connection, expect.objectContaining({
      cityCode: "hangzhou", reviewId: expect.stringMatching(/^rev_/),
    }));
    expect(outbox.insertEvent).toHaveBeenCalledWith(connection, expect.objectContaining({
      eventType: "review.created", eventMajorVersion: 1,
      aggregateType: "order_review", cityCode: "hangzhou",
    }));
    const event = outbox.insertEvent.mock.calls[0][1];
    expect(Object.keys(event.payload).sort()).toEqual(
      ["occurredAt", "orderId", "rating", "reviewId", "visibility", "workerId"].sort(),
    );
    expect(JSON.stringify(event.payload)).not.toContain("real comment");
    expect(JSON.stringify(event.payload)).not.toContain("customer-1");
  });
});
