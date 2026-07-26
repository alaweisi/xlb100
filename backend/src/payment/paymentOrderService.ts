import type { CreatePaymentOrderInput, MockPaymentWebhookInput } from "@xlb/validators";
import type { PaymentOrder } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import {
  createPaymentOrderSchema,
  mockPaymentWebhookSchema,
} from "@xlb/validators";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { eventOutboxRepository, EventOutboxRepository } from "../events/eventOutbox.js";
import {
  buildPaymentPaidPayload,
} from "../events/orderPaidEvent.js";
import { generateEventId, generatePaymentOrderId } from "../events/eventIds.js";
import { orderRepository, OrderRepository } from "../order/orderRepository.js";
import { assertOrderTransition } from "../order/orderStateMachine.js";
import {
  OrderNotFoundError,
  OrderOwnershipError,
} from "../order/orderService.js";
import {
  paymentGatewayProvider,
  type PaymentGatewayProvider,
} from "../providers/payment/mockPaymentProvider.js";
import { buildPaymentMetadata } from "./paymentMetadataBuilder.js";
import { isPaymentAlreadyPaid } from "./paymentIdempotency.js";
import { paymentOrderRepository, PaymentOrderRepository } from "./paymentOrderRepository.js";

export class PaymentValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

export class PaymentNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(paymentOrderId: string) {
    super(`Payment order not found: ${paymentOrderId}`);
    this.name = "PaymentNotFoundError";
  }
}

export class PaymentAuthorizationError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "PaymentAuthorizationError";
  }
}

export class PaymentConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "PaymentConflictError";
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ER_DUP_ENTRY";
}

export class PaymentOrderService {
  constructor(
    private readonly paymentRepo: PaymentOrderRepository = paymentOrderRepository,
    private readonly orderRepo: OrderRepository = orderRepository,
    private readonly outboxRepo: EventOutboxRepository = eventOutboxRepository,
    private readonly provider: PaymentGatewayProvider = paymentGatewayProvider,
  ) {}

  async createPaymentOrder(
    context: RequestContext,
    input: CreatePaymentOrderInput,
  ): Promise<PaymentOrder> {
    const parsed = createPaymentOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new PaymentValidationError(parsed.error.message);
    }
    if (
      context.appType !== "customer"
      || context.role !== "customer"
      || !context.userId
    ) {
      throw new PaymentAuthorizationError(
        "Payment order creation requires an authenticated customer",
      );
    }

