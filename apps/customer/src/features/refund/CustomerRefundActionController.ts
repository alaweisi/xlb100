import type { Order } from "@xlb/types";
import { createRefundRequestSchema } from "@xlb/validators";
import {
  CustomerRefundCoordinator,
  type CustomerRefundMutationResult,
} from "./CustomerRefundCoordinator.js";
import type {
  CustomerRefundEligibility,
  CustomerRefundFieldErrors,
  CustomerRefundScope,
} from "./refundTypes.js";

export interface CustomerRefundNavigation {
  backToOrder(orderId: string): void;
}

export type CustomerRefundActionResult =
  | CustomerRefundMutationResult
  | {
      readonly status: "validation_error";
      readonly errors: CustomerRefundFieldErrors;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "request_in_flight";
    }
  | {
      readonly status: "forbidden_or_not_found";
      readonly reasonCode: "order_scope_mismatch";
    }
  | {
      readonly status: "unavailable";
      readonly reasonCode: "order_status_not_paid";
    };

export function refundEligibility(order: Order): CustomerRefundEligibility {
  const enabled = order.status === "paid";
  return Object.freeze({
    enabled,
    reasonCode: enabled ? "paid_order_hint" : "order_not_paid",
  });
}

function reasonErrors(reason: string): CustomerRefundFieldErrors {
  return reason.length > 255
    ? Object.freeze({ reason: "退款原因不能超过 255 字。" })
    : Object.freeze({});
}

export class CustomerRefundActionController {
  readonly #coordinator: CustomerRefundCoordinator;
  readonly #navigation: CustomerRefundNavigation;
  #requestInFlight = false;

  constructor(
    coordinator: CustomerRefundCoordinator,
    navigation: CustomerRefundNavigation,
  ) {
    this.#coordinator = coordinator;
    this.#navigation = navigation;
  }

  back(orderId: string): void {
    this.#navigation.backToOrder(orderId);
  }

  async submit(
    scope: CustomerRefundScope,
    order: Order,
    reason: string,
  ): Promise<CustomerRefundActionResult> {
    if (
      order.cityCode !== scope.cityCode ||
      order.customerId !== scope.actorId
    ) {
      return Object.freeze({
        status: "forbidden_or_not_found",
        reasonCode: "order_scope_mismatch",
      });
    }
    if (!refundEligibility(order).enabled) {
      return Object.freeze({
        status: "unavailable",
        reasonCode: "order_status_not_paid",
      });
    }

    const normalizedReason = reason.trim();
    const parsed = createRefundRequestSchema.safeParse({
      orderId: order.orderId,
      reason: normalizedReason,
    });
    if (!parsed.success) {
      return Object.freeze({
        status: "validation_error",
        errors: reasonErrors(normalizedReason),
      });
    }
    if (this.#requestInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }

    this.#requestInFlight = true;
    try {
      return await this.#coordinator.createRequest(
        scope,
        order.orderId,
        parsed.data.reason ?? "",
      );
    } finally {
      this.#requestInFlight = false;
    }
  }
}
