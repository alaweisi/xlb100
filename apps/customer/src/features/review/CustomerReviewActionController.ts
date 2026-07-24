import type { CustomerOrderReviewView } from "@xlb/types";
import {
  createOrderReviewSchema,
  createReviewAppealRequestSchema,
  withdrawReviewAppealRequestSchema,
} from "@xlb/validators";
import {
  CustomerReviewCoordinator,
  type CustomerReviewMutationResult,
} from "./CustomerReviewCoordinator.js";
import {
  currentCustomerOpenAppeal,
  type CustomerReviewFieldErrors,
} from "./reviewTypes.js";

export interface CustomerReviewNavigation {
  back(): void;
  login(): void;
  openAppeal(reviewId: string, orderId: string): void;
}

export type CustomerReviewActionResult =
  | CustomerReviewMutationResult
  | {
      readonly status: "validation_error";
      readonly errors: CustomerReviewFieldErrors;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "request_in_flight" | "review_changed";
    };

function idempotencyKey(action: "appeal" | "withdraw"): string {
  const suffix = typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-review-${action}-${suffix}`;
}

function reviewFieldErrors(
  rating: number | null,
  comment: string,
): CustomerReviewFieldErrors {
  const errors: {
    rating?: string;
    comment?: string;
  } = {};
  if (!Number.isInteger(rating) || rating === null || rating < 1 || rating > 5) {
    errors.rating = "请选择 1 至 5 星。";
  }
  const trimmed = comment.trim();
  if (trimmed.length === 0) {
    errors.comment = "请填写评价内容。";
  } else if (trimmed.length > 500) {
    errors.comment = "评价内容不能超过 500 字。";
  }
  return Object.freeze(errors);
}

export class CustomerReviewActionController {
  readonly #coordinator: CustomerReviewCoordinator;
  readonly #navigation: CustomerReviewNavigation;
  #mutationInFlight = false;

  constructor(
    coordinator: CustomerReviewCoordinator,
    navigation: CustomerReviewNavigation,
  ) {
    this.#coordinator = coordinator;
    this.#navigation = navigation;
  }

  back(): void {
    this.#navigation.back();
  }

  login(): void {
    this.#navigation.login();
  }

  openAppeal(view: CustomerOrderReviewView): void {
    this.#navigation.openAppeal(view.review.reviewId, view.review.orderId);
  }

  async createReview(
    orderId: string,
    rating: number | null,
    comment: string,
  ): Promise<CustomerReviewActionResult> {
    const parsed = createOrderReviewSchema.safeParse({ rating, comment });
    if (!parsed.success) {
      return Object.freeze({
        status: "validation_error",
        errors: reviewFieldErrors(rating, comment),
      });
    }
    if (this.#mutationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    this.#mutationInFlight = true;
    try {
      return await this.#coordinator.createReview(
        orderId,
        parsed.data.rating,
        parsed.data.comment,
      );
    } finally {
      this.#mutationInFlight = false;
    }
  }

  async createAppeal(
    routeReviewId: string,
    view: CustomerOrderReviewView,
    reason: string,
  ): Promise<CustomerReviewActionResult> {
    if (
      routeReviewId !== view.review.reviewId ||
      view.visibility.visibility === "pending_moderation" ||
      view.visibility.visibility !== "hidden" ||
      currentCustomerOpenAppeal(view) !== null
    ) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "review_changed",
      });
    }
    const request = createReviewAppealRequestSchema.safeParse({
      moderationVersion: view.visibility.moderationVersion,
      reason,
      idempotencyKey: idempotencyKey("appeal"),
    });
    if (!request.success) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({
          appealReason: reason.trim().length === 0
            ? "请填写申诉原因。"
            : "申诉原因不能超过 1000 字。",
        }),
      });
    }
    if (this.#mutationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    this.#mutationInFlight = true;
    try {
      return await this.#coordinator.createAppeal(
        routeReviewId,
        request.data.moderationVersion,
        request.data.reason,
        request.data.idempotencyKey,
      );
    } finally {
      this.#mutationInFlight = false;
    }
  }

  async withdrawAppeal(
    routeReviewId: string,
    view: CustomerOrderReviewView,
  ): Promise<CustomerReviewActionResult> {
    const openAppeal = currentCustomerOpenAppeal(view);
    if (
      routeReviewId !== view.review.reviewId ||
      openAppeal === null ||
      openAppeal.moderationVersion !== view.visibility.moderationVersion
    ) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "review_changed",
      });
    }
    const request = withdrawReviewAppealRequestSchema.safeParse({
      moderationVersion: openAppeal.moderationVersion,
      idempotencyKey: idempotencyKey("withdraw"),
    });
    if (!request.success) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "review_changed",
      });
    }
    if (this.#mutationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    this.#mutationInFlight = true;
    try {
      return await this.#coordinator.withdrawAppeal(
        routeReviewId,
        request.data.moderationVersion,
        request.data.idempotencyKey,
      );
    } finally {
      this.#mutationInFlight = false;
    }
  }
}
