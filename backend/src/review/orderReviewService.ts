import type { PoolConnection } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import type { OrderReview, RequestContext, ReviewCreatedV1EventPayload } from "@xlb/types";
import { createOrderReviewSchema } from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { generateEventId, generateOrderReviewId } from "../events/eventIds.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import {
  orderReviewRepository,
  OrderReviewRepository,
} from "./orderReviewRepository.js";
import {
  reviewModerationRepository,
  ReviewModerationRepository,
} from "./reviewModerationRepository.js";

export class OrderReviewValidationError extends Error {
  readonly statusCode = 400;
}

export class OrderReviewConflictError extends Error {
  readonly statusCode = 409;
}

export class OrderReviewNotFoundError extends Error {
  readonly statusCode = 404;
}

export type OrderReviewMutationResult = {
  review: OrderReview;
  idempotent: boolean;
};

type TransactionRunner = <T>(
  callback: (connection: PoolConnection) => Promise<T>,
) => Promise<T>;

export class OrderReviewService {
  constructor(
    private readonly repository: OrderReviewRepository = orderReviewRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
    private readonly moderationRepository: ReviewModerationRepository = reviewModerationRepository,
    private readonly outboxRepository: EventOutboxRepository = eventOutboxRepository,
  ) {}

  async createReview(
    context: RequestContext,
    orderId: string,
    body: unknown,
  ): Promise<OrderReviewMutationResult> {
    const parsed = createOrderReviewSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new OrderReviewValidationError(parsed.error.message);
    }
    const cityCode = assertCityScopedContext(context);
    if (context.appType !== "customer" || context.role !== "customer" || !context.userId) {
      throw new OrderReviewValidationError("review requires customer identity");
    }

    return this.transactionRunner(async (connection) => {
      const ownedOrder = await this.repository.lockOwnedOrder(
        connection,
        cityCode,
        orderId,
        context.userId!,
      );
      if (!ownedOrder) {
        throw new OrderReviewNotFoundError("reviewable order was not found");
      }
      const existing = await this.repository.findByOrderForUpdate(
        connection,
        cityCode,
        orderId,
      );
      if (existing) {
        return { review: existing, idempotent: true };
      }

      const snapshot = await this.repository.loadReviewableOrderSnapshot(
        connection,
        cityCode,
        orderId,
        context.userId!,
      );
      if (!snapshot) {
        throw new OrderReviewConflictError(
          "review requires paid order, matching customer, and completed fulfillment",
        );
      }

      const reviewId = generateOrderReviewId();
      await this.repository.insertReview(connection, {
        reviewId,
        cityCode,
        orderId: snapshot.orderId,
        customerId: snapshot.customerId,
        workerId: snapshot.workerId,
        fulfillmentId: snapshot.fulfillmentId,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
      });
      await this.moderationRepository.ensurePendingVisibility(connection, {
        visibilityStateId: `rvs_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`,
        cityCode,
        reviewId,
      });
      const occurredAt = new Date().toISOString();
      const payload: ReviewCreatedV1EventPayload = {
        reviewId,
        orderId: snapshot.orderId,
        workerId: snapshot.workerId,
        rating: parsed.data.rating,
        visibility: "pending_moderation",
        occurredAt,
      };
      await this.outboxRepository.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "review.created",
        eventMajorVersion: 1,
        aggregateType: "order_review",
        aggregateId: reviewId,
        cityCode,
        payload: { ...payload },
      });

      const review = await this.repository.findByOrderForUpdate(
        connection,
        cityCode,
        orderId,
      );
      if (!review) {
        throw new Error("failed to load created order review");
      }
      return { review, idempotent: false };
    });
  }
}

export const orderReviewService = new OrderReviewService();
