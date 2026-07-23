import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  CustomerAddress,
  Order,
  PriceQuote,
} from "@xlb/types";
import {
  orderSchema,
  priceQuoteSchema,
  pricingQuoteQuerySchema,
} from "@xlb/validators";
import {
  createCustomerServiceDetailViewModel,
  findEnabledCatalogSku,
  type CustomerServiceDetailViewModel,
} from "../service/serviceDetail.js";
import { parseCatalogSnapshot } from "../service/ServiceDiscoveryCoordinator.js";

export type CustomerCheckoutApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "getCatalog" | "getPriceQuote" | "listAddresses" | "createOrder"
>;

export interface CustomerCheckoutReadyFacts {
  readonly service: CustomerServiceDetailViewModel;
  readonly addresses: readonly CustomerAddress[];
}

export type CustomerCheckoutLoadResult =
  | {
      readonly status: "ready";
      readonly facts: CustomerCheckoutReadyFacts;
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "checkout_load_failed"
        | "catalog_response_invalid"
        | "quote_response_invalid"
        | "addresses_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "conflict";
      readonly conflictCode: "quote_version_conflict" | "address_city_mismatch";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.catalog" | "customer.pricing-quote" | "customer.addresses";
      readonly reasonCode:
        | "catalog_api_unavailable"
        | "catalog_city_mismatch"
        | "sku_not_found"
        | "quote_api_unavailable"
        | "addresses_api_unavailable";
    };

export type CustomerCheckoutQuoteResult =
  | {
      readonly status: "ready";
      readonly quote: PriceQuote;
    }
  | Exclude<CustomerCheckoutLoadResult, { readonly status: "ready" }>;

export type CustomerCheckoutAddressResult =
  | {
      readonly status: "ready";
      readonly addresses: readonly CustomerAddress[];
    }
  | Exclude<CustomerCheckoutLoadResult, { readonly status: "ready" }>;

export type CustomerCheckoutCreateResult =
  | {
      readonly status: "success";
      readonly order: Order;
    }
  | {
      readonly status: "error";
      readonly errorCode: "order_create_failed" | "order_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "conflict";
      readonly conflictCode: "order_facts_changed";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.orders";
    };

type CustomerCheckoutReadBoundary = Exclude<
  CustomerCheckoutLoadResult,
  { readonly status: "ready" }
>;

function isHttpStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof ApiClientError &&
    error.kind === "http" &&
    error.status !== undefined &&
    statuses.includes(error.status);
}

function isRetryable(error: unknown): boolean {
  return error instanceof ApiClientError && (
    error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" && (
      error.status === 408 ||
      error.status === 425 ||
      error.status === 429 ||
      (error.status !== undefined && error.status >= 500)
    ))
  );
}

function unavailableForRead(
  error: unknown,
  capability: "customer.catalog" | "customer.pricing-quote" | "customer.addresses",
  reasonCode:
    | "catalog_api_unavailable"
    | "quote_api_unavailable"
    | "addresses_api_unavailable",
): CustomerCheckoutReadBoundary | null {
  if (isHttpStatus(error, 401)) {
    return Object.freeze({ status: "unauthenticated" });
  }
  if (isHttpStatus(error, 404, 501, 503)) {
    return Object.freeze({ status: "unavailable", capability, reasonCode });
  }
  return null;
}

function parseQuote(input: unknown, cityCode: CityCode, skuId: string): PriceQuote {
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
    quote.breakdown.feeItems.some((fee) =>
      fee.cityCode !== cityCode ||
      fee.skuId !== skuId ||
      fee.priceRuleId !== quote.priceRuleId)
  ) {
    throw new Error("Checkout quote does not match the verified city-scoped SKU");
  }
  return quote;
}

function validAddress(input: unknown): input is CustomerAddress {
  if (typeof input !== "object" || input === null) return false;
  const address = input as Partial<CustomerAddress>;
  return [
    address.addressId,
    address.customerId,
    address.cityCode,
    address.contactName,
    address.contactPhoneMasked,
    address.province,
    address.city,
    address.district,
    address.detailAddress,
    address.createdAt,
    address.updatedAt,
  ].every((value) => typeof value === "string") &&
    typeof address.isDefault === "boolean";
}

export class CheckoutCoordinator {
  readonly #api: CustomerCheckoutApi;

  constructor(api: CustomerCheckoutApi) {
    this.#api = api;
  }

