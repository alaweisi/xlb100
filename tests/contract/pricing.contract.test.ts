import { describe, it, expect } from "vitest";
import { priceRuleSchema, priceQuoteSchema } from "@xlb/validators";

describe("pricing contract", () => {
  it("PriceRule requires cityCode and basePrice >= 0", () => {
    const missingCity = priceRuleSchema.safeParse({
      priceRuleId: "p1",
      skuId: "demo_cleaning_sku",
      basePrice: 99,
      currency: "CNY",
      isEnabled: true,
      version: 1,
    });
    expect(missingCity.success).toBe(false);

    const negative = priceRuleSchema.safeParse({
      priceRuleId: "p1",
      cityCode: "hangzhou",
      skuId: "demo_cleaning_sku",
      basePrice: -1,
      currency: "CNY",
      isEnabled: true,
      version: 1,
    });
    expect(negative.success).toBe(false);
  });

  it("accepts valid CNY price rule with display fields", () => {
    const result = priceRuleSchema.safeParse({
      priceRuleId: "p1",
      cityCode: "hangzhou",
      skuId: "sku_home_daily_2h",
      basePrice: 89,
      currency: "CNY",
      priceText: "¥89/2小时",
      priceType: "fixed",
      minPrice: 89,
      maxPrice: 89,
      pricingNote: null,
      isEnabled: true,
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it("PriceQuote schema requires priceText and priceType", () => {
    const result = priceQuoteSchema.safeParse({
      cityCode: "hangzhou",
      skuId: "sku_home_daily_2h",
      basePrice: 89,
      currency: "CNY",
      priceRuleId: "p1",
      version: 1,
    });
    expect(result.success).toBe(false);
  });
});
