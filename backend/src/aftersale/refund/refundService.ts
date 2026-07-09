import type { PoolConnection } from "mysql2/promise";
import type { RefundRequest, RequestContext } from "@xlb/types";
import {
  approveRefundRequestSchema,
  createRefundRequestSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { withTransaction } from "../../dal/transaction.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../../events/eventOutbox.js";
import { generateEventId, generateRefundId } from "../../events/eventIds.js";
import { buildRefundApprovedPayload } from "../../events/refundEvents.js";
import {
  refundRepository,
  RefundRepository,
} from "./refundRepository.js";

export class RefundValidationError extends Error {
  readonly statusCode = 400;
}

export class RefundNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(refundId: string) {
    super(`Refund request not found: ${refundId}`);
  }
}

export class RefundConflictError extends Error {
  readonly statusCode = 409;
}

export type RefundMutationResult = {
  refund: RefundRequest;
  idempotent: boolean;
};

type TransactionRunner = <T>(
  callback: (connection: PoolConnection) => Promise<T>,
) => Promise<T>;

export class RefundService {
  constructor(
    private readonly repository: RefundRepository = refundRepository,
    private readonly outboxRepository: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createRefundRequest(
    context: RequestContext,
    body: unknown,
  ): Promise<RefundMutationResult> {
    const parsed = createRefundRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new RefundValidationError(parsed.error.message);
    }
    const cityCode = assertCityScopedContext(context);

    return this.transactionRunner(async (connection) => {
      const existing = await this.repository.findByOrderForUpdate(
        connection,
        cityCode,
        parsed.data.orderId,
      );
      if (existing) {
        return { refund: existing, idempotent: true };
      }

      const snapshot = await this.repository.loadRefundableOrderSnapshot(
        connection,
        cityCode,
        parsed.data.orderId,
      );
      if (!snapshot) {
        throw new RefundConflictError(
          "refund requires paid order, completed fulfillment, and accrued ledger",
        );
      }
      if (snapshot.currency !== "CNY") {
        throw new RefundValidationError("refund currency must be CNY");
      }
      if (
        parsed.data.amount !== undefined &&
        Number(parsed.data.amount.toFixed(2)) !== Number(snapshot.amount.toFixed(2))
      ) {
        throw new RefundValidationError("Phase 14R refund MVP supports full refund only");
      }

      const refundId = generateRefundId();
      await this.repository.insertRefundRequest(connection, {
        refundId,
        cityCode,
        orderId: snapshot.orderId,
        customerId: snapshot.customerId,
        fulfillmentId: snapshot.fulfillmentId,
        paymentOrderId: snapshot.paymentOrderId,
        amount: snapshot.amount,
        currency: "CNY",
        reason: parsed.data.reason ?? null,
      });

      const refund = await this.repository.findByIdForUpdate(
        connection,
        cityCode,
        refundId,
      );
      if (!refund) {
        throw new Error("failed to load created refund request");
      }
      return { refund, idempotent: false };
    });
  }

  async approveRefund(
    context: RequestContext,
    refundId: string,
    body: unknown,
  ): Promise<RefundMutationResult> {
    const parsed = approveRefundRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new RefundValidationError(parsed.error.message);
    }
    const cityCode = assertCityScopedContext(context);
    const approvedByAdminId = context.userId;
    if (!approvedByAdminId) {
      throw new RefundValidationError("refund approval requires authenticated admin identity");
    }

    return this.transactionRunner(async (connection) => {
      const refund = await this.repository.findByIdForUpdate(
        connection,
        cityCode,
        refundId,
      );
      if (!refund) {
        throw new RefundNotFoundError(refundId);
      }
      if (refund.status === "approved") {
        return { refund, idempotent: true };
      }

      const approvedAtDate = this.now();
      const approvedAt = approvedAtDate.toISOString();
      const eventId = generateEventId();
      await this.repository.markApproved(
        connection,
        cityCode,
        refundId,
        approvedByAdminId,
        eventId,
        approvedAtDate,
      );
      await this.outboxRepository.insertEvent(connection, {
        eventId,
        eventType: "refund.approved",
        aggregateType: "refund",
        aggregateId: refundId,
        cityCode,
        payload: buildRefundApprovedPayload({
          refundId,
          orderId: refund.orderId,
          cityCode,
          customerId: refund.customerId,
          fulfillmentId: refund.fulfillmentId,
          paymentOrderId: refund.paymentOrderId,
          amount: refund.amount,
          currency: "CNY",
          approvedAt,
          approvedByAdminId,
        }) as unknown as Record<string, unknown>,
      });

      const approved = await this.repository.findByIdForUpdate(
        connection,
        cityCode,
        refundId,
      );
      if (!approved) {
        throw new Error("failed to load approved refund request");
      }
      return { refund: approved, idempotent: false };
    });
  }
}

export const refundService = new RefundService();
