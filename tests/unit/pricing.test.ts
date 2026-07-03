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
  it("returns hangzhou price for demo sku", async () => {
    const quote = await pricingService.getQuote(context("hangzhou"), "demo_cleaning_sku");
    expect(quote.cityCode).toBe("hangzhou");
    expect(quote.skuId).toBe("demo_cleaning_sku");
    expect(quote.currency).toBe("CNY");
    expect(quote.basePrice).toBe(99);
  });

  it("shanghai price differs from hangzhou", async () => {
    const quote = await pricingService.getQuote(context("shanghai"), "demo_cleaning_sku");
    expect(quote.cityCode).toBe("shanghai");
    expect(quote.basePrice).toBe(109);
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
