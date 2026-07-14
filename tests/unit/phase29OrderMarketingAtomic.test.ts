import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingDiscountDecision, RequestContext } from "@xlb/types";

const transactionState = vi.hoisted(() => ({
  durable: [] as string[],
  connections: [] as Array<{ pending: string[] }>,
}));

vi.mock("../../backend/src/dal/transaction.js", () => ({
  withTransaction: vi.fn(async (callback: (connection: { pending: string[] }) => Promise<unknown>) => {
    const connection = { pending: [] as string[] };
    transactionState.connections.push(connection);
    try {
      const result = await callback(connection);
      transactionState.durable.push(...connection.pending);
      return result;
    } catch (error) {
      // Simulate MySQL rollback: uncommitted Order/Marketing/outbox writes are discarded together.
      connection.pending.length = 0;
      throw error;
    }
  }),
}));

import {
  OrderService,
  OrderValidationError,
} from "../../backend/src/order/orderService.js";
import { MarketingConflictError } from "../../backend/src/marketing/marketingService.js";

type TestConnection = { pending: string[] };

const context: RequestContext = {
  traceId: "trace-order-marketing",
  requestStartedAt: "2026-07-14T02:00:00.000Z",
  appType: "customer",
  role: "customer",
  cityCode: "hangzhou",
  userId: "customer-1",
};

const command = {
  skuId: "sku-1",
  quantity: 2,
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "文一路 1 号",
  contactName: "测试用户",
  contactPhone: "13800000000",
  scheduledAt: "2026-07-15T02:00:00.000Z",
  scheduledTimeSlot: "morning" as const,
  discountDecisionId: "decision-1",
  discountDecisionRevision: 1,
  orderIdempotencyKey: "order-command-0001",
};

const issuedDecision: MarketingDiscountDecision = {
  discountDecisionId: "decision-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  skuId: "sku-1",
  quantity: 2,
  priceRuleId: "price-rule-1",
  priceRuleVersion: 3,
  ruleRevisionId: "rule-revision-1",
  ruleContentHash: "b".repeat(64),
  couponDefinitionId: "definition-1",
  couponGrantId: "grant-1",
  currency: "CNY",
  grossAmountMinor: 20_000,
  discountAmountMinor: 2_000,
  netAmountMinor: 18_000,
  requestFingerprint: "a".repeat(64),
  status: "issued",
  expiresAt: "2026-07-14T02:05:00.000Z",
  acceptedOrderId: null,
  version: 1,
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "2026-07-14T02:00:00.000Z",
};

const acceptedDecision: MarketingDiscountDecision = {
  ...issuedDecision,
  status: "accepted",
  acceptedOrderId: "order-created",
  version: 2,
  updatedAt: "2026-07-14T02:01:00.000Z",
};

const reservation = {
  couponReservationId: "reservation-1",
  couponGrantId: "grant-1",
  discountDecisionId: "decision-1",
  orderId: "order-created",
  cityCode: "hangzhou",
  customerId: "customer-1",
  status: "redeemed" as const,
  currency: "CNY" as const,
  discountAmountMinor: 2_000,
  expiresAt: "2026-07-14T02:02:00.000Z",
  releasedReason: null,
  version: 2,
  createdAt: "2026-07-14T02:01:00.000Z",
  updatedAt: "2026-07-14T02:01:00.000Z",
};

const redemption = {
  couponRedemptionId: "redemption-1",
  couponReservationId: "reservation-1",
  couponGrantId: "grant-1",
  discountDecisionId: "decision-1",
  orderId: "order-created",
  cityCode: "hangzhou",
  customerId: "customer-1",
  currency: "CNY" as const,
  discountAmountMinor: 2_000,
  redeemedAt: "2026-07-14T02:01:00.000Z",
};

