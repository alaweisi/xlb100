import type {
  Order,
  OrderReverseType,
} from "@xlb/types";
import {
  createOrderReverseRequestSchema,
} from "@xlb/validators";
import {
  CustomerOrderChangeCoordinator,
  type CustomerOrderChangeMutationResult,
} from "./OrderChangeCoordinator.js";
import type {
  CustomerOrderChangeDraft,
  CustomerOrderChangeEligibility,
  CustomerOrderChangeFieldErrors,
} from "./orderChangeTypes.js";

export interface CustomerOrderChangeNavigation {
  back(orderId: string): void;
  login(): void;
}

export type CustomerOrderChangeActionResult =
  | CustomerOrderChangeMutationResult
  | {
      readonly status: "validation_error";
      readonly errors: CustomerOrderChangeFieldErrors;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "request_in_flight";
    }
  | {
      readonly status: "unavailable";
      readonly reasonCode: "fulfillment_start_fact_missing";
    };

let idempotencySequence = 0;

export function orderChangeEligibility(
  order: Order,
): Readonly<Record<OrderReverseType, CustomerOrderChangeEligibility>> {
  const cancelEnabled = !["draft", "paid", "cancelled"].includes(order.status);
  return Object.freeze({
    cancel: Object.freeze({
      enabled: cancelEnabled,
      reasonCode: cancelEnabled
        ? "server_will_decide"
        : "order_status_not_eligible",
    }),
    reschedule: Object.freeze({
      enabled: false,
      reasonCode: "fulfillment_start_fact_missing",
    }),
    reassign: Object.freeze({
      enabled: false,
      reasonCode: "fulfillment_start_fact_missing",
    }),
  });
}

function freshIdempotencyKey(): string {
  idempotencySequence += 1;
  const suffix = typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-order-change-${idempotencySequence}-${suffix}`;
}

function fieldErrors(
  draft: CustomerOrderChangeDraft,
): CustomerOrderChangeFieldErrors {
  const errors: {
    reason?: string;
    requestedScheduledAt?: string;
    requestedTimeSlot?: string;
  } = {};
  const reason = draft.reason.trim();
  if (reason.length < 2) {
    errors.reason = "请填写至少 2 个字的申请原因。";
  } else if (reason.length > 500) {
    errors.reason = "申请原因不能超过 500 字。";
  }
  if (draft.reverseType === "reschedule") {
    if (draft.requestedScheduledAt.length === 0) {
      errors.requestedScheduledAt = "请选择新的预约时间。";
    } else if (!Number.isFinite(new Date(draft.requestedScheduledAt).getTime())) {
      errors.requestedScheduledAt = "新的预约时间格式不正确。";
    }
    if (!["morning", "afternoon", "evening"].includes(
      draft.requestedTimeSlot,
    )) {
      errors.requestedTimeSlot = "请选择预约时段。";
    }
  }
  return Object.freeze(errors);
}

export class CustomerOrderChangeActionController {
  readonly #coordinator: CustomerOrderChangeCoordinator;
  readonly #navigation: CustomerOrderChangeNavigation;
  #mutationInFlight = false;

  constructor(
    coordinator: CustomerOrderChangeCoordinator,
    navigation: CustomerOrderChangeNavigation,
  ) {
    this.#coordinator = coordinator;
    this.#navigation = navigation;
  }

  back(orderId: string): void {
    this.#navigation.back(orderId);
  }

  login(): void {
    this.#navigation.login();
  }

  async submit(
    order: Order,
    draft: CustomerOrderChangeDraft,
  ): Promise<CustomerOrderChangeActionResult> {
    const eligibility = orderChangeEligibility(order)[draft.reverseType];
    if (
      !eligibility.enabled &&
      eligibility.reasonCode === "fulfillment_start_fact_missing"
    ) {
      return Object.freeze({
        status: "unavailable",
        reasonCode: "fulfillment_start_fact_missing",
      });
    }

    const request = createOrderReverseRequestSchema.safeParse({
      reverseType: draft.reverseType,
      reason: draft.reason,
      ...(draft.reverseType === "reschedule"
        ? {
            requestedScheduledAt: new Date(
              draft.requestedScheduledAt,
            ).toISOString(),
            requestedTimeSlot: draft.requestedTimeSlot,
          }
        : {}),
      idempotencyKey: freshIdempotencyKey(),
    });
    if (!request.success) {
      return Object.freeze({
        status: "validation_error",
        errors: fieldErrors(draft),
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
      return await this.#coordinator.create(order.orderId, request.data);
    } finally {
      this.#mutationInFlight = false;
    }
  }
}
