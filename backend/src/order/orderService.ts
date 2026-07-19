import type { CreateOrderInput } from "@xlb/validators";
import type { CustomerOrderListResponse, Order } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
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
import {
  MarketingConflictError,
  marketingService,
  MarketingService,
} from "../marketing/marketingService.js";
import {
  decodeCustomerOrderListCursor,
  encodeCustomerOrderListCursor,
  parseCustomerOrderListQuery,
  requireCustomerOrderListScope,
} from "./customerOrderListPolicy.js";

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

export type EnterprisePricingContext = {
  source: "enterprise";
  unitAmount: number;
  priceText: string;
  agreementPriceId: string;
};

function amountToMinor(amount: number): number {
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(amount * 100 - minor) > 1e-6) {
    throw new OrderValidationError("money amount must have at most two decimal places");
  }
  return minor;
}

function isMysqlDeadlock(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_LOCK_DEADLOCK" || candidate.errno === 1213;
}

async function withOrderTransactionRetry<T>(
  callback: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTransaction(callback);
    } catch (error) {
      if (!isMysqlDeadlock(error)) throw error;
      if (attempt === maxAttempts) {
        throw new MarketingConflictError("concurrent Order/Marketing command could not be serialized");
      }
    }
  }
  throw new MarketingConflictError("concurrent Order/Marketing command could not be serialized");
}

export class OrderService {
  constructor(
    private readonly repository: OrderRepository = orderRepository,
    private readonly pricingRepo: PricingRepository = pricingRepository,
    private readonly outboxRepo: EventOutboxRepository = eventOutboxRepository,
    private readonly marketing: MarketingService = marketingService,
  ) {}

