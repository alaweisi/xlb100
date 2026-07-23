import type {
  AftersaleComplaint,
  AftersaleComplaintDetail,
  AftersaleTimelineEvent,
  CityCode,
  ComplaintCategory,
  ComplaintPriority,
} from "@xlb/types";

const SAFE_AFTERSALE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export function isSafeCustomerAftersaleIdentifier(value: string): boolean {
  return SAFE_AFTERSALE_IDENTIFIER.test(value);
}

export type CustomerAftersaleRouteInput =
  | {
      readonly view: "order";
      readonly orderId: string;
      readonly complaintId: null;
    }
  | {
      readonly view: "detail";
      readonly orderId: null;
      readonly complaintId: string;
    };

export interface CustomerAftersaleScope {
  readonly cityCode: CityCode;
  readonly actorId: string;
}

export interface CustomerAftersaleComplaintDraft {
  readonly category: ComplaintCategory;
  readonly priority: ComplaintPriority;
  readonly description: string;
}

export interface CustomerAftersaleDraftErrors {
  readonly category?: string;
  readonly priority?: string;
  readonly description?: string;
}

export type CustomerAftersaleOperation =
  | "creating-complaint"
  | "adding-note";

export interface CustomerAftersaleNotice {
  readonly kind: "success" | "conflict" | "error" | "safe";
  readonly message: string;
}

export interface CustomerVisibleAftersaleTimelineEvent {
  readonly timelineEventId: string;
  readonly eventType: AftersaleTimelineEvent["eventType"];
  readonly content: string | null;
  readonly createdAt: string;
}

export interface CustomerAftersaleDetailView
  extends Omit<AftersaleComplaintDetail, "timeline"> {
  readonly timeline: readonly CustomerVisibleAftersaleTimelineEvent[];
}

export interface CustomerAftersaleViewModel {
  readonly route: CustomerAftersaleRouteInput;
  readonly complaints: readonly AftersaleComplaint[];
  readonly detail: CustomerAftersaleDetailView | null;
  readonly draft: CustomerAftersaleComplaintDraft;
  readonly draftErrors: CustomerAftersaleDraftErrors;
  readonly note: string;
  readonly operation: CustomerAftersaleOperation | null;
  readonly refreshing: boolean;
  readonly notice: CustomerAftersaleNotice | null;
}

export interface CustomerAftersaleActions {
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly onOpenComplaint: (complaintId: string) => void;
  readonly onDraftChange: (
    field: keyof CustomerAftersaleComplaintDraft,
    value: string,
  ) => void;
  readonly onCreateComplaint: () => void;
  readonly onNoteChange: (value: string) => void;
  readonly onAddNote: () => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerAftersaleTemplateReadyData {
  readonly viewModel: CustomerAftersaleViewModel;
  readonly actions: CustomerAftersaleActions;
}

export interface CustomerComplaintReference {
  readonly complaintId: string;
  readonly orderId: string;
  readonly status: AftersaleComplaint["status"];
}

/**
 * Formal read-only seam consumed by Order Detail when it needs to bind a
 * disputed confirmation to an owned complaint. It never changes confirmation
 * or order state.
 */
export function customerComplaintReference(
  complaint: AftersaleComplaint,
): CustomerComplaintReference {
  return Object.freeze({
    complaintId: complaint.complaintId,
    orderId: complaint.orderId,
    status: complaint.status,
  });
}

export const EMPTY_CUSTOMER_AFTERSALE_DRAFT:
CustomerAftersaleComplaintDraft = Object.freeze({
  category: "service_quality",
  priority: "normal",
  description: "",
});

const CUSTOMER_VISIBLE_EVENT_TYPES = new Set<
  AftersaleTimelineEvent["eventType"]
>([
  "complaint.submitted",
  "complaint.triaged",
  "complaint.status_changed",
  "complaint.resolved",
  "complaint.closed",
  "repair.created",
  "repair.started",
  "repair.completed",
  "liability.decided",
  "compensation.proposed",
  "compensation.approved",
  "compensation.rejected",
  "fulfillment.customer_disputed",
  "customer_service.note",
]);

export function requesterVisibleAftersaleTimeline(
  timeline: readonly AftersaleTimelineEvent[],
): readonly CustomerVisibleAftersaleTimelineEvent[] {
  return Object.freeze(timeline.flatMap((event) => {
    if (!CUSTOMER_VISIBLE_EVENT_TYPES.has(event.eventType)) return [];
    if (
      event.eventType === "customer_service.note" &&
      event.actorType !== "customer"
    ) {
      return [];
    }
    return [Object.freeze({
      timelineEventId: event.timelineEventId,
      eventType: event.eventType,
      content: event.actorType === "customer" ? event.content : null,
      createdAt: event.createdAt,
    })];
  }));
}
