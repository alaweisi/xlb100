import type { OutboxEventStatus, OutboxEventType } from "@xlb/types";
import { getOutboxEventCatalogEntry, type OutboxRetentionClass } from "./outboxEventCatalog.js";

export const OUTBOX_RETENTION_DAYS: Readonly<Record<OutboxRetentionClass, number>> = {
  operational_90d: 90,
  customer_record_2y: 730,
  financial_7y: 2_555,
};

export type OutboxPurgeCandidate = {
  eventType: OutboxEventType;
  status: OutboxEventStatus;
  createdAt: string;
  publishedAt?: string | null;
  deadLetteredAt?: string | null;
  legalHold: boolean;
  downstreamComplete: boolean;
};

export type OutboxPurgeDecision = {
  eligible: boolean;
  reason: "eligible" | "non_terminal" | "legal_hold" | "downstream_incomplete" | "retention_active";
  retainUntil: string;
};

export function evaluateOutboxPurge(
  candidate: OutboxPurgeCandidate,
  now = new Date(),
): OutboxPurgeDecision {
  const catalog = getOutboxEventCatalogEntry(candidate.eventType);
  const anchorRaw = candidate.deadLetteredAt ?? candidate.publishedAt ?? candidate.createdAt;
  const anchor = new Date(anchorRaw);
  if (Number.isNaN(anchor.getTime())) throw new Error("outbox retention anchor is invalid");
  const retainUntil = new Date(
    anchor.getTime() + OUTBOX_RETENTION_DAYS[catalog.retentionClass] * 86_400_000,
  ).toISOString();
  const terminalStatus = candidate.status === "published" || candidate.status === "dead_letter";
  const catalogTerminal = catalog.mode !== "transactional_consumer"
    && candidate.status === "pending"
    && candidate.downstreamComplete;
  if (!terminalStatus && !catalogTerminal) {
    return { eligible: false, reason: "non_terminal", retainUntil };
  }
  if (candidate.legalHold) return { eligible: false, reason: "legal_hold", retainUntil };
  if (!candidate.downstreamComplete) {
    return { eligible: false, reason: "downstream_incomplete", retainUntil };
  }
  if (now.getTime() < new Date(retainUntil).getTime()) {
    return { eligible: false, reason: "retention_active", retainUntil };
  }
  return { eligible: true, reason: "eligible", retainUntil };
}