  async createOrder(
    context: RequestContext,
    input: CreateOrderInput,
    pricingOverride?: EnterprisePricingContext,
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

    const hasMarketingDecision = parsed.data.discountDecisionId !== undefined;
    if (pricingOverride && hasMarketingDecision) {
      throw new OrderValidationError("enterprise agreement pricing and Marketing discount are mutually exclusive");
    }

    return executeCityScoped(context, async (cityCode) => {
      if (hasMarketingDecision) {
        const replay = await withTransaction((connection) => this.marketing.findAcceptedOrderReplay(
          connection,
          context,
          {
            discountDecisionId: parsed.data.discountDecisionId!,
            expectedDecisionVersion: parsed.data.discountDecisionRevision!,
            orderCommandKey: parsed.data.orderIdempotencyKey!,
            skuId: parsed.data.skuId,
            quantity: parsed.data.quantity,
          },
        ));
        if (replay) {
          const existing = await this.repository.findById(context, cityCode, replay.acceptedOrderId);
          if (!existing) throw new Error("accepted Marketing decision points to a missing Order");
          return existing;
        }
      }

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

      const proposedOrderId = generateOrderId();
      const publicTotalAmount = Number((breakdown.totalAmount * parsed.data.quantity).toFixed(2));
      const publicGrossAmountMinor = amountToMinor(publicTotalAmount);
      const baseQuoteSnapshot = {
        priceRuleId: priceRule.priceRuleId,
        skuId: sku.skuId,
        quantity: parsed.data.quantity,
        currency: priceRule.currency,
        priceText: pricingOverride?.priceText ?? priceRule.priceText,
        priceType: priceRule.priceType,
        unitAmount: breakdown.totalAmount,
        totalAmount: publicTotalAmount,
        breakdown,
        skuProfile,
        standards,
        pricingSource: pricingOverride ? "enterprise" as const : "public" as const,
        calculationVersion: 1 as const,
        minorUnit: 2 as const,
        grossAmountMinor: publicGrossAmountMinor,
        discountAmountMinor: 0,
        netAmountMinor: publicGrossAmountMinor,
        marketingDecision: null,
      };
      const now = new Date().toISOString();

      const runOrderTransaction = hasMarketingDecision ? withOrderTransactionRetry : withTransaction;
      const persistedOrderId = await runOrderTransaction(async (connection) => {
        if (hasMarketingDecision) {
          const replay = await this.marketing.findAcceptedOrderReplay(connection, context, {
            discountDecisionId: parsed.data.discountDecisionId!,
            expectedDecisionVersion: parsed.data.discountDecisionRevision!,
            orderCommandKey: parsed.data.orderIdempotencyKey!,
            skuId: parsed.data.skuId,
            quantity: parsed.data.quantity,
          });
          if (replay) return replay.acceptedOrderId;
        }

        const canonicalSku = await this.repository.findEnabledSkuForUpdate(
          connection, cityCode, parsed.data.skuId,
        );
        if (!canonicalSku) {
          throw new OrderValidationError(
            `SKU not found or disabled for city_code=${cityCode}: ${parsed.data.skuId}`,
          );
        }

        const prepared = hasMarketingDecision
          ? await this.marketing.prepareDecisionForOrder(connection, context, {
              discountDecisionId: parsed.data.discountDecisionId!,
              expectedDecisionVersion: parsed.data.discountDecisionRevision!,
              orderId: proposedOrderId,
              orderCommandKey: parsed.data.orderIdempotencyKey!,
              skuId: parsed.data.skuId,
              quantity: parsed.data.quantity,
            })
          : null;
        if (prepared && !prepared.canonicalQuote) {
          throw new MarketingConflictError("canonical public Pricing evidence is unavailable for Order acceptance");
        }
        const canonicalQuote = prepared?.canonicalQuote ?? null;
        const transactionPriceRule = canonicalQuote?.rule ?? priceRule;
        const transactionBreakdown = canonicalQuote?.breakdown ?? breakdown;
        const transactionUnitAmount = canonicalQuote?.breakdown.totalAmount ?? breakdown.totalAmount;
        const grossAmountMinor = prepared?.decision.grossAmountMinor ?? publicGrossAmountMinor;
        const discountAmountMinor = prepared?.decision.discountAmountMinor ?? 0;
        const netAmountMinor = prepared?.decision.netAmountMinor ?? publicGrossAmountMinor;
        const totalAmount = netAmountMinor / 100;
        const quoteSnapshot = {
          ...baseQuoteSnapshot,
          priceRuleId: transactionPriceRule.priceRuleId,
          skuId: canonicalSku.skuId,
          currency: transactionPriceRule.currency,
          priceText: pricingOverride?.priceText ?? transactionPriceRule.priceText,
          priceType: transactionPriceRule.priceType,
          unitAmount: transactionUnitAmount,
          totalAmount,
          breakdown: transactionBreakdown,
          pricingSource: prepared ? "marketing" as const : baseQuoteSnapshot.pricingSource,
          grossAmountMinor,
          discountAmountMinor,
          netAmountMinor,
        };

        await this.repository.insertOrder(connection, {
          orderId: proposedOrderId,
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
          skuId: canonicalSku.skuId,
          skuName: canonicalSku.name,
          quantity: parsed.data.quantity,
          unit: canonicalSku.unit,
          priceRuleId: transactionPriceRule.priceRuleId,
          priceText: pricingOverride?.priceText ?? transactionPriceRule.priceText,
          priceType: transactionPriceRule.priceType,
          basePrice: pricingOverride?.unitAmount ?? transactionPriceRule.basePrice,
          currency: transactionPriceRule.currency,
          totalAmount,
          quoteSnapshot,
          status: "pending_dispatch",
        });

        if (prepared) {
          const accepted = await this.marketing.commitPreparedDecisionAcceptance(connection, context, prepared);
          const acceptedSnapshot = {
            ...quoteSnapshot,
            marketingDecision: {
              decisionId: accepted.decision.discountDecisionId,
              decisionRevision: accepted.decision.version,
              ruleRevisionId: accepted.decision.ruleRevisionId,
              ruleContentHash: accepted.decision.ruleContentHash,
              couponDefinitionId: accepted.decision.couponDefinitionId,
              grantId: accepted.decision.couponGrantId,
              reservationId: accepted.reservation.couponReservationId,
              redemptionId: accepted.redemption.couponRedemptionId,
              requestFingerprint: accepted.decision.requestFingerprint,
              issuedAt: accepted.decision.createdAt,
              expiresAt: accepted.decision.expiresAt,
              acceptedAt: accepted.redemption.redeemedAt,
            },
          };
          await this.repository.updatePriceSnapshot(connection, cityCode, proposedOrderId, acceptedSnapshot);

          const lifecyclePayload = {
            couponReservationId: accepted.reservation.couponReservationId,
            couponGrantId: accepted.decision.couponGrantId,
            discountDecisionId: accepted.decision.discountDecisionId,
            orderId: proposedOrderId,
            discountAmountMinor: accepted.decision.discountAmountMinor,
            currency: "CNY" as const,
          };
          await this.outboxRepo.insertEvent(connection, {
            eventId: generateEventId(), eventType: "marketing.coupon.reserved", eventMajorVersion: 1,
            aggregateType: "coupon_reservation", aggregateId: accepted.reservation.couponReservationId,
            cityCode, payload: { ...lifecyclePayload, occurredAt: accepted.reservation.createdAt },
          });
          await this.outboxRepo.insertEvent(connection, {
            eventId: generateEventId(), eventType: "marketing.coupon.redeemed", eventMajorVersion: 1,
            aggregateType: "coupon_redemption", aggregateId: accepted.redemption.couponRedemptionId,
            cityCode, payload: { ...lifecyclePayload, occurredAt: accepted.redemption.redeemedAt },
          });
        }

        await this.outboxRepo.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "order.created",
          aggregateType: "order",
          aggregateId: proposedOrderId,
          cityCode,
          payload: buildOrderCreatedPayload({
            orderId: proposedOrderId,
            cityCode,
            customerId,
            skuId: canonicalSku.skuId,
            totalAmount,
            createdAt: now,
          }) as unknown as Record<string, unknown>,
        });
        return proposedOrderId;
      });

      const order = await this.repository.findById(context, cityCode, persistedOrderId);
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
      if (context.appType === "customer" && context.role === "customer" && order.customerId !== context.userId) {
        throw new OrderOwnershipError(orderId);
      }
      return order;
    });
  }

  async listCustomerOrders(
    context: RequestContext,
    input: unknown,
  ): Promise<CustomerOrderListResponse> {
    const scope = requireCustomerOrderListScope(context);
    const query = parseCustomerOrderListQuery(input);
    const cursor = decodeCustomerOrderListCursor(query.cursor, scope);
    const rows = await this.repository.listByCustomer(
      context,
      scope.cityCode as Order["cityCode"],
      scope.customerId,
      cursor,
      query.limit + 1,
    );
    const hasMore = rows.length > query.limit;
    const orders = hasMore ? rows.slice(0, query.limit) : rows;
    const last = orders.at(-1);
    return {
      ok: true,
      orders,
      nextCursor: hasMore && last
        ? encodeCustomerOrderListCursor(scope, { createdAt: last.createdAt, orderId: last.orderId })
        : null,
    };
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
