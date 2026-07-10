export type OrderReverseTypeResponse = "cancel" | "reschedule" | "reassign";
export type OrderReverseStatusResponse = "requested" | "approved" | "rejected" | "applied";

export interface OrderReverseResponse {
  reverseRequestId: string;
  cityCode: string;
  orderId: string;
  customerId: string;
  reverseType: OrderReverseTypeResponse;
  status: OrderReverseStatusResponse;
  reason: string;
  requestedScheduledAt: string | null;
  requestedTimeSlot: "morning" | "afternoon" | "evening" | null;
  idempotencyKey: string;
  reviewNote: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ComplaintCategoryResponse = "service_quality" | "price_dispute" | "material" | "timeliness" | "attitude" | "safety" | "damage" | "other";
export type ComplaintPriorityResponse = "normal" | "urgent" | "critical";
export type ComplaintStatusResponse = "submitted" | "triaged" | "in_progress" | "waiting_customer" | "resolved" | "closed" | "rejected";

export interface AftersaleComplaintResponse {
  complaintId: string;
  cityCode: string;
  orderId: string;
  customerId: string;
  category: ComplaintCategoryResponse;
  priority: ComplaintPriorityResponse;
  description: string;
  status: ComplaintStatusResponse;
  idempotencyKey: string;
  assignedAdminId: string | null;
  resolutionType: "rework" | "reassign" | "refund_intent" | "compensation_intent" | "explanation" | "no_fault" | null;
  resolutionNote: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

export interface AftersaleRepairOrderResponse {
  repairOrderId: string;
  cityCode: string;
  complaintId: string;
  orderId: string;
  workerId: string | null;
  reason: string;
  status: "requested" | "assigned" | "in_progress" | "completed" | "cancelled";
  serviceNote: string | null;
  createdByAdminId: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AftersaleLiabilityDecisionResponse {
  liabilityDecisionId: string;
  cityCode: string;
  complaintId: string;
  orderId: string;
  liableParty: "platform" | "worker" | "customer" | "merchant" | "shared" | "no_fault";
  workerLiabilityPercent: number;
  platformLiabilityPercent: number;
  customerLiabilityPercent: number;
  reason: string;
  decidedByAdminId: string;
  decidedAt: string;
}

export interface AftersaleCompensationIntentResponse {
  compensationIntentId: string;
  cityCode: string;
  complaintId: string;
  orderId: string;
  intentType: "refund" | "service_credit" | "cash" | "fee_waiver" | "rework";
  requestedAmount: number;
  approvedAmount: number | null;
  currency: "CNY";
  reason: string;
  status: "proposed" | "approved" | "rejected";
  providerExecutionStatus: "not_executed";
  proposedByAdminId: string;
  decidedByAdminId: string | null;
  decisionNote: string | null;
  proposedAt: string;
  decidedAt: string | null;
}

export interface AftersaleTimelineEventResponse {
  timelineEventId: string;
  cityCode: string;
  orderId: string;
  complaintId: string | null;
  reverseRequestId: string | null;
  repairOrderId: string | null;
  eventType: string;
  actorType: "customer" | "worker" | "admin" | "system";
  actorId: string | null;
  content: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AftersaleComplaintDetailResponse {
  complaint: AftersaleComplaintResponse;
  repairOrders: AftersaleRepairOrderResponse[];
  liabilityDecision: AftersaleLiabilityDecisionResponse | null;
  compensationIntents: AftersaleCompensationIntentResponse[];
  timeline: AftersaleTimelineEventResponse[];
}
