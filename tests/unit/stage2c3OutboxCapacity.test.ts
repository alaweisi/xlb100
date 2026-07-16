import { describe, expect, it, vi } from "vitest";
import type { CityCode, DispatchTask } from "@xlb/types";
import {
  OUTBOX_EVENT_CATALOG,
  OUTBOX_EVENT_TYPES,
  TRANSACTIONAL_OUTBOX_EVENT_TYPES,
  getOutboxEventCatalogEntry,
} from "../../backend/src/streams/outboxEventCatalog.js";
import { evaluateOutboxPurge } from "../../backend/src/streams/outboxRetentionPolicy.js";
import {
  DispatchStreamRebuilder,
  type DispatchStreamRebuildSource,
} from "../../backend/src/streams/dispatchStreamRebuilder.js";

function task(id: string): DispatchTask {
  return {
    dispatchTaskId: id, orderId: `ord_${id}`, cityCode: "hangzhou",
    customerId: "cust_1", skuId: "sku_1", amount: 100,
    sourceEventId: `evt_${id}`, streamName: "xlb:dispatch:hangzhou:orders",
    streamEntryId: null, status: "queued",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("stage2c3 outbox event catalog", () => {
  it("keeps one catalog entry for every declared event type", () => {
    expect(OUTBOX_EVENT_CATALOG).toHaveLength(OUTBOX_EVENT_TYPES.length);
    expect(new Set(OUTBOX_EVENT_CATALOG.map((entry) => entry.eventType)).size)
      .toBe(OUTBOX_EVENT_TYPES.length);
    expect(getOutboxEventCatalogEntry("order.created")).toMatchObject({
      mode: "transactional_consumer", owner: "dispatch",
    });
    expect(getOutboxEventCatalogEntry("conflict_audit")).toMatchObject({
      mode: "audit_record", owner: "data-governance", retentionClass: "financial_7y",
    });
    expect(TRANSACTIONAL_OUTBOX_EVENT_TYPES).toEqual([
      "order.created",
      "fulfillment.completed",
      "refund.approved",
    ]);
  });

  it("never purges non-terminal, held, incomplete or in-retention records", () => {
    const base = {
      eventType: "refund.approved" as const,
      status: "published" as const,
      createdAt: "2020-01-01T00:00:00.000Z",
      publishedAt: "2020-01-02T00:00:00.000Z",
      legalHold: false,
      downstreamComplete: true,
    };
    expect(evaluateOutboxPurge({ ...base, status: "pending" }, new Date("2030-01-01"))).toMatchObject({ reason: "non_terminal" });
    expect(evaluateOutboxPurge({ ...base, legalHold: true }, new Date("2030-01-01"))).toMatchObject({ reason: "legal_hold" });
    expect(evaluateOutboxPurge({ ...base, downstreamComplete: false }, new Date("2030-01-01"))).toMatchObject({ reason: "downstream_incomplete" });
    expect(evaluateOutboxPurge(base, new Date("2025-01-01"))).toMatchObject({ reason: "retention_active" });
    expect(evaluateOutboxPurge(base, new Date("2030-01-01"))).toMatchObject({ eligible: true, reason: "eligible" });
    expect(evaluateOutboxPurge({
      ...base,
      eventType: "conflict_audit",
      status: "pending",
      publishedAt: null,
    }, new Date("2030-01-01"))).toMatchObject({ eligible: true, reason: "eligible" });
  });
});

describe("stage2c3 MySQL to Redis rebuild", () => {
  it("pages active tasks and exposes a resumable cursor", async () => {
    const source: DispatchStreamRebuildSource = {
      listActive: vi.fn(async (_city: CityCode, after: string) => {
        if (!after) return [task("dt_1"), task("dt_2")];
        if (after === "dt_2") return [task("dt_3")];
        return [];
      }),
    };
    const publisher = { publishRebuilt: vi.fn().mockResolvedValue("1-0") };
    const rebuilder = new DispatchStreamRebuilder(source, publisher as never);

    const result = await rebuilder.rebuildCity({
      cityCode: "hangzhou", runId: "restore-20260715", batchSize: 2,
    });

    expect(result).toEqual({ rebuilt: 3, batches: 2, lastTaskId: "dt_3", complete: true });
    expect(publisher.publishRebuilt).toHaveBeenCalledTimes(3);
    expect(publisher.publishRebuilt).toHaveBeenLastCalledWith(
      expect.objectContaining({ dispatchTaskId: "dt_3" }), "restore-20260715",
    );
  });
});
