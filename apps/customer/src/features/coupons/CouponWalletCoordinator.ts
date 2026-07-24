import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  CouponGrant,
  IssueMarketingDiscountDecisionRequest,
  MarketingDiscountDecision,
} from "@xlb/types";
import {
  couponGrantListResponseSchema,
  issueMarketingDiscountDecisionRequestSchema,
  marketingDiscountDecisionResponseSchema,
} from "@xlb/validators";

export type CustomerCouponApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "listCouponGrants" | "issueDiscountDecision"
>;

export type CouponWalletLoadResult =
  | {
      readonly status: "ready";
      readonly grants: readonly CouponGrant[];
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.coupons";
      readonly reasonCode: "coupons_api_unavailable" | "coupons_forbidden";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "coupon_grants_load_failed"
        | "coupon_grants_response_invalid";
      readonly retryable: boolean;
    };

export type CouponDecisionResult =
  | {
      readonly status: "decided";
      readonly decision: MarketingDiscountDecision;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "coupon_decision_conflict" | "request_in_flight";
    }
  | {
      readonly status: "not_found";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.coupon-decision";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "coupon_decision_failed"
        | "coupon_decision_response_invalid";
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
  CouponWalletLoadResult,
  { readonly status: "ready" }
> {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (error.kind === "http" && error.status === 403) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.coupons",
        reasonCode: "coupons_forbidden",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 404 || error.status === 501 || error.status === 503)
    ) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.coupons",
        reasonCode: "coupons_api_unavailable",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "coupon_grants_response_invalid"
        : "coupon_grants_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "coupon_grants_response_invalid",
    retryable: false,
  });
}

function decisionFailure(error: unknown): CouponDecisionResult {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "coupon_decision_conflict",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({ status: "not_found" });
    }
    if (
      error.kind === "http" &&
      (error.status === 501 || error.status === 503)
    ) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.coupon-decision",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "coupon_decision_response_invalid"
        : "coupon_decision_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "coupon_decision_response_invalid",
    retryable: false,
  });
}

export class CouponWalletCoordinator {
  readonly #api: CustomerCouponApi;

  constructor(api: CustomerCouponApi) {
    this.#api = api;
  }

  async load(cityCode: CityCode): Promise<CouponWalletLoadResult> {
    try {
      const response = couponGrantListResponseSchema.parse(
        await this.#api.listCouponGrants(),
      );
      if (response.couponGrants.some((grant) => grant.cityCode !== cityCode)) {
        return Object.freeze({
          status: "error",
          errorCode: "coupon_grants_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "ready",
        grants: Object.freeze([...response.couponGrants]),
      });
    } catch (error) {
      return loadFailure(error);
    }
  }

  async issueDecision(
    input: IssueMarketingDiscountDecisionRequest,
  ): Promise<CouponDecisionResult> {
    const parsed = issueMarketingDiscountDecisionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return Object.freeze({
        status: "error",
        errorCode: "coupon_decision_response_invalid",
        retryable: false,
      });
    }
    try {
      const response = marketingDiscountDecisionResponseSchema.parse(
        await this.#api.issueDiscountDecision(parsed.data),
      );
      if (
        response.discountDecision.skuId !== parsed.data.skuId ||
        response.discountDecision.quantity !== parsed.data.quantity ||
        response.discountDecision.couponGrantId !==
          parsed.data.selectedCouponGrantId
      ) {
        return Object.freeze({
          status: "conflict",
          reasonCode: "coupon_decision_conflict",
        });
      }
      return Object.freeze({
        status: "decided",
        decision: response.discountDecision,
      });
    } catch (error) {
      return decisionFailure(error);
    }
  }
}
