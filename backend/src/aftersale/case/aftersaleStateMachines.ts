import type { ComplaintStatus, CompensationIntentStatus, RepairOrderStatus } from "@xlb/types";

export class InvalidAftersaleTransitionError extends Error {
  readonly statusCode = 409;

  constructor(entity: string, from: string, to: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
    this.name = "InvalidAftersaleTransitionError";
  }
}

const COMPLAINT_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  submitted: ["triaged", "in_progress", "rejected"],
  triaged: ["in_progress", "waiting_customer", "resolved", "rejected"],
  in_progress: ["waiting_customer", "resolved", "rejected"],
  waiting_customer: ["in_progress", "resolved", "rejected"],
  resolved: ["closed", "in_progress"],
  closed: [],
  rejected: [],
};

const REPAIR_TRANSITIONS: Record<RepairOrderStatus, RepairOrderStatus[]> = {
  requested: ["assigned", "in_progress", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const COMPENSATION_TRANSITIONS: Record<CompensationIntentStatus, CompensationIntentStatus[]> = {
  proposed: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function assertComplaintTransition(from: ComplaintStatus, to: ComplaintStatus): void {
  if (!COMPLAINT_TRANSITIONS[from].includes(to)) throw new InvalidAftersaleTransitionError("complaint", from, to);
}

export function assertRepairOrderTransition(from: RepairOrderStatus, to: RepairOrderStatus): void {
  if (!REPAIR_TRANSITIONS[from].includes(to)) throw new InvalidAftersaleTransitionError("repair order", from, to);
}

export function assertCompensationIntentTransition(from: CompensationIntentStatus, to: CompensationIntentStatus): void {
  if (!COMPENSATION_TRANSITIONS[from].includes(to)) throw new InvalidAftersaleTransitionError("compensation intent", from, to);
}