  async loadAddresses(cityCode: CityCode): Promise<CustomerCheckoutAddressResult> {
    try {
      const response = await this.#api.listAddresses();
      if (
        !Array.isArray(response.addresses) ||
        !response.addresses.every(validAddress)
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "addresses_response_invalid",
          retryable: false,
        });
      }
      if (response.addresses.some((address) => address.cityCode !== cityCode)) {
        return Object.freeze({
          status: "conflict",
          conflictCode: "address_city_mismatch",
        });
      }
      return Object.freeze({
        status: "ready",
        addresses: Object.freeze([...response.addresses]),
      });
    } catch (error) {
      const unavailable = unavailableForRead(
        error,
        "customer.addresses",
        "addresses_api_unavailable",
      );
      if (unavailable !== null) return unavailable;
      return Object.freeze({
        status: "error",
        errorCode: "checkout_load_failed",
        retryable: isRetryable(error),
      });
    }
  }

  async refreshQuote(
    cityCode: CityCode,
    requestedSkuId: string,
  ): Promise<CustomerCheckoutQuoteResult> {
    const query = pricingQuoteQuerySchema.safeParse({ skuId: requestedSkuId });
    if (!query.success || query.data.skuId !== requestedSkuId.trim()) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: "sku_not_found",
      });
    }
    try {
      const response = await this.#api.getPriceQuote(query.data.skuId);
      return Object.freeze({
        status: "ready",
        quote: parseQuote(response.quote, cityCode, query.data.skuId),
      });
    } catch (error) {
      if (isHttpStatus(error, 409)) {
        return Object.freeze({
          status: "conflict",
          conflictCode: "quote_version_conflict",
        });
      }
      const unavailable = unavailableForRead(
        error,
        "customer.pricing-quote",
        "quote_api_unavailable",
      );
      if (unavailable !== null) return unavailable;
      return Object.freeze({
        status: "error",
        errorCode: error instanceof ApiClientError
          ? "checkout_load_failed"
          : "quote_response_invalid",
        retryable: isRetryable(error),
      });
    }
  }

  async load(
    cityCode: CityCode,
    requestedSkuId: string,
  ): Promise<CustomerCheckoutLoadResult> {
    const query = pricingQuoteQuerySchema.safeParse({ skuId: requestedSkuId });
    if (!query.success || query.data.skuId !== requestedSkuId.trim()) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: "sku_not_found",
      });
    }
    const skuId = query.data.skuId;

    let catalog;
    try {
      const response = await this.#api.getCatalog();
      catalog = parseCatalogSnapshot(response.catalog);
    } catch (error) {
      const unavailable = unavailableForRead(
        error,
        "customer.catalog",
        "catalog_api_unavailable",
      );
      if (unavailable !== null) return unavailable;
      return Object.freeze({
        status: "error",
        errorCode: error instanceof ApiClientError
          ? "checkout_load_failed"
          : "catalog_response_invalid",
        retryable: isRetryable(error),
      });
    }

    if (catalog.cityCode !== cityCode) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: "catalog_city_mismatch",
      });
    }
    const match = findEnabledCatalogSku(catalog, skuId);
    if (match === null) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: "sku_not_found",
      });
    }

    const quoteResult = await this.refreshQuote(cityCode, skuId);
    if (quoteResult.status !== "ready") return quoteResult;
    const addressesResult = await this.loadAddresses(cityCode);
    if (addressesResult.status !== "ready") return addressesResult;

    return Object.freeze({
      status: "ready",
      facts: Object.freeze({
        service: createCustomerServiceDetailViewModel(
          catalog,
          match,
          quoteResult.quote,
        ),
        addresses: addressesResult.addresses,
      }),
    });
  }

  async createOrder(
    cityCode: CityCode,
    verifiedSkuId: string,
    body: Parameters<CustomerCheckoutApi["createOrder"]>[0],
  ): Promise<CustomerCheckoutCreateResult> {
    try {
      const response = await this.#api.createOrder(body);
      const order = orderSchema.parse(response.order) as Order;
      if (order.cityCode !== cityCode || order.skuId !== verifiedSkuId) {
        return Object.freeze({
          status: "conflict",
          conflictCode: "order_facts_changed",
        });
      }
      return Object.freeze({ status: "success", order });
    } catch (error) {
      if (isHttpStatus(error, 401)) {
        return Object.freeze({ status: "unauthenticated" });
      }
      if (isHttpStatus(error, 409)) {
        return Object.freeze({
          status: "conflict",
          conflictCode: "order_facts_changed",
        });
      }
      if (isHttpStatus(error, 404, 501, 503)) {
        return Object.freeze({
          status: "unavailable",
          capability: "customer.orders",
        });
      }
      return Object.freeze({
        status: "error",
        errorCode: error instanceof ApiClientError
          ? "order_create_failed"
          : "order_response_invalid",
        retryable: isRetryable(error),
      });
    }
  }
}
