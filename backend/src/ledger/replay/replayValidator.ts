import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode, EventOutbox, RequestContext } from "@xlb/types";
import { stableHash } from "@xlb/shared/deterministic/stableHash.js";
import { getMysqlPool } from "../../dal/mysqlPool.js";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import type {
  LedgerAuditRecord,
  EventOutboxAuditPayload,
} from "../auditGate.js";
import type { LedgerSingleWriteFeeType } from "../ledgerRepository.js";

type OutboxReplayRow = RowDataPacket & {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  city_code: string;
  payload_json: string | Record<string, unknown>;
  status: string;
  created_at: Date;
  published_at: Date | null;
};

type LedgerEntryReplayRow = RowDataPacket & {
  entry_id: string;
  city_code: string;
  source_type: string;
  source_id: string;
  direction: string;
  account_type: string;
  amount: string;
  currency: string;
  order_id: string | null;
};

type ReplayedLedgerEntry = {
  entry_id: string;
  audit: LedgerAuditRecord;
};

type PersistedLedgerEntry = {
  entry_id: string;
  order_id: string | null;
  fee_type: LedgerSingleWriteFeeType | null;
  source_type: string;
  source_id: string;
  snapshot_hash: string | null;
};

export type LedgerReplayDiff = {
  kind:
    | "duplicate_replayed_entry"
    | "invalid_audit_payload"
    | "missing_persisted_entry"
    | "missing_replayed_entry"
    | "snapshot_hash_mismatch"
    | "unsupported_persisted_entry";
  entry_id?: string;
  order_id?: string | null;
  fee_type?: LedgerSingleWriteFeeType | null;
  source_type?: string;
  expected_snapshot_hash?: string;
  actual_snapshot_hash?: string | null;
  reason?: string;
};

export type LedgerReplayValidationResult = {
  match: boolean;
  diff: LedgerReplayDiff[];
};

export type LedgerReplayState = {
  entries: Map<string, ReplayedLedgerEntry>;
  diff: LedgerReplayDiff[];
};

export class LedgerReplayValidator {
  constructor(private readonly pool: Pool = getMysqlPool()) {}

  async validate(
    context: RequestContext,
    eventStream?: EventOutbox[],
  ): Promise<LedgerReplayValidationResult> {
    const cityCode = assertCityScopedContext(context);
    const events = eventStream ?? (await this.loadEventStream(cityCode));
    const replayed = replayLedgerState(events, cityCode);
    const persisted = await this.loadPersistedLedgerEntries(cityCode);
    const diff = [
      ...replayed.diff,
      ...compareReplayedToPersisted(replayed.entries, persisted),
    ];

    return {
      match: diff.length === 0,
      diff,
    };
  }

  private async loadEventStream(cityCode: CityCode): Promise<EventOutbox[]> {
    const [rows] = await this.pool.query<OutboxReplayRow[]>(
      `SELECT event_id, event_type, aggregate_type, aggregate_id, city_code,
              payload_json, status, created_at, published_at
       FROM event_outbox
       WHERE city_code = ?
       ORDER BY created_at ASC, event_id ASC`,
      [cityCode],
    );

    return rows.map(mapOutboxReplayRow);
  }

  private async loadPersistedLedgerEntries(
    cityCode: CityCode,
  ): Promise<Map<string, PersistedLedgerEntry>> {
    const [rows] = await this.pool.query<LedgerEntryReplayRow[]>(
      `SELECT le.entry_id, le.city_code, le.source_type, le.source_id,
              le.direction, le.account_type, le.amount, le.currency,
              la.order_id
       FROM ledger_entries le
       LEFT JOIN ledger_accruals la
         ON la.city_code = le.city_code
        AND la.fulfillment_id = le.source_id
       WHERE le.city_code = ?
       ORDER BY le.created_at ASC, le.entry_id ASC`,
      [cityCode],
    );

    const entries = new Map<string, PersistedLedgerEntry>();
    for (const row of rows) {
      const feeType = resolveFeeType(row);
      entries.set(row.entry_id, {
        entry_id: row.entry_id,
        order_id: row.order_id,
        fee_type: feeType,
        source_type: row.source_type,
        source_id: row.source_id,
        snapshot_hash:
          feeType && row.order_id
            ? stableHash({
                city_code: row.city_code,
                order_id: row.order_id,
                fee_type: feeType,
                source_type: row.source_type,
                source_id: row.source_id,
                amount: Number(row.amount),
                currency: row.currency,
              })
            : null,
      });
    }

    return entries;
  }
}