    return executeCityScoped(context, async (cityCode) => {
      const order = await this.orderRepo.findById(context, cityCode, parsed.data.orderId);
      if (!order) {
        throw new OrderNotFoundError(parsed.data.orderId);
      }
      if (order.customerId !== context.userId) {
        throw new OrderOwnershipError(order.orderId);
      }

      if (order.status !== "service_completed") {
        throw new PaymentValidationError(
          `Order must be service_completed, current status=${order.status}`,
        );
      }

      const paymentOrderId = generatePaymentOrderId();
      const providerEnvelope = await this.provider.prepare({
        paymentOrderId,
        orderId: order.orderId,
        amount: order.totalAmount,
        currency: "CNY",
      });

      await withTransaction(async (connection) => {
        const lockedOrder = await this.orderRepo.findByIdForUpdate(
          connection,
          cityCode,
          order.orderId,
        );
        if (!lockedOrder) {
          throw new OrderNotFoundError(order.orderId);
        }
        if (lockedOrder.customerId !== context.userId) {
          throw new OrderOwnershipError(lockedOrder.orderId);
        }
        if (lockedOrder.status !== "service_completed") {
          throw new PaymentConflictError(
            `Order is no longer payable, current status=${lockedOrder.status}`,
          );
        }
        if (
          lockedOrder.totalAmount !== order.totalAmount
          || lockedOrder.currency !== order.currency
        ) {
          throw new PaymentConflictError("Order amount changed while preparing payment");
        }
        await this.paymentRepo.insertPaymentOrder(connection, {
          paymentOrderId,
          orderId: lockedOrder.orderId,
          cityCode,
          amount: lockedOrder.totalAmount,
          currency: lockedOrder.currency,
          provider: providerEnvelope.provider,
          metadata: buildPaymentMetadata(lockedOrder),
        });
      });

      const paymentOrder = await this.paymentRepo.findById(context, cityCode, paymentOrderId);
      if (!paymentOrder) {
        throw new Error("Failed to load created payment order");
      }
      return paymentOrder;
    });
  }

  async processMockWebhook(
    context: RequestContext,
    input: MockPaymentWebhookInput,
  ): Promise<{ paymentOrder: PaymentOrder; orderId: string; idempotent: boolean }> {
    const parsed = mockPaymentWebhookSchema.safeParse(input);
    if (!parsed.success) {
      throw new PaymentValidationError(parsed.error.message);
    }

    await this.provider.verifyCallback({
      paymentOrderId: parsed.data.paymentOrderId,
      providerTradeNo: parsed.data.providerTradeNo,
    });

    return executeCityScoped(context, async (cityCode) => {
      return withTransaction(async (connection) => {
        const paymentOrder = await this.paymentRepo.findByIdForUpdate(
          connection,
          cityCode,
          parsed.data.paymentOrderId,
        );
        if (!paymentOrder) {
          throw new PaymentNotFoundError(parsed.data.paymentOrderId);
        }

        if (isPaymentAlreadyPaid(paymentOrder.status)) {
          if (paymentOrder.providerTradeNo !== parsed.data.providerTradeNo) {
            throw new PaymentConflictError(
              "Payment order is already paid with a different provider trade number",
            );
          }
          return { paymentOrder, orderId: paymentOrder.orderId, idempotent: true };
        }

        if (paymentOrder.status !== "pending") {
          throw new PaymentValidationError(
            `Payment order cannot be paid from status=${paymentOrder.status}`,
          );
        }

        const order = await this.orderRepo.findByIdForUpdate(
          connection,
          cityCode,
          paymentOrder.orderId,
        );
        if (!order) {
          throw new OrderNotFoundError(paymentOrder.orderId);
        }

        assertOrderTransition(order.status, "paid");
        const paidAt = new Date().toISOString();
        try {
          await this.paymentRepo.insertProviderReceipt(connection, {
            provider: paymentOrder.provider,
            providerTradeNo: parsed.data.providerTradeNo,
            paymentOrderId: paymentOrder.paymentOrderId,
            cityCode,
          });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new PaymentConflictError(
              "Provider trade number is already bound to another payment order",
            );
          }
          throw error;
        }
        const markedPaid = await this.paymentRepo.markPaid(
          connection,
          cityCode,
          paymentOrder.paymentOrderId,
          parsed.data.providerTradeNo,
        );
        if (!markedPaid) {
          throw new PaymentConflictError("Payment status changed during callback processing");
        }

        const orderTransitioned = await this.orderRepo.transitionStatus(
          connection,
          cityCode,
          order.orderId,
          "service_completed",
          "paid",
        );
        if (!orderTransitioned) {
          throw new PaymentConflictError("Order status changed during callback processing");
        }

        await this.outboxRepo.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "payment.paid",
          aggregateType: "payment_order",
          aggregateId: paymentOrder.paymentOrderId,
          cityCode,
          payload: buildPaymentPaidPayload({
            paymentOrderId: paymentOrder.paymentOrderId,
            orderId: order.orderId,
            cityCode,
            amount: paymentOrder.amount,
            providerTradeNo: parsed.data.providerTradeNo,
            paidAt,
          }) as unknown as Record<string, unknown>,
        });

        const updated = await this.paymentRepo.findByIdForUpdate(
          connection,
          cityCode,
          paymentOrder.paymentOrderId,
        );
        if (!updated) {
          throw new Error("Failed to load updated payment order");
        }
        return { paymentOrder: updated, orderId: order.orderId, idempotent: false };
      });
    });
  }
}

export const paymentOrderService = new PaymentOrderService();
