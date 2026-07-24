import {
  ApiClientError,
  type customerApi,
  validateCustomerOrderReviewResponse,
} from "@xlb/api-client";
import type {
  CustomerOrderReviewView,
  OrderReview,
  ReviewAppeal,
} from "@xlb/types";
import {
  createOrderReviewSchema,
  createReviewAppealRequestSchema,
  orderReviewSchema,
  withdrawReviewAppealRequestSchema,
} from "@xlb/validators";

export type CustomerReviewApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  | "getOrderReview"
  | "createOrderReview"
  | "createReviewAppeal"
  | "withdrawReviewAppeal"
>;

export type CustomerReviewLoadResult =
  | {
      readonly status: "ready";
      readonly review: CustomerOrderReviewView | null;
    }
  | {
      readonly status: "safe_not_found";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.review";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "review_load_failed"
        | "review_response_invalid";
      readonly retryable: boolean;
    };

export type CustomerReviewMutationResult =
  | {
      readonly status: "success";
      readonly idempotent: boolean;
      readonly review?: OrderReview;
      readonly appeal?: ReviewAppeal;
    }
  | {
      readonly status: "validation_error";
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "review_changed";
    }
  | {
      readonly status: "safe_not_found";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.review";
    }
  | {
      readonly status: "error";
      readonly errorCode: "review_mutation_failed" | "review_response_invalid";
      readonly retryable: boolean;
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

function loadFailure(error: unknown): Exclude<
  CustomerReviewLoadResult,
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
      return Object.freeze({ status: "safe_not_found" });
    }
    if (error.kind === "http" && error.status === 501) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.review",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "review_response_invalid"
        : "review_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "review_response_invalid",
    retryable: false,
  });
}

function mutationFailure(error: unknown): CustomerReviewMutationResult {
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
      return Object.freeze({ status: "safe_not_found" });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "review_changed",
      });
    }
    if (error.kind === "http" && error.status === 501) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.review",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "review_response_invalid"
        : "review_mutation_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "review_response_invalid",
    retryable: false,
  });
}

function validMutationEnvelope(
  value: unknown,
): value is {
  readonly ok: true;
  readonly idempotent: boolean;
} {
  return typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === true &&
    typeof (value as { idempotent?: unknown }).idempotent === "boolean";
}

export class CustomerReviewCoordinator {
  readonly #api: CustomerReviewApi;

  constructor(api: CustomerReviewApi) {
    this.#api = api;
  }

  async load(orderId: string): Promise<CustomerReviewLoadResult> {
    try {
      const response = validateCustomerOrderReviewResponse(
        await this.#api.getOrderReview(orderId),
      );
      return Object.freeze({
        status: "ready",
        review: response.review,
      });
    } catch (error) {
      return loadFailure(error);
    }
  }

  async createReview(
    orderId: string,
    rating: number,
    comment: string,
  ): Promise<CustomerReviewMutationResult> {
    const request = createOrderReviewSchema.safeParse({ rating, comment });
    if (!request.success) {
      return Object.freeze({ status: "validation_error" });
    }
    try {
      const response = await this.#api.createOrderReview({
        orderId,
        ...request.data,
      });
      if (
        !validMutationEnvelope(response) ||
        !orderReviewSchema.safeParse(response.review).success
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "review_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        idempotent: response.idempotent,
        review: response.review,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async createAppeal(
    reviewId: string,
    moderationVersion: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<CustomerReviewMutationResult> {
    const request = createReviewAppealRequestSchema.safeParse({
      moderationVersion,
      reason,
      idempotencyKey,
    });
    if (!request.success) {
      return Object.freeze({ status: "validation_error" });
    }
    try {
      const response = await this.#api.createReviewAppeal(
        reviewId,
        request.data,
      );
      if (!validMutationEnvelope(response)) {
        return Object.freeze({
          status: "error",
          errorCode: "review_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        idempotent: response.idempotent,
        appeal: response.appeal,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async withdrawAppeal(
    reviewId: string,
    moderationVersion: number,
    idempotencyKey: string,
  ): Promise<CustomerReviewMutationResult> {
    const request = withdrawReviewAppealRequestSchema.safeParse({
      moderationVersion,
      idempotencyKey,
    });
    if (!request.success) {
      return Object.freeze({ status: "validation_error" });
    }
    try {
      const response = await this.#api.withdrawReviewAppeal(
        reviewId,
        request.data,
      );
      if (!validMutationEnvelope(response)) {
        return Object.freeze({
          status: "error",
          errorCode: "review_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        idempotent: response.idempotent,
        appeal: response.appeal,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }
}
