import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type { CityCode, PriceQuote } from "@xlb/types";
import {
  priceQuoteSchema,
  pricingQuoteQuerySchema,
} from "@xlb/validators";
import { parseCatalogSnapshot } from "./ServiceDiscoveryCoordinator.js";
import {
  createCustomerServiceDetailViewModel,
  findEnabledCatalogSku,
  type CustomerServiceDetailViewModel,
} from "./serviceDetail.js";

type CustomerServiceDetailApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "getCatalog" | "getPriceQuote"
>;

export type CustomerServiceDetailLoadResult =
  | {
      readonly status: "ready";
      readonly detail: CustomerServiceDetailViewModel;
    }
  | {
      readonly status: "empty";
      readonly reasonCode: "service_detail_empty";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "catalog_load_failed"
        | "catalog_response_invalid"
        | "quote_load_failed"
        | "quote_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "conflict";
      readonly conflictCode: "quote_version_conflict";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.catalog" | "customer.pricing-quote" | "customer.service-detail";
      readonly reasonCode:
        | "catalog_api_unavailable"
        | "catalog_city_mismatch"
        | "sku_not_found"
        | "quote_api_unavailable";
    };

function cacheKey(cityCode: CityCode, skuId: string): string {
  return `${cityCode}:${skuId}`;
}

function isHttpStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof ApiClientError &&
    error.kind === "http" &&
    error.status !== undefined &&
    statuses.includes(error.status);
}

function isTransient(error: unknown): boolean {
  return error instanceof ApiClientError && (
    error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" && (
      error.status === 429 ||
      error.status === 500 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    ))
  );
}

function retryable(error: unknown): boolean {
  return isTransient(error);
}

function parsePriceQuote(input: unknown, cityCode: CityCode, skuId: string): PriceQuote {
  const quote = priceQuoteSchema.parse(input) as PriceQuote;
  if (
    quote.cityCode !== cityCode ||
    quote.skuId !== skuId ||
    (quote.skuProfile !== null && (
      quote.skuProfile.cityCode !== cityCode ||
      quote.skuProfile.skuId !== skuId
    )) ||
    quote.standards.some((standard) =>
      standard.cityCode !== cityCode || standard.skuId !== skuId) ||
    quote.breakdown.feeItems.some((feeItem) =>
      feeItem.cityCode !== cityCode ||
      feeItem.skuId !== skuId ||
      feeItem.priceRuleId !== quote.priceRuleId)
  ) {
    throw new Error("Price quote does not match the requested city-scoped SKU");
  }
  return quote;
}

export class ServiceDetailCoordinator {
  readonly #api: CustomerServiceDetailApi;
  readonly #cache = new Map<string, CustomerServiceDetailViewModel>();

  constructor(api: CustomerServiceDetailApi) {
    this.#api = api;
  }

  clear(cityCode?: CityCode, skuId?: string): void {
    if (cityCode === undefined) {
      this.#cache.clear();
      return;
    }
    if (skuId !== undefined) {
      this.#cache.delete(cacheKey(cityCode, skuId));
      return;
    }
    const prefix = `${cityCode}:`;
    for (const key of this.#cache.keys()) {
      if (key.startsWith(prefix)) this.#cache.delete(key);
    }
  }

  async load(cityCode: CityCode, requestedSkuId: string): Promise<CustomerServiceDetailLoadResult> {
    const query = pricingQuoteQuerySchema.safeParse({ skuId: requestedSkuId });
    if (!query.success || query.data.skuId !== requestedSkuId.trim()) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.service-detail",
        reasonCode: "sku_not_found",
      });
    }
    const skuId = query.data.skuId;
    const key = cacheKey(cityCode, skuId);

    let catalog;
    try {
      const response = await this.#api.getCatalog();
      catalog = parseCatalogSnapshot(response.catalog);
    } catch (error) {
      const cached = this.#cache.get(key);
      if (cached !== undefined && isTransient(error)) {
        return Object.freeze({
          status: "ready",
          detail: Object.freeze({
            ...cached,
            freshness: "stale",
            staleReason: "catalog_refresh_failed",
          }),
        });
      }
      if (isHttpStatus(error, 404, 501, 503)) {
        return Object.freeze({
          status: "unavailable",
          capability: "customer.catalog",
          reasonCode: "catalog_api_unavailable",
        });
      }
      return Object.freeze({
        status: "error",
        errorCode: error instanceof ApiClientError
          ? "catalog_load_failed"
          : "catalog_response_invalid",
        retryable: retryable(error),
      });
    }

    if (catalog.cityCode !== cityCode) {
      this.#cache.delete(key);
      return Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: "catalog_city_mismatch",
      });
    }

    const match = findEnabledCatalogSku(catalog, skuId);
    if (match === null) {
      this.#cache.delete(key);
      return Object.freeze({
        status: "unavailable",
        capability: "customer.service-detail",
        reasonCode: "sku_not_found",
      });
    }

    let quote;
    try {
      const response = await this.#api.getPriceQuote(skuId);
      quote = parsePriceQuote(response.quote, cityCode, skuId);
    } catch (error) {
      if (isHttpStatus(error, 409)) {
        return Object.freeze({
          status: "conflict",
          conflictCode: "quote_version_conflict",
        });
      }
      if (isHttpStatus(error, 404, 501)) {
        this.#cache.delete(key);
        return Object.freeze({
          status: "unavailable",
          capability: "customer.pricing-quote",
          reasonCode: "quote_api_unavailable",
        });
      }
      const cached = this.#cache.get(key);
      if (cached !== undefined && isTransient(error)) {
        return Object.freeze({
          status: "ready",
          detail: createCustomerServiceDetailViewModel(
            catalog,
            match,
            cached.quote,
            "stale",
            "quote_refresh_failed",
          ),
        });
      }
      if (isHttpStatus(error, 503)) {
        return Object.freeze({
          status: "unavailable",
          capability: "customer.pricing-quote",
          reasonCode: "quote_api_unavailable",
        });
      }
      return Object.freeze({
        status: "error",
        errorCode: error instanceof ApiClientError
          ? "quote_load_failed"
          : "quote_response_invalid",
        retryable: retryable(error),
      });
    }

    const detail = createCustomerServiceDetailViewModel(catalog, match, quote);
    this.#cache.set(key, detail);
    return Object.freeze({ status: "ready", detail });
  }
}