function harness() {
  const operationOrder: string[] = [];
  let storedOrder: Record<string, unknown> | null = null;
  const repository = {
    findEnabledSku: vi.fn().mockResolvedValue({ skuId: "sku-1", name: "上门服务", unit: "次" }),
    findEnabledSkuForUpdate: vi.fn().mockResolvedValue({ skuId: "sku-1", name: "上门服务", unit: "次" }),
    insertOrder: vi.fn(async (connection: TestConnection, input: Record<string, unknown>) => {
      operationOrder.push("insert-order");
      connection.pending.push("order", "initial-price-snapshot");
      storedOrder = input;
    }),
    updatePriceSnapshot: vi.fn(async (connection: TestConnection) => {
      operationOrder.push("update-marketing-snapshot");
      connection.pending.push("accepted-price-snapshot");
    }),
    findById: vi.fn(async () => storedOrder ? ({
      ...storedOrder,
      orderId: storedOrder.orderId,
      createdAt: "2026-07-14T02:01:00.000Z",
      updatedAt: "2026-07-14T02:01:00.000Z",
    }) : null),
  };
  const pricing = {
    findPriceRuleBySku: vi.fn().mockResolvedValue({
      priceRuleId: "price-rule-1",
      cityCode: "hangzhou",
      skuId: "sku-1",
      basePrice: 100,
      currency: "CNY",
      priceText: "100 元/次",
      priceType: "fixed",
      minPrice: null,
      maxPrice: null,
      pricingNote: null,
      isEnabled: true,
      version: 3,
    }),
    findFeeItemsByPriceRule: vi.fn().mockResolvedValue([]),
    findSkuProfile: vi.fn().mockResolvedValue(null),
    findServiceStandards: vi.fn().mockResolvedValue([]),
  };
  const outbox = {
    insertEvent: vi.fn(async (connection: TestConnection, event: { eventType: string }) => {
      operationOrder.push(`outbox:${event.eventType}`);
      connection.pending.push(`outbox:${event.eventType}`);
    }),
  };
  const prepared = {
    request: {
      discountDecisionId: "decision-1",
      expectedDecisionVersion: 1,
      orderId: "order-created",
      orderCommandKey: "order-command-0001",
      skuId: "sku-1",
      quantity: 2,
    },
    decision: issuedDecision,
    couponReservationId: "reservation-1",
    couponRedemptionId: "redemption-1",
    grantVersion: 1,
    reservationExpiresAt: reservation.expiresAt,
    idempotent: false,
    existingReservation: null,
    existingRedemption: null,
    canonicalQuote: {
      rule: {
        priceRuleId: "price-rule-1", cityCode: "hangzhou", skuId: "sku-1",
        basePrice: 100, currency: "CNY", priceText: "CNY 100/service", priceType: "fixed",
        minPrice: null, maxPrice: null, pricingNote: null, isEnabled: true, version: 3,
      },
      feeItems: [],
      breakdown: {
        baseAmount: 100, requiredFeeAmount: 0, optionalFeeAmount: 0,
        totalAmount: 100, feeItems: [],
      },
      unitAmountMinor: 10_000,
      unitAmountDecimal: "100.00",
    },
  };
  const marketing = {
    findAcceptedOrderReplay: vi.fn().mockResolvedValue(null),
    prepareDecisionForOrder: vi.fn(async (_connection: TestConnection, _context: RequestContext, input: typeof prepared.request) => ({
      ...prepared,
      request: input,
    })),
    commitPreparedDecisionAcceptance: vi.fn(async (connection: TestConnection) => {
      operationOrder.push("accept-marketing");
      connection.pending.push("coupon-reservation", "coupon-redemption", "decision-accepted");
      return { decision: acceptedDecision, reservation, redemption, idempotent: false };
    }),
  };
  const service = new OrderService(repository as never, pricing as never, outbox as never, marketing as never);
  return { service, repository, pricing, outbox, marketing, operationOrder };
}

beforeEach(() => {
  transactionState.durable.length = 0;
  transactionState.connections.length = 0;
});

