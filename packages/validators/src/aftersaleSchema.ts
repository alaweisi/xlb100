import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

const idSchema = z.string().min(1).max(64);
const noteSchema = z.string().trim().min(1).max(1000);
const timeSlotSchema = z.enum(["morning", "afternoon", "evening"]);

export const orderReverseTypeSchema = z.enum(["cancel", "reschedule", "reassign"]);
export const orderReverseStatusSchema = z.enum(["requested", "approved", "rejected", "applied"]);
export const complaintCategorySchema = z.enum([
  "service_quality", "price_dispute", "material", "timeliness",
  "attitude", "safety", "damage", "other",
]);
export const complaintPrioritySchema = z.enum(["normal", "urgent", "critical"]);
export const complaintStatusSchema = z.enum([
  "submitted", "triaged", "in_progress", "waiting_customer", "resolved", "closed", "rejected",
]);
export const complaintResolutionTypeSchema = z.enum([
  "rework", "reassign", "refund_intent", "compensation_intent", "explanation", "no_fault",
]);
export const repairOrderStatusSchema = z.enum(["requested", "assigned", "in_progress", "completed", "cancelled"]);
export const liabilityPartySchema = z.enum(["platform", "worker", "customer", "merchant", "shared", "no_fault"]);
export const compensationIntentTypeSchema = z.enum(["refund", "service_credit", "cash", "fee_waiver", "rework"]);
export const compensationIntentStatusSchema = z.enum(["proposed", "approved", "rejected"]);
export const aftersaleActorTypeSchema = z.enum(["customer", "worker", "admin", "system"]);
export const aftersaleTimelineEventTypeSchema = z.enum([
  "reverse.requested", "reverse.approved", "reverse.rejected", "reverse.applied",
  "complaint.submitted", "complaint.triaged", "complaint.status_changed", "complaint.resolved", "complaint.closed",
  "repair.created", "repair.started", "repair.completed", "liability.decided",
  "compensation.proposed", "compensation.approved", "compensation.rejected", "customer_service.note",
]);

export const createOrderReverseRequestSchema = z.object({
  reverseType: orderReverseTypeSchema,
  reason: z.string().trim().min(2).max(500),
  requestedScheduledAt: z.string().datetime().optional(),
  requestedTimeSlot: timeSlotSchema.optional(),
  idempotencyKey: z.string().min(8).max(128),
}).strict().superRefine((value, ctx) => {
  const hasSchedule = Boolean(value.requestedScheduledAt && value.requestedTimeSlot);
  if (value.reverseType === "reschedule" && !hasSchedule) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "reschedule requires requestedScheduledAt and requestedTimeSlot" });
  }
  if (value.reverseType !== "reschedule" && (value.requestedScheduledAt || value.requestedTimeSlot)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "schedule fields are allowed only for reschedule" });
  }
});

export const reviewOrderReverseRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(1000).optional(),
}).strict();

export const createAftersaleComplaintRequestSchema = z.object({
  orderId: idSchema,
  category: complaintCategorySchema,
  priority: complaintPrioritySchema.optional().default("normal"),
  description: z.string().trim().min(5).max(2000),
  idempotencyKey: z.string().min(8).max(128),
}).strict();

export const triageAftersaleComplaintRequestSchema = z.object({
  priority: complaintPrioritySchema.optional(),
  assignedAdminId: idSchema.optional(),
  status: z.enum(["triaged", "in_progress", "waiting_customer"]),
  note: z.string().trim().max(1000).optional(),
}).strict();

export const resolveAftersaleComplaintRequestSchema = z.object({
  resolutionType: complaintResolutionTypeSchema,
  resolutionNote: noteSchema,
}).strict();

export const createAftersaleRepairOrderRequestSchema = z.object({
  workerId: idSchema.optional(),
  reason: noteSchema,
}).strict();

export const completeAftersaleRepairOrderRequestSchema = z.object({
  serviceNote: noteSchema,
}).strict();

export const decideAftersaleLiabilityRequestSchema = z.object({
  liableParty: liabilityPartySchema,
  workerLiabilityPercent: z.number().int().min(0).max(100),
  platformLiabilityPercent: z.number().int().min(0).max(100),
  customerLiabilityPercent: z.number().int().min(0).max(100),
  reason: noteSchema,
}).strict().superRefine((value, ctx) => {
  const total = value.workerLiabilityPercent + value.platformLiabilityPercent + value.customerLiabilityPercent;
  if (total !== 100 && value.liableParty !== "no_fault") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "liability percentages must total 100" });
  }
  if (value.liableParty === "no_fault" && total !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "no_fault liability percentages must total 0" });
  }
});

export const proposeAftersaleCompensationRequestSchema = z.object({
  intentType: compensationIntentTypeSchema,
  requestedAmount: z.number().min(0).max(1000000).optional().default(0),
  reason: noteSchema,
}).strict();

export const reviewAftersaleCompensationRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  approvedAmount: z.number().min(0).max(1000000).optional(),
  decisionNote: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "approved" && value.approvedAmount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "approved compensation requires approvedAmount" });
  }
  if (value.decision === "rejected" && value.approvedAmount !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "rejected compensation cannot set approvedAmount" });
  }
});

export const addAftersaleTimelineNoteRequestSchema = z.object({ content: noteSchema }).strict();

export const orderReverseRequestSchema = z.object({
  reverseRequestId: idSchema, cityCode: cityCodeSchema, orderId: idSchema, customerId: idSchema,
  reverseType: orderReverseTypeSchema, status: orderReverseStatusSchema, reason: z.string(),
  requestedScheduledAt: z.string().nullable(), requestedTimeSlot: timeSlotSchema.nullable(),
  idempotencyKey: z.string(), reviewNote: z.string().nullable(), reviewedByAdminId: z.string().nullable(),
  reviewedAt: z.string().nullable(), appliedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
}).strict();

export const aftersaleComplaintSchema = z.object({
  complaintId: idSchema, cityCode: cityCodeSchema, orderId: idSchema, customerId: idSchema,
  category: complaintCategorySchema, priority: complaintPrioritySchema, description: z.string(), status: complaintStatusSchema,
  idempotencyKey: z.string(), assignedAdminId: z.string().nullable(), resolutionType: complaintResolutionTypeSchema.nullable(),
  resolutionNote: z.string().nullable(), submittedAt: z.string(), resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(), updatedAt: z.string(),
}).strict();

export type CreateOrderReverseRequestInput = z.infer<typeof createOrderReverseRequestSchema>;
export type ReviewOrderReverseRequestInput = z.infer<typeof reviewOrderReverseRequestSchema>;
export type CreateAftersaleComplaintRequestInput = z.infer<typeof createAftersaleComplaintRequestSchema>;
export type TriageAftersaleComplaintRequestInput = z.infer<typeof triageAftersaleComplaintRequestSchema>;
export type ResolveAftersaleComplaintRequestInput = z.infer<typeof resolveAftersaleComplaintRequestSchema>;
export type CreateAftersaleRepairOrderRequestInput = z.infer<typeof createAftersaleRepairOrderRequestSchema>;
export type CompleteAftersaleRepairOrderRequestInput = z.infer<typeof completeAftersaleRepairOrderRequestSchema>;
export type DecideAftersaleLiabilityRequestInput = z.infer<typeof decideAftersaleLiabilityRequestSchema>;
export type ProposeAftersaleCompensationRequestInput = z.infer<typeof proposeAftersaleCompensationRequestSchema>;
export type ReviewAftersaleCompensationRequestInput = z.infer<typeof reviewAftersaleCompensationRequestSchema>;
