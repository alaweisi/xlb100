import type { PoolConnection } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import { stableHash } from "@shared/deterministic/stableHash.js";
import { generateEventId } from "../events/eventIds.js";
import type { EventOutboxRepository } from "../events/eventOutbox.js";
import type { LedgerSingleWriteFeeType } from "./ledgerRepository.js";

export type LedgerAuditItem = {
  orderId: string;
  feeType: LedgerSingleWriteFeeType;
  aggregateType: string;
  aggregateId: string;
  snapshot: Record<string, unknown>;
};

export type LedgerAuditContext = {
  connection: PoolConnection;
  outbox: EventOutboxRepository;
  cityCode: CityCode;
  sourceType: string;
  items: LedgerAuditItem[];
};

export type LedgerAuditRecord = {
  order_id: string;
  fee_type: LedgerSingleWriteFeeType;
  source_type: string;
  snapshot_hash: string;
  created_at: string;
};

export type EventOutboxAuditPayload = {
  order_id: string;
  fee_type: LedgerSingleWriteFeeType;
  source_type: string;
  snapshot_hash: string;
};

export function toEventOutboxAuditPayload(
  record: LedgerAuditRecord,
): EventOutboxAuditPayload {
  return {
    order_id: record.order_id,
    fee_type: record.fee_type,
    source_type: record.source_type,
    snapshot_hash: record.snapshot_hash,
  };
}

function buildLedgerAuditRecord(
  context: LedgerAuditContext,
  item: LedgerAuditItem,
): LedgerAuditRecord {
  return {
    order_id: item.orderId,
    fee_type: item.feeType,
    source_type: context.sourceType,
    snapshot_hash: stableHash(item.snapshot),
    created_at: new Date().toISOString(),
  };
}

export async function recordLedgerAudit(
  context: LedgerAuditContext,
): Promise<void> {
  for (const item of context.items) {
    const record = buildLedgerAuditRecord(context, item);

    await context.outbox.insertEvent(context.connection, {
      eventId: generateEventId(),
      eventType: "conflict_audit",
      aggregateType: item.aggregateType,
      aggregateId: item.aggregateId,
      cityCode: context.cityCode,
      payload: toEventOutboxAuditPayload(record),
    });
  }
}
