import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type { Order } from "@xlb/types";
import {
  createRefundRequestSchema,
  orderSchema,
  refundRequestSchema,
} from "@xlb/validators";
import type {
  CustomerRefundResult,
  CustomerRefundScope,
} from "./refundTypes.js";

export type CustomerRefundApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "getOrder" | "createRefundRequest"
>;

export type CustomerRefundLoadResult =
  | {
      readonly status: "ready";
      readonly order: Order;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "forbidden_or_not_found";
    }
  | {
      readonly status: "unavailable";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "refund_order_load_failed"
        | "refund_order_response_invalid";
      readonly retryable: boolean;
    };

export type CustomerRefundMutationResult =
  | {
      readonly status: "success";
      readonly refund: CustomerRefundResult;
      readonly idempotent: boolean;
    }
  | {
      readonly status: "validation_error";
    }
  | {
      readonly status: "conflict";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "forbidden_or_not_found";
    }
  | {
      readonly status: "unavailable";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "refund_request_failed"
        | "refund_response_invalid";
      readonly retryable: boolean;
    };

const SAFE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export function isSafeCustomerRefundOrderId(orderId: string): boolean {
  return SAFE_ENTITY_ID.test(orderId);
}

function isRetryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" &&
      (error.status === 408 ||
        error.status === 425 ||
        error.status === 429 ||
        (error.status !== undefined && error.status >= 500)));
}

function loadFailure(error: unknown): Exclude<
  CustomerRefundLoadResult,
  { readonly status: "ready" }
> {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({ status: "forbidden_or_not_found" });
    }
    if (error.kind === "http" && error.status === 501) {
      return Object.freeze({ status: "unavailable" });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "refund_order_response_invalid"
        : "refund_order_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "refund_order_response_invalid",
    retryable: false,
  });
}

function mutationFailure(error: unknown): CustomerRefundMutationResult {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 400) {
      return Object.freeze({ status: "validation_error" });
    }
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({ status: "forbidden_or_not_found" });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({ status: "conflict" });
    }
    if (error.kind === "http" && error.status === 501) {
      return Object.freeze({ status: "unavailable" });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "refund_response_invalid"
        : "refund_request_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "refund_response_invalid",
    retryable: false,
  });
}

export class CustomerRefundCoordinator {
  readonly #api: CustomerRefundApi;

  constructor(api: CustomerRefundApi) {
    this.#api = api;
  }

  async loadOrder(
    scope: CustomerRefundScope,
    orderId: string,
  ): Promise<CustomerRefundLoadResult> {
    if (!isSafeCustomerRefundOrderId(orderId)) {
      return Object.freeze({ status: "forbidden_or_not_found" });
    }
    try {
      const response = await this.#api.getOrder(orderId);
      const parsed = orderSchema.safeParse(response.order);
      if (
        response.ok !== true ||
        !parsed.success ||
        parsed.data.orderId !== orderId ||
        parsed.data.cityCode !== scope.cityCode ||
        parsed.data.customerId !== scope.actorId
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "refund_order_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "ready",
        order: parsed.data as Order,
      });
    } catch (error) {
      return loadFailure(error);
    }
  }

  async createRequest(
    scope: CustomerRefundScope,
    orderId: string,
    reason: string,
  ): Promise<CustomerRefundMutationResult> {
    if (!isSafeCustomerRefundOrderId(orderId)) {
      return Object.freeze({ status: "forbidden_or_not_found" });
    }
    const parsedRequest = createRefundRequestSchema.safeParse({
      orderId,
      reason,
    });
    if (!parsedRequest.success) {
      return Object.freeze({ status: "validation_error" });
    }

    // Full-refund authority stays on the server: amount is intentionally absent.
    const request = Object.freeze({
      orderId: parsedRequest.data.orderId,
      reason: parsedRequest.data.reason ?? "",
    });

    try {
      const response = await this.#api.createRefundRequest(request);
      const parsedRefund = refundRequestSchema.safeParse(response.refund);
      if (
        response.ok !== true ||
        typeof response.idempotent !== "boolean" ||
        !parsedRefund.success ||
        parsedRefund.data.orderId !== orderId ||
        parsedRefund.data.cityCode !== scope.cityCode ||
        parsedRefund.data.customerId !== scope.actorId
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "refund_response_invalid",
          retryable: false,
        });
      }
      const refund = parsedRefund.data;
      return Object.freeze({
        status: "success",
        idempotent: response.idempotent,
        refund: Object.freeze({
          refundId: refund.refundId,
          orderId: refund.orderId,
          amount: refund.amount,
          currency: refund.currency,
          reason: refund.reason,
          status: refund.status,
          requestedAt: refund.requestedAt,
          approvedAt: refund.approvedAt,
        }),
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }
}
