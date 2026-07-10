import type { CityCode } from "./city.js";
import type { ScheduledTimeSlot } from "./order.js";

export type OrderReverseType = "cancel" | "reschedule" | "reassign";
export type OrderReverseStatus = "requested" | "approved" | "rejected" | "applied";

export interface OrderReverseRequest {
  reverseRequestId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  reverseType: OrderReverseType;
  status: OrderReverseStatus;
  reason: string;
  requestedScheduledAt: string | null;
  requestedTimeSlot: ScheduledTimeSlot | null;
  idempotencyKey: string;
  reviewNote: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ComplaintCategory =
  | "service_quality"
  | "price_dispute"
  | "material"
  | "timeliness"
  | "attitude"
  | "safety"
  | "damage"
  | "other";
export type ComplaintPriority = "normal" | "urgent" | "critical";
export type ComplaintStatus =
  | "submitted"
  | "triaged"
  | "in_progress"
  | "waiting_customer"
  | "resolved"
  | "closed"
  | "rejected";
export type ComplaintResolutionType =
  | "rework"
  | "reassign"
  | "refund_intent"
  | "compensation_intent"
  | "explanation"
  | "no_fault";

export interface AftersaleComplaint {
  complaintId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  description: string;
  status: ComplaintStatus;
  idempotencyKey: string;
  assignedAdminId: string | null;
  resolutionType: ComplaintResolutionType | null;
  resolutionNote: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

export type RepairOrderStatus = "requested" | "assigned" | "in_progress" | "completed" | "cancelled";

export interface AftersaleRepairOrder {
  repairOrderId: string;
  cityCode: CityCode;
  complaintId: string;
  orderId: string;
  workerId: string | null;
  reason: string;
  status: RepairOrderStatus;
  serviceNote: string | null;
  createdByAdminId: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LiabilityParty = "platform" | "worker" | "customer" | "merchant" | "shared" | "no_fault";

export interface AftersaleLiabilityDecision {
  liabilityDecisionId: string;
  cityCode: CityCode;
  complaintId: string;
  orderId: string;
  liableParty: LiabilityParty;
  workerLiabilityPercent: number;
  platformLiabilityPercent: number;
  customerLiabilityPercent: number;
  reason: string;
  decidedByAdminId: string;
  decidedAt: string;
}

export type CompensationIntentType = "refund" | "service_credit" | "cash" | "fee_waiver" | "rework";
export type CompensationIntentStatus = "proposed" | "approved" | "rejected";

export interface AftersaleCompensationIntent {
  compensationIntentId: string;
  cityCode: CityCode;
  complaintId: string;
  orderId: string;
  intentType: CompensationIntentType;
  requestedAmount: number;
  approvedAmount: number | null;
  currency: "CNY";
  reason: string;
  status: CompensationIntentStatus;
  providerExecutionStatus: "not_executed";
  proposedByAdminId: string;
  decidedByAdminId: string | null;
  decisionNote: string | null;
  proposedAt: string;
  decidedAt: string | null;
}

export type AftersaleActorType = "customer" | "worker" | "admin" | "system";
export type AftersaleTimelineEventType =
  | "reverse.requested"
  | "reverse.approved"
  | "reverse.rejected"
  | "reverse.applied"
  | "complaint.submitted"
  | "complaint.triaged"
  | "complaint.status_changed"
  | "complaint.resolved"
  | "complaint.closed"
  | "repair.created"
  | "repair.started"
  | "repair.completed"
  | "liability.decided"
  | "compensation.proposed"
  | "compensation.approved"
  | "compensation.rejected"
  | "customer_service.note"
  | "fulfillment.customer_disputed";

export interface AftersaleTimelineEvent {
  timelineEventId: string;
  cityCode: CityCode;
  orderId: string;
  complaintId: string | null;
  reverseRequestId: string | null;
  repairOrderId: string | null;
  eventType: AftersaleTimelineEventType;
  actorType: AftersaleActorType;
  actorId: string | null;
  content: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AftersaleComplaintDetail {
  complaint: AftersaleComplaint;
  repairOrders: AftersaleRepairOrder[];
  liabilityDecision: AftersaleLiabilityDecision | null;
  compensationIntents: AftersaleCompensationIntent[];
  timeline: AftersaleTimelineEvent[];
}

export interface CreateOrderReverseRequest {
  reverseType: OrderReverseType;
  reason: string;
  requestedScheduledAt?: string;
  requestedTimeSlot?: ScheduledTimeSlot;
  idempotencyKey: string;
}

export interface ReviewOrderReverseRequest {
  decision: "approved" | "rejected";
  reviewNote?: string;
}

export interface CreateAftersaleComplaintRequest {
  orderId: string;
  category: ComplaintCategory;
  priority?: ComplaintPriority;
  description: string;
  idempotencyKey: string;
}

export interface TriageAftersaleComplaintRequest {
  priority?: ComplaintPriority;
  assignedAdminId?: string;
  status: "triaged" | "in_progress" | "waiting_customer";
  note?: string;
}

export interface ResolveAftersaleComplaintRequest {
  resolutionType: ComplaintResolutionType;
  resolutionNote: string;
}

export interface CreateAftersaleRepairOrderRequest {
  workerId?: string;
  reason: string;
}

export interface CompleteAftersaleRepairOrderRequest {
  serviceNote: string;
}

export interface DecideAftersaleLiabilityRequest {
  liableParty: LiabilityParty;
  workerLiabilityPercent: number;
  platformLiabilityPercent: number;
  customerLiabilityPercent: number;
  reason: string;
}

export interface ProposeAftersaleCompensationRequest {
  intentType: CompensationIntentType;
  requestedAmount?: number;
  reason: string;
}

export interface ReviewAftersaleCompensationRequest {
  decision: "approved" | "rejected";
  approvedAmount?: number;
  decisionNote?: string;
}

export interface AddAftersaleTimelineNoteRequest {
  content: string;
}
