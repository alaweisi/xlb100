import { describe, expect, it } from "vitest";
import {
  assertCampaignTransition,
  assertCouponDefinitionTransition,
  assertCouponGrantTransition,
  assertDiscountDecisionTransition,
  assertRuleRevisionTransition,
  calculateFixedCouponAmounts,
  decimalStringToMinorExact,
  marketingHash,
  multiplyMinorExact,
} from "../../backend/src/marketing/marketingPolicy.js";

describe("Phase29 Marketing integer-fen policy", () => {
  it("converts canonical DECIMAL strings to fen without floating-point authority", () => {
    expect(decimalStringToMinorExact("0", "amount")).toBe(0);
    expect(decimalStringToMinorExact("0.01", "amount")).toBe(1);
    expect(decimalStringToMinorExact("12.3", "amount")).toBe(1_230);
    expect(decimalStringToMinorExact("90071992547409.91", "amount")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each(["-1", "+1", "01.00", "1.001", "1e2", "NaN", "Infinity"])(
    "rejects non-canonical or over-precision amount %s",
    (value) => expect(() => decimalStringToMinorExact(value, "amount")).toThrow(),
  );

  it("multiplies in integer space and rejects overflow", () => {
    expect(multiplyMinorExact(12_345, 3, "quote")).toBe(37_035);
    expect(() => multiplyMinorExact(Number.MAX_SAFE_INTEGER, 2, "quote")).toThrow(/safe integer/);
    expect(() => multiplyMinorExact(1, 1.5, "quote")).toThrow(/positive safe integer/);
  });

  it("enforces gross = discount + net and always leaves at least one fen", () => {
    expect(calculateFixedCouponAmounts(1_001, 1_000)).toEqual({
      grossAmountMinor: 1_001,
      discountAmountMinor: 1_000,
      netAmountMinor: 1,
    });
    expect(() => calculateFixedCouponAmounts(1_000, 1_000)).toThrow(/at least one fen/);
    expect(() => calculateFixedCouponAmounts(999, 1_000)).toThrow(/at least one fen/);
  });

  it("hashes canonical object content independently of key insertion order", () => {
    expect(marketingHash({ z: 1, nested: { b: 2, a: 1 } })).toBe(
      marketingHash({ nested: { a: 1, b: 2 }, z: 1 }),
    );
    expect(marketingHash({ quantity: 1 })).not.toBe(marketingHash({ quantity: 2 }));
  });
});

describe("Phase29 Marketing state machines", () => {
  it("allows only the approved forward transitions", () => {
    expect(() => assertCampaignTransition("draft", "reviewed")).not.toThrow();
    expect(() => assertCampaignTransition("active", "paused")).not.toThrow();
    expect(() => assertCampaignTransition("paused", "active")).not.toThrow();
    expect(() => assertRuleRevisionTransition("reviewed", "published")).not.toThrow();
    expect(() => assertCouponDefinitionTransition("suspended", "active")).not.toThrow();
    expect(() => assertCouponGrantTransition("reserved", "redeemed")).not.toThrow();
    expect(() => assertCouponGrantTransition("released", "available")).not.toThrow();
    expect(() => assertDiscountDecisionTransition("issued", "accepted")).not.toThrow();
  });

  it("rejects skipped, reverse, no-op and terminal-state transitions", () => {
    expect(() => assertCampaignTransition("draft", "active")).toThrow(/invalid marketing campaign transition/);
    expect(() => assertRuleRevisionTransition("published", "reviewed")).toThrow(/invalid marketing rule revision/);
    expect(() => assertCouponDefinitionTransition("retired", "active")).toThrow(/invalid coupon definition/);
    expect(() => assertCouponGrantTransition("redeemed", "released")).toThrow(/invalid coupon grant/);
    expect(() => assertDiscountDecisionTransition("accepted", "accepted")).toThrow(/invalid marketing discount decision/);
    expect(() => assertDiscountDecisionTransition("expired", "accepted")).toThrow(/invalid marketing discount decision/);
  });
});
