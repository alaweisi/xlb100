import type { PoolConnection } from "mysql2/promise";
import type { OrderReverseRequest, RequestContext } from "@xlb/types";
import { createOrderReverseRequestSchema, reviewOrderReverseRequestSchema } from "@xlb/validators";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { withTransaction } from "../../dal/transaction.js";
import { eventOutboxRepository, EventOutboxRepository } from "../../events/eventOutbox.js";
import {
  generateAftersaleTimelineEventId,
  generateEventId,
  generateOrderReverseRequestId,
} from "../../events/eventIds.js";
import { assertOrderTransition } from "../orderStateMachine.js";
import { assertOrderReverseTransition } from "./orderReverseStateMachine.js";
import { orderReverseRepository, OrderReverseRepository } from "./orderReverseRepository.js";

export class OrderReverseValidationError extends Error {
  readonly statusCode = 400;
}
export class OrderReverseNotFoundError extends Error {
  readonly statusCode = 404;
}
export class OrderReverseForbiddenError extends Error {
  readonly statusCode = 403;
}
export class OrderReverseConflictError extends Error {
  readonly statusCode = 409;
}

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class OrderReverseService {
  constructor(
    private readonly repository: OrderReverseRepository = orderReverseRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async create(
    context: RequestContext,
    orderId: string,
    body: unknown,
  ): Promise<{ reverseRequest: OrderReverseRequest; idempotent: boolean }> {
    const parsed = createOrderReverseRequestSchema.safeParse(body);
    if (!parsed.success) throw new OrderReverseValidationError(parsed.error.message);
    const cityCode = assertCityScopedContext(context);
    if (!context.userId) throw new OrderReverseValidationError("customer identity is required");
    const customerId = context.userId;

    return this.transactionRunner(async (connection) => {
      const existing = await this.repository.findByIdempotencyForUpdate(
        connection,
        cityCode,
        customerId,
        parsed.data.idempotencyKey,
      );
      if (existing) {
        if (existing.orderId !== orderId || existing.reverseType !== parsed.data.reverseType) {
          throw new OrderReverseConflictError("idempotency key was used for a different reverse request");
        }
        return { reverseRequest: existing, idempotent: true };
      }

      const order = await this.repository.loadOrderForUpdate(connection, cityCode, orderId);
      if (!order) throw new OrderReverseNotFoundError(`Order not found: ${orderId}`);
      if (order.customerId !== customerId) {
        throw new OrderReverseForbiddenError("order reverse request requires order ownership");
      }
      if (["draft", "paid", "cancelled"].includes(order.status)) {
        throw new OrderReverseConflictError(`order status ${order.status} does not allow reverse request`);
      }
      if (parsed.data.reverseType !== "cancel" && order.status !== "pending_dispatch") {
        throw new OrderReverseConflictError(`${parsed.data.reverseType} requires pending_dispatch order`);
      }
      if (parsed.data.reverseType !== "cancel" && order.hasStartedFulfillment) {
        throw new OrderReverseConflictError(`${parsed.data.reverseType} is unavailable after service starts`);
      }

      const reverseRequestId = generateOrderReverseRequestId();
      await this.repository.insert(connection, {
        reverseRequestId,
        cityCode,
        orderId,
        customerId,
        reverseType: parsed.data.reverseType,
        reason: parsed.data.reason,
        requestedScheduledAt: parsed.data.requestedScheduledAt
          ? new Date(parsed.data.requestedScheduledAt)
          : null,
        requestedTimeSlot: parsed.data.requestedTimeSlot ?? null,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      await this.repository.insertTimeline(connection, {
        timelineEventId: generateAftersaleTimelineEventId(),
        cityCode,
        orderId,
        reverseRequestId,
        eventType: "reverse.requested",
        actorType: "customer",
        actorId: customerId,
        content: parsed.data.reason,
        payload: { reverseType: parsed.data.reverseType },
      });
      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "order.reverse.requested",
        aggregateType: "order_reverse",
        aggregateId: reverseRequestId,
        cityCode,
        payload: { reverseRequestId, orderId, customerId, reverseType: parsed.data.reverseType },
      });
      const created = await this.repository.findByIdForUpdate(connection, cityCode, reverseRequestId);
      if (!created) throw new Error("failed to load created reverse request");
      return { reverseRequest: created, idempotent: false };
    });
  }

  async listForCustomer(context: RequestContext, orderId: string): Promise<OrderReverseRequest[]> {
    const cityCode = assertCityScopedContext(context);
    if (!context.userId) throw new OrderReverseValidationError("customer identity is required");
    return this.repository.listByOrder(context, cityCode, orderId, context.userId);
  }

  async listForAdmin(
    context: RequestContext,
    filters: { status?: string; reverseType?: string },
  ): Promise<OrderReverseRequest[]> {
    const cityCode = assertCityScopedContext(context);
    return this.repository.listForAdmin(context, cityCode, filters);
  }

  async review(
    context: RequestContext,
    id: string,
    body: unknown,
  ): Promise<{ reverseRequest: OrderReverseRequest; idempotent: boolean }> {
    const parsed = reviewOrderReverseRequestSchema.safeParse(body);
    if (!parsed.success) throw new OrderReverseValidationError(parsed.error.message);
    const cityCode = assertCityScopedContext(context);
    if (!context.userId) throw new OrderReverseValidationError("admin identity is required");
    const adminId = context.userId;

    return this.transactionRunner(async (connection) => {
      const request = await this.repository.findByIdForUpdate(connection, cityCode, id);
      if (!request) throw new OrderReverseNotFoundError(`Reverse request not found: ${id}`);
      if (request.status === parsed.data.decision) {
        return { reverseRequest: request, idempotent: true };
      }
      assertOrderReverseTransition(request.status, parsed.data.decision);
      await this.repository.markReviewed(
        connection,
        cityCode,
        id,
        parsed.data.decision,
        adminId,
        parsed.data.reviewNote ?? null,
      );
      await this.repository.insertTimeline(connection, {
        timelineEventId: generateAftersaleTimelineEventId(),
        cityCode,
        orderId: request.orderId,
        reverseRequestId: id,
        eventType: parsed.data.decision === "approved" ? "reverse.approved" : "reverse.rejected",
        actorType: "admin",
        actorId: adminId,
        content: parsed.data.reviewNote ?? parsed.data.decision,
        payload: { decision: parsed.data.decision },
      });
      if (parsed.data.decision === "approved") {
        await this.outbox.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "order.reverse.approved",
          aggregateType: "order_reverse",
          aggregateId: id,
          cityCode,
          payload: { reverseRequestId: id, orderId: request.orderId, reverseType: request.reverseType },
        });
      }
      const reviewed = await this.repository.findByIdForUpdate(connection, cityCode, id);
      if (!reviewed) throw new Error("failed to load reviewed reverse request");
      return { reverseRequest: reviewed, idempotent: false };
    });
  }

  async apply(
    context: RequestContext,
    id: string,
  ): Promise<{ reverseRequest: OrderReverseRequest; idempotent: boolean }> {
    const cityCode = assertCityScopedContext(context);
    return this.transactionRunner(async (connection) => {
      const request = await this.repository.findByIdForUpdate(connection, cityCode, id);
      if (!request) throw new OrderReverseNotFoundError(`Reverse request not found: ${id}`);
      if (request.status === "applied") return { reverseRequest: request, idempotent: true };
      assertOrderReverseTransition(request.status, "applied");

      const order = await this.repository.loadOrderForUpdate(connection, cityCode, request.orderId);
      if (!order) throw new OrderReverseNotFoundError(`Order not found: ${request.orderId}`);
      if (request.reverseType === "cancel") {
        assertOrderTransition(order.status, "cancelled");
      } else if (order.status !== "pending_dispatch" || order.hasStartedFulfillment) {
        throw new OrderReverseConflictError("order is no longer eligible for reschedule or reassign");
      }

      await this.repository.apply(connection, request);
      await this.repository.insertTimeline(connection, {
        timelineEventId: generateAftersaleTimelineEventId(),
        cityCode,
        orderId: request.orderId,
        reverseRequestId: id,
        eventType: "reverse.applied",
        actorType: "admin",
        actorId: context.userId ?? null,
        content:
          request.reverseType === "reassign"
            ? "reassignment intent recorded for dispatch phase"
            : `${request.reverseType} applied`,
        payload: { reverseType: request.reverseType, dispatchMutation: false },
      });
      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "order.reverse.applied",
        aggregateType: "order_reverse",
        aggregateId: id,
        cityCode,
        payload: {
          reverseRequestId: id,
          orderId: request.orderId,
          reverseType: request.reverseType,
          dispatchMutation: false,
        },
      });
      const applied = await this.repository.findByIdForUpdate(connection, cityCode, id);
      if (!applied) throw new Error("failed to load applied reverse request");
      return { reverseRequest: applied, idempotent: false };
    });
  }
}

export const orderReverseService = new OrderReverseService();
