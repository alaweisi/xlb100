import type {
  CouponGrant,
  MarketingDiscountDecision,
} from "@xlb/types";
import { issueMarketingDiscountDecisionRequestSchema } from "@xlb/validators";
import type {
  CouponDecisionResult,
  CouponWalletCoordinator,
} from "./CouponWalletCoordinator.js";
import type {
  CustomerCouponCheckoutContext,
  CustomerCouponStatusFilter,
} from "./couponWalletTypes.js";

export interface CustomerCouponNavigation {
  back(): void;
  showStatus(
    status: CustomerCouponStatusFilter,
    context: CustomerCouponCheckoutContext | null,
  ): void;
  returnToCheckout(
    context: CustomerCouponCheckoutContext,
    decision: MarketingDiscountDecision,
  ): void;
}

export type CouponDecisionActionResult =
  | CouponDecisionResult
  | {
      readonly status: "unavailable";
      readonly capability: "customer.coupon-checkout-context";
    };

function createDecisionKey(): string {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-coupon-decision-${random}`;
}

export class CouponWalletActionController {
  readonly #coordinator: CouponWalletCoordinator;
  readonly #navigation: CustomerCouponNavigation;
  #decisionInFlight = false;

  constructor(
    coordinator: CouponWalletCoordinator,
    navigation: CustomerCouponNavigation,
  ) {
    this.#coordinator = coordinator;
    this.#navigation = navigation;
  }

  back(): void {
    this.#navigation.back();
  }

  showStatus(
    status: CustomerCouponStatusFilter,
    context: CustomerCouponCheckoutContext | null,
  ): void {
    this.#navigation.showStatus(status, context);
  }

  returnToCheckout(
    context: CustomerCouponCheckoutContext,
    decision: MarketingDiscountDecision,
  ): void {
    this.#navigation.returnToCheckout(context, decision);
  }

  async requestDecision(
    grant: CouponGrant,
    context: CustomerCouponCheckoutContext | null,
  ): Promise<CouponDecisionActionResult> {
    if (context === null) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.coupon-checkout-context",
      });
    }
    if (this.#decisionInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    const parsed = issueMarketingDiscountDecisionRequestSchema.safeParse({
      skuId: context.skuId,
      quantity: context.quantity,
      selectedCouponGrantId: grant.couponGrantId,
      idempotencyKey: createDecisionKey(),
    });
    if (!parsed.success) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.coupon-checkout-context",
      });
    }

    this.#decisionInFlight = true;
    try {
      return await this.#coordinator.issueDecision(parsed.data);
    } finally {
      this.#decisionInFlight = false;
    }
  }
}
