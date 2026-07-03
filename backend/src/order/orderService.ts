import type { CreateOrderInput } from "@xlb/validators";
import type { Order } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { createOrderSchema } from "@xlb/validators";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { pricingRepository, PricingRepository } from "../pricing/pricingRepository.js";
import { eventOutboxRepository, EventOutboxRepository } from "../events/eventOutbox.js";
import { buildOrderCreatedPayload } from "../events/orderPaidEvent.js";
import { generateEventId, generateOrderId } from "../events/eventIds.js";
import { orderRepository, OrderRepository } from "./orderRepository.js";

export class OrderValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export class OrderNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = "OrderNotFoundError";
  }
}

export class OrderSkuNotAllowedError extends Error {
  readonly statusCode = 400;

  constructor(skuId: string) {
    super(`SKU not allowed for order: ${skuId}`);
    this.name = "OrderSkuNotAllowedError";
  }
}

function isDemoSku(skuId: string): boolean {
  return skuId.startsWith("demo_") || skuId.includes("demo_cleaning");
}

export class OrderService {
  constructor(
    private readonly repository: OrderRepository = orderRepository,
    private readonly pricingRepo: PricingRepository = pricingRepository,
    private readonly outboxRepo: EventOutboxRepository = eventOutboxRepository,
  ) {}

  async createOrder(context: RequestContext, input: CreateOrderInput): Promise<Order> {
    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrderValidationError(parsed.error.message);
    }

    if (isDemoSku(parsed.data.skuId)) {
      throw new OrderSkuNotAllowedError(parsed.data.skuId);
    }

    return executeCityScoped(context, async (cityCode) => {
      const sku = await this.repository.findEnabledSku(context, cityCode, parsed.data.skuId);
      if (!sku) {
        throw new OrderValidationError(
          `SKU not found or disabled for city_code=${cityCode}: ${parsed.data.skuId}`,
        );
      }

      const priceRule = await this.pricingRepo.findPriceRuleBySku(
        context,
        cityCode,
        parsed.data.skuId,
      );
      if (!priceRule) {
        throw new OrderValidationError(
          `Price rule not found for city_code=${cityCode} skuId=${parsed.data.skuId}`,
        );
      }

      const orderId = generateOrderId();
      const totalAmount = Number((priceRule.basePrice * parsed.data.quantity).toFixed(2));
      const now = new Date().toISOString();

      await withTransaction(async (connection) => {
        await this.repository.insertOrder(connection, {
          orderId,
          cityCode,
          customerId: parsed.data.customerId,
          skuId: sku.skuId,
          skuName: sku.name,
          quantity: parsed.data.quantity,
          unit: sku.unit,
          priceRuleId: priceRule.priceRuleId,
          priceText: priceRule.priceText,
          priceType: priceRule.priceType,
          basePrice: priceRule.basePrice,
          currency: priceRule.currency,
          totalAmount,
          status: "pending_payment",
        });

        await this.outboxRepo.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "order.created",
          aggregateType: "order",
          aggregateId: orderId,
          cityCode,
          payload: buildOrderCreatedPayload({
            orderId,
            cityCode,
            customerId: parsed.data.customerId,
            skuId: sku.skuId,
            totalAmount,
            createdAt: now,
          }) as unknown as Record<string, unknown>,
        });
      });

      const order = await this.repository.findById(context, cityCode, orderId);
      if (!order) {
        throw new Error("Failed to load created order");
      }
      return order;
    });
  }

  async getOrder(context: RequestContext, orderId: string): Promise<Order> {
    return executeCityScoped(context, async (cityCode) => {
      const order = await this.repository.findById(context, cityCode, orderId);
      if (!order) {
        throw new OrderNotFoundError(orderId);
      }
      return order;
    });
  }
}

export const orderService = new OrderService();
