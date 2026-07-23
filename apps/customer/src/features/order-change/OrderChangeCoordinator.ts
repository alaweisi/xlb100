import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  Order,
  OrderReverseRequest,
  OrderReverseType,
  ScheduledTimeSlot,
} from "@xlb/types";
import {
  createOrderReverseRequestSchema,
  orderReverseRequestSchema,
  orderSchema,
} from "@xlb/validators";
import type {
  CustomerOrderChangeAggregate,
} from "./orderChangeTypes.js";

export type CustomerOrderChangeApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "getOrder" | "listOrderReverseRequests" | "createOrderReverseRequest"
>;

export type CustomerOrderChangeLoadResult =
  | {
      readonly status: "ready";
      readonly aggregate: CustomerOrderChangeAggregate;
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
        | "order_change_load_failed"
        | "order_change_response_invalid";
      readonly retryable: boolean;
    };

export type CustomerOrderChangeMutationResult =
  | {
      readonly status: "success";
      readonly idempotent: boolean;
      readonly reverseRequest: OrderReverseRequest;
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
        | "order_change_submit_failed"
        | "order_change_response_invalid";
      readonly retryable: boolean;
    };

export interface CreateOrderChangeInput {
  readonly reverseType: OrderReverseType;
  readonly reason: string;
  readonly requestedScheduledAt?: string;
  readonly requestedTimeSlot?: ScheduledTimeSlot;
  readonly idempotencyKey: string;
}

const SAFE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

function retryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" &&
      (error.status === 408 ||
        error.status === 425 ||
        error.status === 429 ||
        (error.status !== undefined && error.status >= 500)));
}

function loadFailure(error: unknown): Exclude<
  CustomerOrderChangeLoadResult,
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
        ? "order_change_response_invalid"
        : "order_change_load_failed",
      retryable: retryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "order_change_response_invalid",
    retryable: false,
  });
}

function mutationFailure(error: unknown): CustomerOrderChangeMutationResult {
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
        ? "order_change_response_invalid"
        : "order_change_submit_failed",
      retryable: retryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "order_change_response_invalid",
    retryable: false,
  });
}

export class CustomerOrderChangeCoordinator {
  readonly #api: CustomerOrderChangeApi;

  constructor(api: CustomerOrderChangeApi) {
    this.#api = api;
  }

  async load(orderId: string): Promise<CustomerOrderChangeLoadResult> {
    if (!SAFE_ENTITY_ID.test(orderId)) {
      return Object.freeze({ status: "forbidden_or_not_found" });
    }
    try {
      const [orderResponse, reverseResponse] = await Promise.all([
        this.#api.getOrder(orderId),
        this.#api.listOrderReverseRequests(orderId),
      ]);
      const parsedOrder = orderSchema.safeParse(orderResponse.order);
      const parsedReverse = orderReverseRequestSchema.array().safeParse(
        reverseResponse.reverseRequests,
      );
      if (
        orderResponse.ok !== true ||
        reverseResponse.ok !== true ||
        !parsedOrder.success ||
        !parsedReverse.success ||
        parsedOrder.data.orderId !== orderId ||
        parsedReverse.data.some((item) =>
          item.orderId !== orderId ||
          item.cityCode !== parsedOrder.data.cityCode
        )
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "order_change_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "ready",
        aggregate: Object.freeze({
          order: parsedOrder.data as Order,
          reverseRequests: Object.freeze(
            [...parsedReverse.data] as OrderReverseRequest[],
          ),
        }),
      });
    } catch (error) {
      return loadFailure(error);
    }
  }

  async create(
    orderId: string,
    input: CreateOrderChangeInput,
  ): Promise<CustomerOrderChangeMutationResult> {
    if (!SAFE_ENTITY_ID.test(orderId)) {
      return Object.freeze({ status: "forbidden_or_not_found" });
    }
    const request = createOrderReverseRequestSchema.safeParse(input);
    if (!request.success) {
      return Object.freeze({ status: "validation_error" });
    }
    try {
      const response = await this.#api.createOrderReverseRequest(
        orderId,
        request.data,
      );
      const parsed = orderReverseRequestSchema.safeParse(
        response.reverseRequest,
      );
      if (
        response.ok !== true ||
        typeof response.idempotent !== "boolean" ||
        !parsed.success ||
        parsed.data.orderId !== orderId
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "order_change_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        idempotent: response.idempotent,
        reverseRequest: parsed.data as OrderReverseRequest,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }
}
