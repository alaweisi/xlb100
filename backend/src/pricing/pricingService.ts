import type { PriceQuote } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { pricingQuoteQuerySchema } from "@xlb/validators";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { pricingRepository, PricingRepository } from "./pricingRepository.js";

export class PricingNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(cityCode: string, skuId: string) {
    super(`Price rule not found for city_code=${cityCode} skuId=${skuId}`);
    this.name = "PricingNotFoundError";
  }
}

export class PricingService {
  constructor(
    private readonly repository: PricingRepository = pricingRepository,
  ) {}

  async getQuote(context: RequestContext, skuId: string): Promise<PriceQuote> {
    const parsed = pricingQuoteQuerySchema.safeParse({ skuId });
    if (!parsed.success) {
      throw new PricingValidationError(parsed.error.message);
    }

    return executeCityScoped(context, async (cityCode) => {
      const rule = await this.repository.findPriceRuleBySku(
        context,
        cityCode,
        parsed.data.skuId,
      );
      if (!rule) {
        throw new PricingNotFoundError(cityCode, parsed.data.skuId);
      }

      return {
        cityCode: rule.cityCode,
        skuId: rule.skuId,
        basePrice: rule.basePrice,
        currency: rule.currency as "CNY",
        priceText: rule.priceText,
        priceType: rule.priceType,
        minPrice: rule.minPrice,
        maxPrice: rule.maxPrice,
        pricingNote: rule.pricingNote,
        priceRuleId: rule.priceRuleId,
        version: rule.version,
      };
    });
  }
}

export class PricingValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "PricingValidationError";
  }
}

export const pricingService = new PricingService();
