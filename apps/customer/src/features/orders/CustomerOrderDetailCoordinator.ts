import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CustomerOrderReviewView,
  FulfillmentCustomerConfirmation,
  FulfillmentEvidenceAggregate,
  Order,
  ReviewAppeal,
  ReviewVisibilityState,
} from "@xlb/types";
import {
  aftersaleComplaintSchema,
  decideFulfillmentConfirmationRequestSchema,
  fulfillmentEvidenceSchema,
  orderReverseRequestSchema,
  orderReviewSchema,
  orderSchema,
} from "@xlb/validators";
import type {
  CustomerOrderDetailAggregate,
  CustomerOrderDetailDependency,
  CustomerOrderDetailResource,
  CustomerOrderDetailScope,
} from "./CustomerOrderDetailTypes.js";

export type CustomerOrderDetailApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  | "getOrder"
  | "getOrderFulfillmentEvidence"
  | "listOrderReverseRequests"
  | "listAftersaleComplaints"
  | "getOrderReview"
  | "decideFulfillmentConfirmation"
  | "confirmService"
>;

export type CustomerOrderDetailLoadResult =
  | {
      readonly status: "ready";
      readonly aggregate: CustomerOrderDetailAggregate;
    }
  | {
      readonly status: "error";
      readonly errorCode: "order_load_failed" | "order_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "order_snapshot_changed";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.order-detail";
      readonly reasonCode: "order_scope_unavailable" | "order_api_unavailable";
    };

export type CustomerOrderDetailMutationResult =
  | {
      readonly status: "confirmed";
      readonly load: CustomerOrderDetailLoadResult;
      readonly idempotent: boolean;
    }
  | {
      readonly status: "conflict";
      readonly load: CustomerOrderDetailLoadResult;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
    }
  | {
      readonly status: "error";
      readonly retryable: boolean;
    };

type Settled<T> = PromiseSettledResult<T>;

function isRetryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" &&
      (error.status === 408 ||
        error.status === 425 ||
        error.status === 429 ||
        (error.status !== undefined && error.status >= 500)));
}

function orderFailure(error: unknown): Exclude<
  CustomerOrderDetailLoadResult,
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
      return Object.freeze({
        status: "unavailable",
        capability: "customer.order-detail",
        reasonCode: "order_scope_unavailable",
      });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "order_snapshot_changed",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 501 || error.status === 503)
    ) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.order-detail",
        reasonCode: "order_api_unavailable",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "order_response_invalid"
        : "order_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "order_response_invalid",
    retryable: false,
  });
}

function dependencyFailure<T>(
  error: unknown,
): CustomerOrderDetailResource<T> | "unauthenticated" | "conflict" {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) return "unauthenticated";
    if (error.kind === "http" && error.status === 409) return "conflict";
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({
        status: "unavailable",
        reasonCode: "dependency_scope_unavailable",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 501 || error.status === 503)
    ) {
      return Object.freeze({
        status: "unavailable",
        reasonCode: "dependency_capability_unavailable",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "dependency_response_invalid"
        : "dependency_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "dependency_response_invalid",
    retryable: false,
  });
}

function validConfirmation(
  value: FulfillmentCustomerConfirmation,
  aggregate: FulfillmentEvidenceAggregate,
  scope: CustomerOrderDetailScope,
  orderId: string,
): boolean {
  return value.cityCode === scope.cityCode &&
    value.customerId === scope.actorId &&
    value.orderId === orderId &&
    value.fulfillmentId === aggregate.fulfillmentId &&
    ["pending", "confirmed", "disputed"].includes(value.status) &&
    (value.status === "disputed"
      ? value.complaintId !== null
      : value.complaintId === null);
}

function parseEvidence(
  value: Awaited<ReturnType<CustomerOrderDetailApi["getOrderFulfillmentEvidence"]>>,
  scope: CustomerOrderDetailScope,
  orderId: string,
): CustomerOrderDetailResource<readonly FulfillmentEvidenceAggregate[]> {
  if (value.ok !== true || !Array.isArray(value.aggregates)) {
    throw new TypeError("fulfillment evidence response is invalid");
  }
  if (value.aggregates.length === 0) {
    return Object.freeze({ status: "empty" });
  }
  for (const aggregate of value.aggregates) {
    if (
      aggregate.cityCode !== scope.cityCode ||
      aggregate.orderId !== orderId ||
      !Array.isArray(aggregate.evidence) ||
      aggregate.evidence.some((item) =>
        !fulfillmentEvidenceSchema.safeParse(item).success ||
        item.cityCode !== scope.cityCode ||
        item.orderId !== orderId ||
        item.fulfillmentId !== aggregate.fulfillmentId ||
        item.mediaAsset.cityCode !== scope.cityCode ||
        item.mediaAsset.orderId !== orderId ||
        item.mediaAsset.fulfillmentId !== aggregate.fulfillmentId
      ) ||
      (aggregate.confirmation !== null &&
        !validConfirmation(aggregate.confirmation, aggregate, scope, orderId))
    ) {
      throw new TypeError("fulfillment evidence scope is invalid");
    }
  }
  return Object.freeze({
    status: "ready",
    data: Object.freeze([...value.aggregates]),
  });
}

