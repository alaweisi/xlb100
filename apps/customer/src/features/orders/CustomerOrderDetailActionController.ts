import {
  deriveCustomerOrderDetailAvailability,
  type CustomerOrderDetailAction,
  type CustomerOrderDetailAggregate,
  type CustomerOrderDetailScope,
} from "./CustomerOrderDetailTypes.js";
import {
  type CustomerOrderDetailLoadResult,
  type CustomerOrderDetailMutationResult,
  CustomerOrderDetailCoordinator,
} from "./CustomerOrderDetailCoordinator.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export type CustomerOrderRelatedTarget =
  | "change"
  | "refund"
  | "aftersale"
  | "review";

export interface CustomerOrderDetailNavigation {
  backToOrders(): void;
  openRoute(
    route:
      | `/orders/${string}/change`
      | `/orders/${string}/refund`
      | `/orders/${string}/aftersale`
      | `/orders/${string}/review`
      | `/payment/${string}`,
  ): void;
  focusEvidence(): void;
}

export type CustomerOrderDetailActionResult =
  | {
      readonly status: "navigated" | "focused";
      readonly load: Extract<CustomerOrderDetailLoadResult, { readonly status: "ready" }>;
    }
  | {
      readonly status: "mutated";
      readonly mutation: CustomerOrderDetailMutationResult;
    }
  | {
      readonly status: "rejected";
      readonly reasonCode:
        | "action_unavailable"
        | "invalid_order_id"
        | "invalid_complaint"
        | "confirmation_note_required"
        | "payment_reference_unavailable";
      readonly load: CustomerOrderDetailLoadResult | null;
    }
  | {
      readonly status: "duplicate";
    }
  | {
      readonly status: "refresh-failed";
      readonly load: Exclude<CustomerOrderDetailLoadResult, { readonly status: "ready" }>;
    };

export function isSafeCustomerOrderDetailId(value: string): boolean {
  return SAFE_ID.test(value);
}

export function safeCustomerOrderRelatedRoute(
  orderId: string,
  target: CustomerOrderRelatedTarget,
):
  | `/orders/${string}/change`
  | `/orders/${string}/refund`
  | `/orders/${string}/aftersale`
  | `/orders/${string}/review`
  | null {
  if (!SAFE_ID.test(orderId)) return null;
  return `/orders/${orderId}/${target}`;
}

export function safeCustomerPaymentRoute(
  paymentOrderId: string,
): `/payment/${string}` | null {
  return SAFE_ID.test(paymentOrderId)
    ? `/payment/${paymentOrderId}`
    : null;
}

function pendingConfirmation(
  aggregate: CustomerOrderDetailAggregate,
): { readonly fulfillmentId: string } | null {
  if (
    aggregate.evidence.status !== "ready" ||
    aggregate.confirmations.status !== "ready"
  ) return null;
  const target = aggregate.evidence.data.find((item) =>
    item.fulfillmentStatus === "completed" &&
    aggregate.confirmations.status === "ready" &&
    aggregate.confirmations.data.some((confirmation) =>
      confirmation.fulfillmentId === item.fulfillmentId &&
      confirmation.status === "pending"
    ) &&
    item.evidence.some((evidence) =>
      evidence.evidenceType === "after_service" ||
      evidence.evidenceType === "completion"
    )
  );
  return target ? Object.freeze({ fulfillmentId: target.fulfillmentId }) : null;
}

export class CustomerOrderDetailActionController {
  readonly #navigation: CustomerOrderDetailNavigation;
  readonly #inFlight = new Set<string>();

  constructor(navigation: CustomerOrderDetailNavigation) {
    this.#navigation = navigation;
  }

  backToOrders(): void {
    this.#navigation.backToOrders();
  }

  async execute(
    action: CustomerOrderDetailAction,
    scope: CustomerOrderDetailScope,
    orderId: string,
    coordinator: CustomerOrderDetailCoordinator,
    input: {
      readonly complaintId: string | null;
      readonly note: string;
    },
  ): Promise<CustomerOrderDetailActionResult> {
    if (!SAFE_ID.test(orderId)) {
      return Object.freeze({
        status: "rejected",
        reasonCode: "invalid_order_id",
        load: null,
      });
    }
    const lockKey = [scope.actorId, scope.cityCode, orderId, action].join(":");
    if (this.#inFlight.has(lockKey)) {
      return Object.freeze({ status: "duplicate" });
    }
    this.#inFlight.add(lockKey);
    try {
      const load = await coordinator.loadAggregate(scope, orderId);
      if (load.status !== "ready") {
        return Object.freeze({ status: "refresh-failed", load });
      }
      const actionState = deriveCustomerOrderDetailAvailability(
        load.aggregate,
      )[action];
      if (!actionState.available) {
        return Object.freeze({
          status: "rejected",
          reasonCode: action === "payment"
            ? "payment_reference_unavailable"
            : "action_unavailable",
          load,
        });
      }

      if (action === "view-evidence") {
        this.#navigation.focusEvidence();
        return Object.freeze({ status: "focused", load });
      }

      if (
        action === "change" ||
        action === "refund" ||
        action === "aftersale" ||
        action === "review"
      ) {
        const route = safeCustomerOrderRelatedRoute(orderId, action);
        if (route === null) {
          return Object.freeze({
            status: "rejected",
            reasonCode: "invalid_order_id",
            load,
          });
        }
        this.#navigation.openRoute(route);
        return Object.freeze({ status: "navigated", load });
      }

      if (action === "payment") {
        return Object.freeze({
          status: "rejected",
          reasonCode: "payment_reference_unavailable",
          load,
        });
      }

      if (action === "confirm-service") {
        return Object.freeze({
          status: "mutated",
          mutation: await coordinator.confirmService(scope, orderId),
        });
      }

      const confirmation = pendingConfirmation(load.aggregate);
      if (confirmation === null) {
        return Object.freeze({
          status: "rejected",
          reasonCode: "action_unavailable",
          load,
        });
      }
      const note = input.note.trim();
      if (action === "dispute-fulfillment") {
        const complaint = load.aggregate.complaints.status === "ready"
          ? load.aggregate.complaints.data.find((item) =>
            item.complaintId === input.complaintId &&
            item.orderId === orderId &&
            item.cityCode === scope.cityCode &&
            item.customerId === scope.actorId
          )
          : undefined;
        if (complaint === undefined) {
          return Object.freeze({
            status: "rejected",
            reasonCode: "invalid_complaint",
            load,
          });
        }
        if (note.length < 2) {
          return Object.freeze({
            status: "rejected",
            reasonCode: "confirmation_note_required",
            load,
          });
        }
        return Object.freeze({
          status: "mutated",
          mutation: await coordinator.decideConfirmation(
            scope,
            orderId,
            confirmation.fulfillmentId,
            {
              decision: "disputed",
              complaintId: complaint.complaintId,
              note,
            },
          ),
        });
      }
      return Object.freeze({
        status: "mutated",
        mutation: await coordinator.decideConfirmation(
          scope,
          orderId,
          confirmation.fulfillmentId,
          {
            decision: "confirmed",
            ...(note.length >= 2 ? { note } : {}),
          },
        ),
      });
    } finally {
      this.#inFlight.delete(lockKey);
    }
  }
}
