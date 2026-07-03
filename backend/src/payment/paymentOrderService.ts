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
  buildOrderPaidPayload,
  buildPaymentPaidPayload,
} from "../events/orderPaidEvent.js";
import { generateEventId, generatePaymentOrderId } from "../events/eventIds.js";
import { orderRepository, OrderRepository } from "../order/orderRepository.js";
import { assertOrderTransition } from "../order/orderStateMachine.js";
import { OrderNotFoundError } from "../order/orderService.js";
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

export class PaymentOrderService {
  constructor(
    private readonly paymentRepo: PaymentOrderRepository = paymentOrderRepository,
    private readonly orderRepo: OrderRepository = orderRepository,
    private readonly outboxRepo: EventOutboxRepository = eventOutboxRepository,
  ) {}

  async createPaymentOrder(
    context: RequestContext,
    input: CreatePaymentOrderInput,
  ): Promise<PaymentOrder> {
    const parsed = createPaymentOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new PaymentValidationError(parsed.error.message);
    }

    return executeCityScoped(context, async (cityCode) => {
      const order = await this.orderRepo.findById(context, cityCode, parsed.data.orderId);
      if (!order) {
        throw new OrderNotFoundError(parsed.data.orderId);
      }

      if (order.status !== "pending_payment") {
        throw new PaymentValidationError(
          `Order must be pending_payment, current status=${order.status}`,
        );
      }

      const paymentOrderId = generatePaymentOrderId();
      const metadata = buildPaymentMetadata(order);

      await withTransaction(async (connection) => {
        await this.paymentRepo.insertPaymentOrder(connection, {
          paymentOrderId,
          orderId: order.orderId,
          cityCode,
          amount: order.totalAmount,
          currency: order.currency,
          provider: "mock",
          metadata,
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

    return executeCityScoped(context, async (cityCode) => {
      const paymentOrder = await this.paymentRepo.findById(
        context,
        cityCode,
        parsed.data.paymentOrderId,
      );
      if (!paymentOrder) {
        throw new PaymentNotFoundError(parsed.data.paymentOrderId);
      }

      if (isPaymentAlreadyPaid(paymentOrder.status)) {
        return { paymentOrder, orderId: paymentOrder.orderId, idempotent: true };
      }

      if (paymentOrder.status !== "pending") {
        throw new PaymentValidationError(
          `Payment order cannot be paid from status=${paymentOrder.status}`,
        );
      }

      const order = await this.orderRepo.findById(context, cityCode, paymentOrder.orderId);
      if (!order) {
        throw new OrderNotFoundError(paymentOrder.orderId);
      }

      assertOrderTransition(order.status, "paid");
      const paidAt = new Date().toISOString();

      await withTransaction(async (connection) => {
        await this.paymentRepo.markPaid(
          connection,
          cityCode,
          paymentOrder.paymentOrderId,
          parsed.data.providerTradeNo,
        );
        await this.orderRepo.updateStatus(connection, cityCode, order.orderId, "paid");

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

        await this.outboxRepo.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "order.paid",
          aggregateType: "order",
          aggregateId: order.orderId,
          cityCode,
          payload: buildOrderPaidPayload({
            orderId: order.orderId,
            cityCode,
            customerId: order.customerId,
            skuId: order.skuId,
            amount: order.totalAmount,
            paidAt,
          }) as unknown as Record<string, unknown>,
        });
      });

      const updated = await this.paymentRepo.findById(
        context,
        cityCode,
        paymentOrder.paymentOrderId,
      );
      if (!updated) {
        throw new Error("Failed to load updated payment order");
      }

      return { paymentOrder: updated, orderId: order.orderId, idempotent: false };
    });
  }
}

export const paymentOrderService = new PaymentOrderService();