function parseReverses(
  value: Awaited<ReturnType<CustomerOrderDetailApi["listOrderReverseRequests"]>>,
  scope: CustomerOrderDetailScope,
  orderId: string,
): CustomerOrderDetailAggregate["reverses"] {
  if (value.ok !== true || !Array.isArray(value.reverseRequests)) {
    throw new TypeError("reverse response is invalid");
  }
  const parsed = value.reverseRequests.map((item) =>
    orderReverseRequestSchema.parse(item)
  );
  if (parsed.some((item) =>
    item.cityCode !== scope.cityCode ||
    item.customerId !== scope.actorId ||
    item.orderId !== orderId
  )) {
    throw new TypeError("reverse scope is invalid");
  }
  return parsed.length === 0
    ? Object.freeze({ status: "empty" })
    : Object.freeze({
      status: "ready",
      data: Object.freeze([...value.reverseRequests]),
    });
}

function parseComplaints(
  value: Awaited<ReturnType<CustomerOrderDetailApi["listAftersaleComplaints"]>>,
  scope: CustomerOrderDetailScope,
  orderId: string,
): CustomerOrderDetailAggregate["complaints"] {
  if (value.ok !== true || !Array.isArray(value.complaints)) {
    throw new TypeError("complaint response is invalid");
  }
  const parsed = value.complaints.map((item) =>
    aftersaleComplaintSchema.parse(item)
  );
  if (parsed.some((item) =>
    item.cityCode !== scope.cityCode ||
    item.customerId !== scope.actorId ||
    item.orderId !== orderId
  )) {
    throw new TypeError("complaint scope is invalid");
  }
  return parsed.length === 0
    ? Object.freeze({ status: "empty" })
    : Object.freeze({
      status: "ready",
      data: Object.freeze([...value.complaints]),
    });
}

function validReviewVisibility(
  value: ReviewVisibilityState,
  reviewId: string,
): boolean {
  return value.reviewId === reviewId &&
    ["pending_moderation", "visible", "hidden"].includes(value.visibility) &&
    Number.isSafeInteger(value.version) &&
    value.version > 0 &&
    Number.isSafeInteger(value.moderationVersion) &&
    value.moderationVersion >= 0;
}

function validReviewAppeal(value: ReviewAppeal, reviewId: string): boolean {
  return value.reviewId === reviewId &&
    value.subjectType === "customer" &&
    ["open", "upheld", "rejected", "withdrawn"].includes(value.status);
}

function parseReview(
  value: Awaited<ReturnType<CustomerOrderDetailApi["getOrderReview"]>>,
  scope: CustomerOrderDetailScope,
  orderId: string,
): CustomerOrderDetailAggregate["review"] {
  if (value.ok !== true) throw new TypeError("review response is invalid");
  if (value.review === null) return Object.freeze({ status: "empty" });
  const review: CustomerOrderReviewView = value.review;
  const parsed = orderReviewSchema.parse(review.review);
  if (
    parsed.cityCode !== scope.cityCode ||
    parsed.customerId !== scope.actorId ||
    parsed.orderId !== orderId ||
    !validReviewVisibility(review.visibility, parsed.reviewId) ||
    !Array.isArray(review.appeals) ||
    review.appeals.some((appeal) =>
      !validReviewAppeal(appeal, parsed.reviewId)
    )
  ) {
    throw new TypeError("review scope is invalid");
  }
  return Object.freeze({ status: "ready", data: review });
}

function parseDependency<T>(
  settled: Settled<unknown>,
  parse: (value: never) => CustomerOrderDetailResource<T>,
): CustomerOrderDetailResource<T> | "unauthenticated" | "conflict" {
  if (settled.status === "rejected") {
    return dependencyFailure(settled.reason);
  }
  try {
    return parse(settled.value as never);
  } catch {
    return Object.freeze({
      status: "error",
      errorCode: "dependency_response_invalid",
      retryable: false,
    });
  }
}

function mutationFailure(error: unknown): Exclude<
  CustomerOrderDetailMutationResult,
  { readonly status: "confirmed" | "conflict" }
