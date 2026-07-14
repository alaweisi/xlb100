import { createHash, randomUUID } from "node:crypto";
import type {
  CouponDefinitionStatus,
  CouponGrantStatus,
  MarketingCampaignStatus,
  MarketingDiscountDecisionStatus,
  MarketingRuleRevisionStatus,
} from "@xlb/types";

export const MARKETING_DECISION_TTL_MS = 5 * 60 * 1000;
export const MARKETING_RESERVATION_TTL_MS = 2 * 60 * 1000;
export const MARKETING_COMPENSATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function marketingId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function marketingHash(value: unknown): string {
  const serialized = typeof value === "string"
    ? value
    : JSON.stringify(canonicalize(value));
  return createHash("sha256").update(serialized).digest("hex");
}

export function assertSafeMinorAmount(value: number, label: string, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer amount in fen`);
  }
}

/** Exact DECIMAL string -> CNY fen conversion. No floating-point money arithmetic. */
export function decimalStringToMinorExact(value: string, label: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`${label} must be a non-negative decimal with at most two fraction digits`);
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100n + fraction;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds safe integer fen range`);
  return Number(minor);
}

export function multiplyMinorExact(unitAmountMinor: number, quantity: number, label: string): number {
  assertSafeMinorAmount(unitAmountMinor, `${label}.unitAmountMinor`, true);
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(`${label}.quantity must be a positive safe integer`);
  const total = BigInt(unitAmountMinor) * BigInt(quantity);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds safe integer fen range`);
  return Number(total);
}

export function calculateFixedCouponAmounts(grossAmountMinor: number, faceValueMinor: number): {
  grossAmountMinor: number;
  discountAmountMinor: number;
  netAmountMinor: number;
} {
  assertSafeMinorAmount(grossAmountMinor, "grossAmountMinor");
  assertSafeMinorAmount(faceValueMinor, "faceValueMinor");
  if (faceValueMinor >= grossAmountMinor) {
    throw new Error("coupon discount must leave an order net amount of at least one fen");
  }
  return {
    grossAmountMinor,
    discountAmountMinor: faceValueMinor,
    netAmountMinor: grossAmountMinor - faceValueMinor,
  };
}

export function assertUtcWindow(now: Date, startAt: Date, endAt: Date, label: string): void {
  if (!(startAt.getTime() <= now.getTime() && now.getTime() < endAt.getTime())) {
    throw new Error(`${label} is outside its active UTC window`);
  }
}

const campaignTransitions: Record<MarketingCampaignStatus, readonly MarketingCampaignStatus[]> = {
  draft: ["reviewed"],
  reviewed: ["scheduled"],
  scheduled: ["active", "revoked"],
  active: ["paused", "ended", "revoked"],
  paused: ["active", "ended", "revoked"],
  ended: [],
  revoked: [],
};

const ruleTransitions: Record<MarketingRuleRevisionStatus, readonly MarketingRuleRevisionStatus[]> = {
  draft: ["reviewed"],
  reviewed: ["published"],
  published: ["retired"],
  retired: [],
};

const definitionTransitions: Record<CouponDefinitionStatus, readonly CouponDefinitionStatus[]> = {
  draft: ["active", "retired"],
  active: ["suspended", "expired", "retired"],
  suspended: ["active", "expired", "retired"],
  expired: ["retired"],
  retired: [],
};

const grantTransitions: Record<CouponGrantStatus, readonly CouponGrantStatus[]> = {
  granted: ["available", "revoked", "expired"],
  available: ["reserved", "revoked", "expired"],
  reserved: ["redeemed", "released", "expired"],
  redeemed: [],
  released: ["available", "revoked", "expired"],
  expired: [],
  revoked: [],
};

const decisionTransitions: Record<MarketingDiscountDecisionStatus, readonly MarketingDiscountDecisionStatus[]> = {
  issued: ["accepted", "expired", "rejected"],
  accepted: [],
  expired: [],
  rejected: [],
};

function assertTransition<T extends string>(
  current: T,
  target: T,
  transitions: Record<T, readonly T[]>,
  label: string,
): void {
  if (!transitions[current]?.includes(target)) {
    throw new Error(`invalid ${label} transition: ${current} -> ${target}`);
  }
}

export const assertCampaignTransition = (current: MarketingCampaignStatus, target: MarketingCampaignStatus) =>
  assertTransition(current, target, campaignTransitions, "marketing campaign");
export const assertRuleRevisionTransition = (current: MarketingRuleRevisionStatus, target: MarketingRuleRevisionStatus) =>
  assertTransition(current, target, ruleTransitions, "marketing rule revision");
export const assertCouponDefinitionTransition = (current: CouponDefinitionStatus, target: CouponDefinitionStatus) =>
  assertTransition(current, target, definitionTransitions, "coupon definition");
export const assertCouponGrantTransition = (current: CouponGrantStatus, target: CouponGrantStatus) =>
  assertTransition(current, target, grantTransitions, "coupon grant");
export const assertDiscountDecisionTransition = (
  current: MarketingDiscountDecisionStatus,
  target: MarketingDiscountDecisionStatus,
) => assertTransition(current, target, decisionTransitions, "marketing discount decision");