describe("Phase29 Order / Marketing atomic acceptance", () => {
  it("persists Order, reservation/redemption, authoritative snapshot and outbox in one transaction", async () => {
    const { service, repository, outbox, marketing, operationOrder } = harness();
    const result = await service.createOrder(context, command);

    const writeConnection = transactionState.connections[1];
    expect(writeConnection).toBeDefined();
    expect(repository.insertOrder.mock.calls[0]?.[0]).toBe(writeConnection);
    expect(repository.findEnabledSkuForUpdate).toHaveBeenCalledWith(writeConnection, "hangzhou", "sku-1");
    expect(marketing.prepareDecisionForOrder.mock.calls[0]?.[0]).toBe(writeConnection);
    expect(marketing.commitPreparedDecisionAcceptance.mock.calls[0]?.[0]).toBe(writeConnection);
    expect(repository.updatePriceSnapshot.mock.calls[0]?.[0]).toBe(writeConnection);
    expect(outbox.insertEvent.mock.calls.every(([connection]) => connection === writeConnection)).toBe(true);
    expect(operationOrder).toEqual([
      "insert-order",
      "accept-marketing",
      "update-marketing-snapshot",
      "outbox:marketing.coupon.reserved",
      "outbox:marketing.coupon.redeemed",
      "outbox:order.created",
    ]);
    expect(transactionState.durable).toEqual([
      "order",
      "initial-price-snapshot",
      "coupon-reservation",
      "coupon-redemption",
      "decision-accepted",
      "accepted-price-snapshot",
      "outbox:marketing.coupon.reserved",
      "outbox:marketing.coupon.redeemed",
      "outbox:order.created",
    ]);
    expect(repository.insertOrder).toHaveBeenCalledWith(writeConnection, expect.objectContaining({
      totalAmount: 180,
      quoteSnapshot: expect.objectContaining({
        pricingSource: "marketing",
        unitAmount: 100,
        breakdown: expect.objectContaining({ totalAmount: 100 }),
        grossAmountMinor: 20_000,
        discountAmountMinor: 2_000,
        netAmountMinor: 18_000,
      }),
    }));
    expect(repository.updatePriceSnapshot).toHaveBeenCalledWith(
      writeConnection,
      "hangzhou",
      expect.any(String),
      expect.objectContaining({
        marketingDecision: expect.objectContaining({
          decisionId: "decision-1",
          ruleRevisionId: "rule-revision-1",
          reservationId: "reservation-1",
          redemptionId: "redemption-1",
        }),
      }),
    );
    expect(result.totalAmount).toBe(180);
  });

  it("rolls back the staged Order when Marketing acceptance conflicts", async () => {
    const { service, repository, outbox, marketing } = harness();
    marketing.commitPreparedDecisionAcceptance.mockImplementationOnce(async () => {
      throw new MarketingConflictError("coupon grant reservation CAS conflict");
    });

    await expect(service.createOrder(context, command)).rejects.toBeInstanceOf(MarketingConflictError);
    expect(repository.insertOrder).toHaveBeenCalledTimes(1);
    expect(repository.updatePriceSnapshot).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
    expect(transactionState.durable).toEqual([]);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it("retries a bounded transaction deadlock and commits only the canonical second attempt", async () => {
    const { service, marketing } = harness();
    marketing.commitPreparedDecisionAcceptance.mockRejectedValueOnce(
      Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 }),
    );

    await expect(service.createOrder(context, command)).resolves.toMatchObject({ totalAmount: 180 });
    expect(marketing.commitPreparedDecisionAcceptance).toHaveBeenCalledTimes(2);
    expect(transactionState.connections).toHaveLength(3);
    expect(transactionState.connections[1]?.pending).toEqual([]);
    expect(transactionState.durable).toContain("coupon-redemption");
  });

  it("returns the canonical accepted Order on same-key replay without re-pricing or writing", async () => {
    const { service, repository, pricing, outbox, marketing } = harness();
    const existingOrder = {
      orderId: "order-existing",
      cityCode: "hangzhou",
      customerId: "customer-1",
      skuId: "sku-1",
      totalAmount: 180,
    };
    marketing.findAcceptedOrderReplay.mockResolvedValueOnce({
      acceptedOrderId: "order-existing",
      decision: acceptedDecision,
      reservation,
      redemption,
    });
    repository.findById.mockResolvedValueOnce(existingOrder);

    await expect(service.createOrder(context, command)).resolves.toBe(existingOrder);
    expect(pricing.findPriceRuleBySku).not.toHaveBeenCalled();
    expect(repository.insertOrder).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
    expect(transactionState.durable).toEqual([]);
  });

  it("fails closed on conflicting replay and enterprise/coupon stacking", async () => {
    const conflictHarness = harness();
    conflictHarness.marketing.findAcceptedOrderReplay.mockRejectedValueOnce(
      new MarketingConflictError("order command idempotency key conflicts"),
    );
    await expect(conflictHarness.service.createOrder(context, command)).rejects.toBeInstanceOf(MarketingConflictError);
    expect(conflictHarness.repository.insertOrder).not.toHaveBeenCalled();

    const enterpriseHarness = harness();
    await expect(enterpriseHarness.service.createOrder(context, command, {
      source: "enterprise",
      unitAmount: 88,
      priceText: "agreement price",
      agreementPriceId: "agreement-price-1",
    })).rejects.toBeInstanceOf(OrderValidationError);
    expect(enterpriseHarness.marketing.findAcceptedOrderReplay).not.toHaveBeenCalled();
    expect(enterpriseHarness.repository.insertOrder).not.toHaveBeenCalled();
  });
});