> | "conflict" {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({ status: "unavailable" });
    }
    if (error.kind === "http" && error.status === 409) return "conflict";
    return Object.freeze({
      status: "error",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({ status: "error", retryable: false });
}

export class CustomerOrderDetailCoordinator {
  readonly #api: CustomerOrderDetailApi;
  readonly #now: () => Date;

  constructor(
    api: CustomerOrderDetailApi,
    now: () => Date = () => new Date(),
  ) {
    this.#api = api;
    this.#now = now;
  }

  async loadAggregate(
    scope: CustomerOrderDetailScope,
    orderId: string,
  ): Promise<CustomerOrderDetailLoadResult> {
    const [orderResult, evidenceResult, reverseResult, complaintResult, reviewResult] =
      await Promise.allSettled([
        this.#api.getOrder(orderId),
        this.#api.getOrderFulfillmentEvidence(orderId),
        this.#api.listOrderReverseRequests(orderId),
        this.#api.listAftersaleComplaints(orderId),
        this.#api.getOrderReview(orderId),
      ]);

    if (orderResult.status === "rejected") {
      return orderFailure(orderResult.reason);
    }

    let order: Order;
    try {
      order = orderSchema.parse(orderResult.value.order) as Order;
      if (
        orderResult.value.ok !== true ||
        order.orderId !== orderId ||
        order.cityCode !== scope.cityCode ||
        order.customerId !== scope.actorId
      ) {
        throw new TypeError("order scope is invalid");
      }
    } catch {
      return Object.freeze({
        status: "error",
        errorCode: "order_response_invalid",
        retryable: false,
      });
    }

    const dependencies = {
      evidence: parseDependency(evidenceResult, (value) =>
        parseEvidence(value, scope, orderId)),
      reverses: parseDependency(reverseResult, (value) =>
        parseReverses(value, scope, orderId)),
      complaints: parseDependency(complaintResult, (value) =>
        parseComplaints(value, scope, orderId)),
      review: parseDependency(reviewResult, (value) =>
        parseReview(value, scope, orderId)),
    } satisfies Record<
      CustomerOrderDetailDependency,
      CustomerOrderDetailResource<unknown> | "unauthenticated" | "conflict"
    >;

    if (Object.values(dependencies).includes("unauthenticated")) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (Object.values(dependencies).includes("conflict")) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "order_snapshot_changed",
      });
    }

    const evidence = dependencies.evidence as CustomerOrderDetailAggregate["evidence"];
    const confirmations: CustomerOrderDetailAggregate["confirmations"] =
      evidence.status === "ready"
        ? (() => {
          const data = evidence.data.flatMap((item) =>
            item.confirmation === null ? [] : [item.confirmation]
          );
          return data.length === 0
            ? Object.freeze({ status: "empty" as const })
            : Object.freeze({
              status: "ready" as const,
              data: Object.freeze(data),
            });
        })()
        : evidence;
    const reverses = dependencies.reverses as CustomerOrderDetailAggregate["reverses"];
    const complaints = dependencies.complaints as CustomerOrderDetailAggregate["complaints"];
    const review = dependencies.review as CustomerOrderDetailAggregate["review"];
    const partial = [evidence, confirmations, reverses, complaints, review]
      .some((resource) =>
        resource.status === "error" || resource.status === "unavailable"
      );

    return Object.freeze({
      status: "ready",
      aggregate: Object.freeze({
        order,
        evidence,
        confirmations,
        reverses,
        complaints,
        review,
        partial,
        refreshedAt: this.#now().toISOString(),
      }),
    });
  }

  async decideConfirmation(
    scope: CustomerOrderDetailScope,
    orderId: string,
    fulfillmentId: string,
    input: unknown,
  ): Promise<CustomerOrderDetailMutationResult> {
    const parsed = decideFulfillmentConfirmationRequestSchema.safeParse(input);
    if (!parsed.success) {
      return Object.freeze({ status: "error", retryable: false });
    }
    try {
      const response = await this.#api.decideFulfillmentConfirmation(
        fulfillmentId,
        parsed.data,
      );
      return Object.freeze({
        status: "confirmed",
        idempotent: response.idempotent,
        load: await this.loadAggregate(scope, orderId),
      });
    } catch (error) {
      const failure = mutationFailure(error);
      if (failure === "conflict") {
        return Object.freeze({
          status: "conflict",
          load: await this.loadAggregate(scope, orderId),
        });
      }
      return failure;
    }
  }

  async confirmService(
    scope: CustomerOrderDetailScope,
    orderId: string,
  ): Promise<CustomerOrderDetailMutationResult> {
    try {
      await this.#api.confirmService(orderId);
      return Object.freeze({
        status: "confirmed",
        idempotent: false,
        load: await this.loadAggregate(scope, orderId),
      });
    } catch (error) {
      const failure = mutationFailure(error);
      if (failure === "conflict") {
        return Object.freeze({
          status: "conflict",
          load: await this.loadAggregate(scope, orderId),
        });
      }
      return failure;
    }
  }
}
