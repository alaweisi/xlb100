import type { CreateOrderInput } from "@xlb/validators";
import type { Order } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { createOrderSchema } from "@xlb/validators";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { pricingRepository, PricingRepository } from "../pricing/pricingRepository.js";
import { buildPriceQuoteBreakdown } from "../pricing/pricingRepository.js";
import { eventOutboxRepository, EventOutboxRepository } from "../events/eventOutbox.js";
import { buildOrderCreatedPayload } from "../events/orderPaidEvent.js";
import { generateEventId, generateOrderId } from "../events/eventIds.js";
import { assertOrderTransition } from "./orderStateMachine.js";
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

export class OrderOwnershipError extends Error {
  readonly statusCode = 403;

  constructor(orderId: string) {
    super(`Order is not owned by current customer: ${orderId}`);
    this.name = "OrderOwnershipError";
  }
}

export class OrderServiceConfirmationError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "OrderServiceConfirmationError";
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

  async createOrder(
    context: RequestContext,
    input: CreateOrderInput,
    pricingOverride?: { unitAmount: number; priceText: string },
  ): Promise<Order> {
    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new OrderValidationError(parsed.error.message);
    }

    // Phase 14 auth fix: customerId MUST come from authenticated context,
    // NOT from client body. Prevents identity forgery in order creation.
    if (!context.userId) {
      throw new OrderValidationError("authenticated user identity required for order creation");
    }
    const customerId = context.userId;

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
      const [feeItems, skuProfile, standards] = await Promise.all([
        this.pricingRepo.findFeeItemsByPriceRule(context, cityCode, priceRule.priceRuleId),
        this.pricingRepo.findSkuProfile(context, cityCode, priceRule.skuId),
        this.pricingRepo.findServiceStandards(context, cityCode, priceRule.skuId),
      ]);
      const publicBreakdown = buildPriceQuoteBreakdown(priceRule, feeItems);
      if (pricingOverride && (!Number.isFinite(pricingOverride.unitAmount) || pricingOverride.unitAmount <= 0)) {
        throw new OrderValidationError("pricing override must be a positive finite amount");
      }
      const breakdown = pricingOverride
        ? { ...publicBreakdown, baseAmount: pricingOverride.unitAmount, requiredFeeAmount: 0, optionalFeeAmount: 0,
            totalAmount: pricingOverride.unitAmount, feeItems: [] }
        : publicBreakdown;

      const orderId = generateOrderId();
      const totalAmount = Number((breakdown.totalAmount * parsed.data.quantity).toFixed(2));
      const quoteSnapshot = {
        priceRuleId: priceRule.priceRuleId,
        skuId: sku.skuId,
        quantity: parsed.data.quantity,
        currency: priceRule.currency,
        priceText: pricingOverride?.priceText ?? priceRule.priceText,
        priceType: priceRule.priceType,
        unitAmount: breakdown.totalAmount,
        totalAmount,
        breakdown,
        skuProfile,
        standards,
      };
      const now = new Date().toISOString();

      await withTransaction(async (connection) => {
        await this.repository.insertOrder(connection, {
          orderId,
          cityCode,
          addressProvince: parsed.data.addressProvince,
          addressCity: parsed.data.addressCity,
          addressDistrict: parsed.data.addressDistrict,
          detailAddress: parsed.data.detailAddress,
          contactName: parsed.data.contactName,
          contactPhone: parsed.data.contactPhone,
          scheduledAt: parsed.data.scheduledAt,
          scheduledTimeSlot: parsed.data.scheduledTimeSlot,
          customerId,
          skuId: sku.skuId,
          skuName: sku.name,
          quantity: parsed.data.quantity,
          unit: sku.unit,
          priceRuleId: priceRule.priceRuleId,
          priceText: pricingOverride?.priceText ?? priceRule.priceText,
          priceType: priceRule.priceType,
          basePrice: pricingOverride?.unitAmount ?? priceRule.basePrice,
          currency: priceRule.currency,
          totalAmount,
          quoteSnapshot,
          status: "pending_dispatch",
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
            customerId,
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

  async confirmServiceCompleted(context: RequestContext, orderId: string): Promise<Order> {
    return executeCityScoped(context, async (cityCode) => {
      if (!context.userId) {
        throw new OrderValidationError("authenticated user identity required for service confirmation");
      }

      const order = await this.repository.findById(context, cityCode, orderId);
      if (!order) {
        throw new OrderNotFoundError(orderId);
      }
      if (order.customerId !== context.userId) {
        throw new OrderOwnershipError(orderId);
      }
      if (order.status === "service_completed") {
        return order;
      }

      assertOrderTransition(order.status, "service_completed");

      const completedFulfillment = await this.repository.findCompletedFulfillmentForOrder(
        context,
        cityCode,
        orderId,
      );
      if (!completedFulfillment) {
        throw new OrderServiceConfirmationError(
          "Order can be confirmed only after worker fulfillment is completed",
        );
      }

      await withTransaction(async (connection) => {
        await this.repository.updateStatus(connection, cityCode, orderId, "service_completed");
      });

      const updated = await this.repository.findById(context, cityCode, orderId);
      if (!updated) {
        throw new Error("Failed to load confirmed order");
      }
      return updated;
    });
  }
}

export const orderService = new OrderService();
