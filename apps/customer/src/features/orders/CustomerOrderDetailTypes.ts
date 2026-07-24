import type {
  AftersaleComplaintResponse,
  OrderReverseResponse,
} from "@xlb/api-client";
import type {
  CustomerOrderReviewView,
  FulfillmentCustomerConfirmation,
  FulfillmentEvidenceAggregate,
  KnownCityCode,
  Order,
} from "@xlb/types";

export const CUSTOMER_ORDER_DETAIL_ACTIONS = [
  "view-evidence",
  "confirm-fulfillment",
  "dispute-fulfillment",
  "confirm-service",
  "payment",
  "change",
  "refund",
  "aftersale",
  "review",
] as const;

export type CustomerOrderDetailAction =
  typeof CUSTOMER_ORDER_DETAIL_ACTIONS[number];

export type CustomerOrderDetailDependency =
  | "evidence"
  | "reverses"
  | "complaints"
  | "review";

export type CustomerOrderDetailResource<T> =
  | {
      readonly status: "ready";
      readonly data: T;
    }
  | {
      readonly status: "empty";
    }
  | {
      readonly status: "error";
      readonly errorCode: "dependency_load_failed" | "dependency_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "unavailable";
      readonly reasonCode: "dependency_scope_unavailable" | "dependency_capability_unavailable";
    };

export interface CustomerOrderDetailAggregate {
  readonly order: Order;
  readonly evidence: CustomerOrderDetailResource<
    readonly FulfillmentEvidenceAggregate[]
  >;
  readonly confirmations: CustomerOrderDetailResource<
    readonly FulfillmentCustomerConfirmation[]
  >;
  readonly reverses: CustomerOrderDetailResource<
    readonly OrderReverseResponse[]
  >;
  readonly complaints: CustomerOrderDetailResource<
    readonly AftersaleComplaintResponse[]
  >;
  readonly review: CustomerOrderDetailResource<CustomerOrderReviewView>;
  readonly partial: boolean;
  readonly refreshedAt: string;
}

export interface CustomerOrderDetailScope {
  readonly actorId: string;
  readonly cityCode: KnownCityCode;
}

export interface CustomerOrderDetailRouteInput {
  readonly orderId: string;
}

export interface CustomerOrderDetailActionAvailability {
  readonly action: CustomerOrderDetailAction;
  readonly available: boolean;
  readonly reasonCode: string | null;
}

export type CustomerOrderDetailSubmission =
  | "confirming-service"
  | "deciding-confirmation";

export interface CustomerOrderDetailNotice {
  readonly kind: "safe" | "error" | "conflict" | "success";
  readonly message: string;
}

export interface CustomerOrderDetailViewModel {
  readonly aggregate: CustomerOrderDetailAggregate;
  readonly availability: Readonly<
    Record<CustomerOrderDetailAction, CustomerOrderDetailActionAvailability>
  >;
  readonly selectedComplaintId: string | null;
  readonly confirmationNote: string;
  readonly submission: CustomerOrderDetailSubmission | null;
  readonly notice: CustomerOrderDetailNotice | null;
}

