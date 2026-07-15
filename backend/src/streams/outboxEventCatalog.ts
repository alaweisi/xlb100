import type { OutboxEventType } from "@xlb/types";

export const OUTBOX_EVENT_TYPES = [
  "order.created", "order.paid", "payment.paid", "dispatch.accepted",
  "fulfillment.created", "fulfillment.started", "fulfillment.completed",
  "fulfillment.evidence.created", "fulfillment.customer_confirmation.pending",
  "fulfillment.customer_confirmation.confirmed", "fulfillment.customer_confirmation.disputed",
  "settlement.prepared", "settlement.confirmed", "settlement.payable",
  "settlement.payable.queued", "refund.approved", "order.reverse.requested",
  "order.reverse.approved", "order.reverse.applied", "aftersale.complaint.submitted",
  "aftersale.complaint.resolved", "aftersale.repair.created", "aftersale.repair.completed",
  "aftersale.liability.decided", "aftersale.compensation.approved", "support.ticket.created",
  "support.ticket.assigned", "support.ticket.escalated", "support.ticket.resolved",
  "support.ticket.reopened", "support.ticket.closed", "support.sla.breached",
  "support.conversation.started", "support.conversation.transferred", "support.conversation.closed",
  "support.message.created", "support.csat.submitted", "support.quality.reviewed",
  "support.bot.handed_off", "review.created", "review.visibility.changed",
  "marketing.discount.decision.issued", "marketing.coupon.reserved",
  "marketing.coupon.redeemed", "marketing.coupon.released", "conflict_audit",
  "worker.receivable.statement.created", "worker.receivable.statement.reviewed",
  "worker.receivable.statement.exported",
] as const satisfies readonly OutboxEventType[];

type MissingOutboxEvent = Exclude<OutboxEventType, (typeof OUTBOX_EVENT_TYPES)[number]>;
const exhaustiveEventCatalog: MissingOutboxEvent extends never ? true : never = true;
void exhaustiveEventCatalog;

export type OutboxConsumptionMode = "transactional_consumer" | "projection_source" | "audit_record";
export type OutboxRetentionClass = "operational_90d" | "customer_record_2y" | "financial_7y";

export type OutboxEventCatalogEntry = {
  eventType: OutboxEventType;
  mode: OutboxConsumptionMode;
  owner: string;
  retentionClass: OutboxRetentionClass;
  legalHoldCapable: boolean;
};

const transactionalConsumers: Partial<Record<OutboxEventType, string>> = {
  "order.created": "dispatch",
  "fulfillment.completed": "ledger-accrual",
  "refund.approved": "ledger-reversal",
};

const financialPrefixes = ["payment.", "settlement.", "refund.", "worker.receivable.", "marketing."];
const customerPrefixes = ["aftersale.", "support.", "review.", "fulfillment.evidence."];

export const OUTBOX_EVENT_CATALOG: readonly OutboxEventCatalogEntry[] = OUTBOX_EVENT_TYPES.map(
  (eventType): OutboxEventCatalogEntry => {
    const consumer = transactionalConsumers[eventType];
    const auditOnly = eventType === "conflict_audit";
    const financial = financialPrefixes.some((prefix) => eventType.startsWith(prefix)) || auditOnly;
    const customerRecord = customerPrefixes.some((prefix) => eventType.startsWith(prefix));
    return {
      eventType,
      mode: consumer ? "transactional_consumer" : auditOnly ? "audit_record" : "projection_source",
      owner: consumer ?? (auditOnly ? "data-governance" : "platform-delivery"),
      retentionClass: financial ? "financial_7y" : customerRecord ? "customer_record_2y" : "operational_90d",
      legalHoldCapable: financial || customerRecord,
    };
  },
);

const catalogByType = new Map(OUTBOX_EVENT_CATALOG.map((entry) => [entry.eventType, entry]));

export function getOutboxEventCatalogEntry(eventType: OutboxEventType): OutboxEventCatalogEntry {
  const entry = catalogByType.get(eventType);
  if (!entry) throw new Error(`outbox event is missing from consumption catalog: ${eventType}`);
  return entry;
}
