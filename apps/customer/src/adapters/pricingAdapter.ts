import type { PriceQuote } from "@xlb/types";

export interface CustomerQuoteViewModel {
  basePrice: number;
  currency: string;
  priceText: string;
  priceType: string;
  sourceLabel: string;
}

export function toCustomerQuoteViewModel(quote: PriceQuote): CustomerQuoteViewModel {
  return {
    basePrice: quote.basePrice,
    currency: quote.currency,
    priceText: quote.priceText,
    priceType: quote.priceType,
    sourceLabel: "价格来自实时报价服务",
  };
}