export interface CustomerOrderDetailActions {
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly onAction: (action: CustomerOrderDetailAction) => void;
  readonly onSelectComplaint: (complaintId: string) => void;
  readonly onChangeConfirmationNote: (note: string) => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerOrderDetailTemplateReadyData {
  readonly viewModel: CustomerOrderDetailViewModel;
  readonly actions: CustomerOrderDetailActions;
}

function evidenceAggregates(
  aggregate: CustomerOrderDetailAggregate,
): readonly FulfillmentEvidenceAggregate[] {
  return aggregate.evidence.status === "ready"
    ? aggregate.evidence.data
    : [];
}

function hasCompletedFulfillment(
  aggregate: CustomerOrderDetailAggregate,
): boolean {
  return evidenceAggregates(aggregate).some(
    (item) => item.fulfillmentStatus === "completed",
  );
}

function hasStartedFulfillment(
  aggregate: CustomerOrderDetailAggregate,
): boolean {
  return evidenceAggregates(aggregate).some(
    (item) =>
      item.fulfillmentStatus === "in_progress" ||
      item.fulfillmentStatus === "completed",
  );
}

function pendingConfirmationWithCompletionEvidence(
  aggregate: CustomerOrderDetailAggregate,
): boolean {
  if (aggregate.confirmations.status !== "ready") return false;
  return evidenceAggregates(aggregate).some((item) => {
    const confirmation = aggregate.confirmations.status === "ready"
      ? aggregate.confirmations.data.find((candidate) =>
        candidate.fulfillmentId === item.fulfillmentId
      )
      : undefined;
    return item.fulfillmentStatus === "completed" &&
      confirmation?.status === "pending" &&
      item.evidence.some((evidence) =>
        evidence.evidenceType === "after_service" ||
        evidence.evidenceType === "completion"
      );
  });
}

function availability(
  action: CustomerOrderDetailAction,
  available: boolean,
  reasonCode: string | null,
): CustomerOrderDetailActionAvailability {
  return Object.freeze({ action, available, reasonCode });
}

export function deriveCustomerOrderDetailAvailability(
  aggregate: CustomerOrderDetailAggregate,
): CustomerOrderDetailViewModel["availability"] {
  const evidenceReady = aggregate.evidence.status === "ready";
  const evidenceCount = evidenceReady
    ? aggregate.evidence.data.reduce(
      (count, item) => count + item.evidence.length,
      0,
    )
    : 0;
  const pendingConfirmation =
    pendingConfirmationWithCompletionEvidence(aggregate);
  const complaintCount = aggregate.complaints.status === "ready"
    ? aggregate.complaints.data.length
    : 0;
  const paid = aggregate.order.status === "paid";
  const pendingDispatch = aggregate.order.status === "pending_dispatch";

  return Object.freeze({
    "view-evidence": availability(
      "view-evidence",
      evidenceCount > 0,
      evidenceReady ? "evidence_empty" : "evidence_unavailable",
    ),
    "confirm-fulfillment": availability(
      "confirm-fulfillment",
      pendingConfirmation,
      "confirmation_not_pending_or_evidence_incomplete",
    ),
    "dispute-fulfillment": availability(
      "dispute-fulfillment",
      pendingConfirmation && complaintCount > 0,
      pendingConfirmation
        ? "owned_same_order_complaint_required"
        : "confirmation_not_pending_or_evidence_incomplete",
    ),
    "confirm-service": availability(
      "confirm-service",
      pendingDispatch && hasCompletedFulfillment(aggregate),
      "completed_fulfillment_required",
    ),
    payment: availability(
      "payment",
      false,
      aggregate.order.status === "service_completed"
        ? "payment_order_reference_unavailable"
        : "order_not_service_completed",
    ),
    change: availability(
      "change",
      pendingDispatch && !hasStartedFulfillment(aggregate),
      "change_requires_unstarted_pending_dispatch",
    ),
    refund: availability(
      "refund",
      paid,
      "refund_requires_paid_order",
    ),
    aftersale: availability("aftersale", true, null),
    review: availability(
      "review",
      paid &&
        hasCompletedFulfillment(aggregate) &&
        aggregate.review.status === "empty",
      aggregate.review.status === "ready"
        ? "order_already_reviewed"
        : "review_requires_paid_completed_order",
    ),
  });
}

export function latestCustomerOrderDetailAggregate(
  current: CustomerOrderDetailAggregate,
  incoming: CustomerOrderDetailAggregate,
): CustomerOrderDetailAggregate {
  const currentUpdatedAt = Date.parse(current.order.updatedAt);
  const incomingUpdatedAt = Date.parse(incoming.order.updatedAt);
  if (
    Number.isFinite(currentUpdatedAt) &&
    Number.isFinite(incomingUpdatedAt) &&
    incomingUpdatedAt < currentUpdatedAt
  ) {
    return current;
  }
  return incoming;
}
