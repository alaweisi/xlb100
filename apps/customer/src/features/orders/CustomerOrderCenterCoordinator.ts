import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CustomerOrderListFilter,
  CustomerOrderSummary,
  KnownCityCode,
} from "@xlb/types";
import { customerOrderListResponseSchema } from "@xlb/validators";

export type CustomerOrderCenterApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "listOrders"
>;

export type CustomerOrderCenterPageLoadResult =
  | {
      readonly status: "ready";
      readonly items: readonly CustomerOrderSummary[];
      readonly nextCursor: string | null;
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "orders_load_failed"
        | "orders_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "orders_snapshot_changed";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.orders";
      readonly reasonCode:
        | "orders_api_unavailable"
        | "orders_scope_unavailable";
    };

function isRetryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" &&
      (error.status === 408 ||
        error.status === 425 ||
        error.status === 429 ||
        (error.status !== undefined && error.status >= 500)));
}

function loadFailure(
  error: unknown,
): Exclude<CustomerOrderCenterPageLoadResult, { readonly status: "ready" }> {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.orders",
        reasonCode: "orders_scope_unavailable",
      });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "orders_snapshot_changed",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 501 || error.status === 503)
    ) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.orders",
        reasonCode: "orders_api_unavailable",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "orders_response_invalid"
        : "orders_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "orders_response_invalid",
    retryable: false,
  });
}

export class CustomerOrderCenterCoordinator {
  readonly #api: CustomerOrderCenterApi;

  constructor(api: CustomerOrderCenterApi) {
    this.#api = api;
  }

  async loadPage(
    cityCode: KnownCityCode,
    filter: CustomerOrderListFilter,
    cursor: string | null = null,
  ): Promise<CustomerOrderCenterPageLoadResult> {
    try {
      const response = customerOrderListResponseSchema.parse(
        await this.#api.listOrders({
          filter,
          limit: 20,
          ...(cursor === null ? {} : { cursor }),
        }),
      );
      if (response.items.some((item) => item.cityCode !== cityCode)) {
        return Object.freeze({
          status: "error",
          errorCode: "orders_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "ready",
        items: Object.freeze([...response.items]),
        nextCursor: response.nextCursor,
      });
    } catch (error) {
      return loadFailure(error);
    }
  }
}