export function replayLedgerState(
  eventStream: EventOutbox[],
  cityCode: CityCode,
): LedgerReplayState {
  const entries = new Map<string, ReplayedLedgerEntry>();
  const diff: LedgerReplayDiff[] = [];

  for (const event of eventStream) {
    if (event.cityCode !== cityCode) {
      diff.push({
        kind: "invalid_audit_payload",
        entry_id: event.aggregateId,
        reason: "event city_code does not match replay city",
      });
      continue;
    }
    if (
      event.eventType !== "conflict_audit" ||
      event.aggregateType !== "ledger_entry"
    ) {
      continue;
    }

    const audit = toLedgerAuditRecord(event);
    if (!audit) {
      diff.push({
        kind: "invalid_audit_payload",
        entry_id: event.aggregateId,
        reason: "conflict audit payload is incomplete",
      });
      continue;
    }

    if (entries.has(event.aggregateId)) {
      diff.push({
        kind: "duplicate_replayed_entry",
        entry_id: event.aggregateId,
        order_id: audit.order_id,
        fee_type: audit.fee_type,
        source_type: audit.source_type,
        expected_snapshot_hash: audit.snapshot_hash,
      });
      continue;
    }

    entries.set(event.aggregateId, {
      entry_id: event.aggregateId,
      audit,
    });
  }

  return { entries, diff };
}

export function compareReplayedToPersisted(
  replayed: Map<string, ReplayedLedgerEntry>,
  persisted: Map<string, PersistedLedgerEntry>,
): LedgerReplayDiff[] {
  const diff: LedgerReplayDiff[] = [];

  for (const [entryId, replayedEntry] of replayed) {
    const persistedEntry = persisted.get(entryId);
    if (!persistedEntry) {
      diff.push({
        kind: "missing_persisted_entry",
        entry_id: entryId,
        order_id: replayedEntry.audit.order_id,
        fee_type: replayedEntry.audit.fee_type,
        source_type: replayedEntry.audit.source_type,
        expected_snapshot_hash: replayedEntry.audit.snapshot_hash,
      });
      continue;
    }

    if (!persistedEntry.snapshot_hash) {
      diff.push({
        kind: "unsupported_persisted_entry",
        entry_id: entryId,
        order_id: persistedEntry.order_id,
        fee_type: persistedEntry.fee_type,
        source_type: persistedEntry.source_type,
        expected_snapshot_hash: replayedEntry.audit.snapshot_hash,
        actual_snapshot_hash: null,
        reason: "persisted entry cannot be reduced to a ledger audit snapshot",
      });
      continue;
    }

    if (persistedEntry.snapshot_hash !== replayedEntry.audit.snapshot_hash) {
      diff.push({
        kind: "snapshot_hash_mismatch",
        entry_id: entryId,
        order_id: persistedEntry.order_id,
        fee_type: persistedEntry.fee_type,
        source_type: persistedEntry.source_type,
        expected_snapshot_hash: replayedEntry.audit.snapshot_hash,
        actual_snapshot_hash: persistedEntry.snapshot_hash,
      });
    }
  }

  for (const [entryId, persistedEntry] of persisted) {
    if (!replayed.has(entryId)) {
      diff.push({
        kind: "missing_replayed_entry",
        entry_id: entryId,
        order_id: persistedEntry.order_id,
        fee_type: persistedEntry.fee_type,
        source_type: persistedEntry.source_type,
        actual_snapshot_hash: persistedEntry.snapshot_hash,
      });
    }
  }

  return diff;
}

function mapOutboxReplayRow(row: OutboxReplayRow): EventOutbox {
  const payload =
    typeof row.payload_json === "string"
      ? (JSON.parse(row.payload_json) as Record<string, unknown>)
      : row.payload_json;

  return {
    eventId: row.event_id,
    eventType: row.event_type as EventOutbox["eventType"],
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    cityCode: row.city_code as CityCode,
    payload,
    status: row.status as EventOutbox["status"],
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
  };
}

function toLedgerAuditRecord(event: EventOutbox): LedgerAuditRecord | null {
  const payload = event.payload as Partial<EventOutboxAuditPayload>;
  if (
    typeof payload.order_id !== "string" ||
    !isLedgerFeeType(payload.fee_type) ||
    typeof payload.source_type !== "string" ||
    typeof payload.snapshot_hash !== "string"
  ) {
    return null;
  }

  return {
    order_id: payload.order_id,
    fee_type: payload.fee_type,
    source_type: payload.source_type,
    snapshot_hash: payload.snapshot_hash,
    created_at: event.createdAt,
  };
}

function resolveFeeType(
  row: LedgerEntryReplayRow,
): LedgerSingleWriteFeeType | null {
  if (row.source_type === "refund.approved") {
    if (row.account_type === "customer" && row.direction === "credit") {
      return "gross";
    }
    if (row.account_type === "platform" && row.direction === "debit") {
      return "platform_fee";
    }
    if (row.account_type === "worker" && row.direction === "debit") {
      return "worker_receivable";
    }
    return null;
  }
  if (row.account_type === "customer" && row.direction === "debit") {
    return "gross";
  }
  if (row.account_type === "platform" && row.direction === "credit") {
    return "platform_fee";
  }
  if (row.account_type === "worker" && row.direction === "credit") {
    return "worker_receivable";
  }
  return null;
}

function isLedgerFeeType(value: unknown): value is LedgerSingleWriteFeeType {
  return (
    value === "gross" ||
    value === "platform_fee" ||
    value === "worker_receivable"
  );
}

export const ledgerReplayValidator = new LedgerReplayValidator();
