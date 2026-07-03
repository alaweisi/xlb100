import { describe, it, expect } from "vitest";
import type { RequestContext } from "@xlb/types";
import { pricingService } from "../../backend/src/pricing/pricingService.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

function context(cityCode: string): RequestContext {
  return {
    traceId: "t1",
    appType: "customer",
    role: "customer",
    cityCode: cityCode as RequestContext["cityCode"],
    requestStartedAt: new Date().toISOString(),
  };
}

describe.skipIf(!runDb)("pricingService", () => {
  it("returns hangzhou price for official sku with priceText", async () => {
    const quote = await pricingService.getQuote(context("hangzhou"), "sku_home_daily_2h");
    expect(quote.cityCode).toBe("hangzhou");
    expect(quote.skuId).toBe("sku_home_daily_2h");
    expect(quote.currency).toBe("CNY");
    expect(quote.basePrice).toBe(89);
    expect(quote.priceText).toBe("¥89/2小时");
    expect(quote.priceType).toBe("fixed");
  });

  it("shanghai has independent price rule with same value", async () => {
    const quote = await pricingService.getQuote(context("shanghai"), "sku_home_daily_2h");
    expect(quote.cityCode).toBe("shanghai");
    expect(quote.basePrice).toBe(89);
    expect(quote.priceRuleId).toBe("price_shanghai_sku_home_daily_2h");
  });
});

describe("pricingService (no DB)", () => {
  it("requires cityCode", async () => {
    const ctx: RequestContext = {
      traceId: "t",
      appType: "customer",
      role: "customer",
      requestStartedAt: new Date().toISOString(),
    };
    await expect(pricingService.getQuote(ctx, "demo_cleaning_sku")).rejects.toThrow(/city_code/);
  });
});
