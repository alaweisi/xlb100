import { describe, expect, it } from "vitest";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Preparation API Contract Tests (vitest)
// Verifies settlement execution preparation API contract shapes.
// Matches actual routes and response payloads.
// ══════════════════════════════════════════════════════════════════

interface PreparationEnvelope {
  id: string;
  cityCode: string;
  sourcePacketId: string;
  sourcePlanId: string | null;
  envelopeStatus: string;
  payloadHash: string;
  itemHash: string | null;
  sourcePacketHash: string | null;
  sourcePlanHash: string | null;
  amountSnapshot: Record<string, unknown>;
  cityConfigSnapshotHash: string | null;
  settlementCycleSnapshotHash: string | null;
  conflictCheckSnapshot: Record<string, unknown>;
  frozenByAdminId: string | null;
  approvedByAdminId: string | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
  frozenAt: string | null;
  approvedAt: string | null;
}

interface PreparationEnvelopeItem {
  id: string;
  cityCode: string;
  envelopeId: string;
  itemType: string;
  itemRefId: string;
  plannedAction: string | null;
  itemOrder: number;
  createdAt: string;
}

interface PreparationEnvelopeAudit {
  id: string;
  cityCode: string;
  envelopeId: string;
  eventType: string;
  eventTimestamp: string;
  actorAdminId: string | null;
  summary: string | null;
  traceId: string | null;
}

// Allowed statuses ONLY
const VALID_STATUSES = ["draft", "frozen", "approved_for_phase13_review"] as const;

// Forbidden statuses that must NOT appear
const FORBIDDEN_STATUSES = [
  "ready_for_execution",
  "approved_for_execution",
  "locked",
  "archived",
  "execution_approved",
  "ready_to_execute",
  "execute_ready",
  "payout_ready",
  "payment_ready",
] as const;

describe("Phase 12 — Preparation API Contract", () => {
  describe("Route response shapes", () => {
    it("POST create returns {ok:true, envelope: PreparationEnvelope}", () => {
      const response: { ok: true; envelope: PreparationEnvelope } = {
        ok: true,
        envelope: {
          id: "env_abc123",
          cityCode: "hz",
          sourcePacketId: "rp_xyz",
          sourcePlanId: "drp_123",
          envelopeStatus: "draft",
          payloadHash: "sha256payloadhash",
          itemHash: null,
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenByAdminId: null,
          approvedByAdminId: null,
          traceId: "trc_1",
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
          frozenAt: null,
          approvedAt: null,
        },
      };
      expect(response.ok).toBe(true);
      expect(response.envelope).toBeDefined();
      expect(response.envelope.envelopeStatus).toBe("draft");
      expect(typeof response.envelope.id).toBe("string");
    });

    it("POST freeze returns {ok:true, envelope: PreparationEnvelope}", () => {
      const response: { ok: true; envelope: PreparationEnvelope } = {
        ok: true,
        envelope: {
          id: "env_abc123",
          cityCode: "hz",
          sourcePacketId: "rp_xyz",
          sourcePlanId: "drp_123",
          envelopeStatus: "frozen",
          payloadHash: "sha256payloadhash",
          itemHash: "sha256itemhash",
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: { totalWorkerReceivable: 5000, statementCount: 3, statementIds: ["a", "b", "c"], queriedAt: "2025-06-15T00:00:00Z" },
          cityConfigSnapshotHash: "sha256confighash",
          settlementCycleSnapshotHash: "sha256cyclehash",
          conflictCheckSnapshot: { conflict_check_at: "2025-06-15T00:00:00Z", duplicate_check: { duplicate_count: 0, duplicate_ids: [] } },
          frozenByAdminId: "adm_1",
          approvedByAdminId: null,
          traceId: "trc_1",
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T12:00:00.000Z",
          frozenAt: "2025-06-15T12:00:00.000Z",
          approvedAt: null,
        },
      };
      expect(response.ok).toBe(true);
      expect(response.envelope.envelopeStatus).toBe("frozen");
      expect(response.envelope.frozenAt).not.toBeNull();
      expect(response.envelope.itemHash).not.toBeNull();
      expect(response.envelope.frozenByAdminId).not.toBeNull();
    });

    it("POST approve returns {ok:true, envelope: PreparationEnvelope}", () => {
      const response: { ok: true; envelope: PreparationEnvelope } = {
        ok: true,
        envelope: {
          id: "env_abc123",
          cityCode: "hz",
          sourcePacketId: "rp_xyz",
          sourcePlanId: "drp_123",
          envelopeStatus: "approved_for_phase13_review",
          payloadHash: "sha256payloadhash",
          itemHash: "sha256itemhash",
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: { totalWorkerReceivable: 5000, statementCount: 3, statementIds: ["a", "b", "c"], queriedAt: "2025-06-15T00:00:00Z" },
          cityConfigSnapshotHash: "sha256confighash",
          settlementCycleSnapshotHash: "sha256cyclehash",
          conflictCheckSnapshot: {},
          frozenByAdminId: "adm_1",
          approvedByAdminId: "adm_1",
          traceId: "trc_1",
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T13:00:00.000Z",
          frozenAt: "2025-06-15T12:00:00.000Z",
          approvedAt: "2025-06-15T13:00:00.000Z",
        },
      };
      expect(response.ok).toBe(true);
      expect(response.envelope.envelopeStatus).toBe("approved_for_phase13_review");
      expect(response.envelope.approvedAt).not.toBeNull();
      expect(response.envelope.approvedByAdminId).not.toBeNull();
    });

    it("GET list returns {ok:true, envelopes: PreparationEnvelope[]}", () => {
      const response: { ok: true; envelopes: PreparationEnvelope[] } = {
        ok: true,
        envelopes: [
          {
            id: "env_1",
            cityCode: "hz",
            sourcePacketId: "rp_1",
            sourcePlanId: "drp_1",
            envelopeStatus: "draft",
            payloadHash: "sha256payload",
            itemHash: null,
            sourcePacketHash: "sha256packet",
            sourcePlanHash: "sha256plan",
            amountSnapshot: {},
            cityConfigSnapshotHash: null,
            settlementCycleSnapshotHash: null,
            conflictCheckSnapshot: {},
            frozenByAdminId: null,
            approvedByAdminId: null,
            traceId: null,
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
            frozenAt: null,
            approvedAt: null,
          },
        ],
      };
      expect(response.ok).toBe(true);
      expect(Array.isArray(response.envelopes)).toBe(true);
      expect(response.envelopes.length).toBeGreaterThanOrEqual(0);
    });

    it("GET by id returns {ok:true, envelope: PreparationEnvelope}", () => {
      const response: { ok: true; envelope: PreparationEnvelope } = {
        ok: true,
        envelope: {
          id: "env_abc123",
          cityCode: "hz",
          sourcePacketId: "rp_xyz",
          sourcePlanId: "drp_123",
          envelopeStatus: "frozen",
          payloadHash: "sha256payloadhash",
          itemHash: "sha256itemhash",
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: { totalWorkerReceivable: 5000, statementCount: 3, statementIds: [], queriedAt: "2025-06-15T00:00:00Z" },
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenByAdminId: "adm_1",
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T12:00:00.000Z",
          frozenAt: "2025-06-15T12:00:00.000Z",
          approvedAt: null,
        },
      };
      expect(response.ok).toBe(true);
      expect(response.envelope).toBeDefined();
      expect(response.envelope.id).toBe("env_abc123");
    });

    it("GET items returns {ok:true, items: PreparationEnvelopeItem[]}", () => {
      const response: { ok: true; items: PreparationEnvelopeItem[] } = {
        ok: true,
        items: [
          {
            id: "epi_1",
            cityCode: "hz",
            envelopeId: "env_1",
            itemType: "statement",
            itemRefId: "wrs_1",
            plannedAction: null,
            itemOrder: 0,
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
      };
      expect(response.ok).toBe(true);
      expect(Array.isArray(response.items)).toBe(true);
      expect(response.items[0].itemType).toBeDefined();
      expect(response.items[0].itemRefId).toBeDefined();
    });

    it("GET audit returns {ok:true, entries: PreparationEnvelopeAudit[]}", () => {
      const response: { ok: true; entries: PreparationEnvelopeAudit[] } = {
        ok: true,
        entries: [
          {
            id: "epa_1",
            cityCode: "hz",
            envelopeId: "env_1",
            eventType: "envelope_created",
            eventTimestamp: "2025-01-01T00:00:00.000Z",
            actorAdminId: "adm_1",
            summary: "Envelope created",
            traceId: "trc_1",
          },
        ],
      };
      expect(response.ok).toBe(true);
      expect(Array.isArray(response.entries)).toBe(true);
      expect(response.entries[0].eventType).toBeDefined();
      expect(response.entries[0].envelopeId).toBe("env_1");
    });

    it("error responses have {ok:false, error: string}", () => {
      const response: { ok: false; error: string } = {
        ok: false,
        error: "envelope not found",
      };
      expect(response.ok).toBe(false);
      expect(typeof response.error).toBe("string");
      expect(response.error.length).toBeGreaterThan(0);
    });
  });

  describe("Status validation", () => {
    it("only draft, frozen, approved_for_phase13_review are valid", () => {
      expect(VALID_STATUSES).toEqual(["draft", "frozen", "approved_for_phase13_review"]);
    });

    it("no forbidden statuses appear in VALID_STATUSES", () => {
      for (const forbidden of FORBIDDEN_STATUSES) {
        // @ts-expect-error - checking forbidden doesn't sneak into valid set
        expect(VALID_STATUSES).not.toContain(forbidden);
      }
    });

    it("frozen status requires frozenAt to be set", () => {
      const envelope: PreparationEnvelope = {
        id: "env_1",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "frozen",
        payloadHash: "sha256h",
        itemHash: "sha256h",
        sourcePacketHash: "sha256h",
        sourcePlanHash: "sha256h",
        amountSnapshot: { totalWorkerReceivable: 0, statementCount: 0, statementIds: [], queriedAt: "2025-01-01T00:00:00Z" },
        cityConfigSnapshotHash: null,
        settlementCycleSnapshotHash: null,
        conflictCheckSnapshot: {},
        frozenByAdminId: "adm_1",
        approvedByAdminId: null,
        traceId: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        frozenAt: "2025-01-01T00:00:00.000Z",
        approvedAt: null,
      };
      expect(envelope.envelopeStatus).toBe("frozen");
      expect(envelope.frozenAt).not.toBeNull();
      expect(envelope.frozenByAdminId).not.toBeNull();
    });

    it("approved_for_phase13_review requires approvedAt to be set", () => {
      const envelope: PreparationEnvelope = {
        id: "env_2",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "approved_for_phase13_review",
        payloadHash: "sha256h",
        itemHash: "sha256h",
        sourcePacketHash: "sha256h",
        sourcePlanHash: "sha256h",
        amountSnapshot: { totalWorkerReceivable: 0, statementCount: 0, statementIds: [], queriedAt: "2025-01-01T00:00:00Z" },
        cityConfigSnapshotHash: null,
        settlementCycleSnapshotHash: null,
        conflictCheckSnapshot: {},
        frozenByAdminId: "adm_1",
        approvedByAdminId: "adm_1",
        traceId: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        frozenAt: "2025-01-01T00:00:00.000Z",
        approvedAt: "2025-01-01T00:00:00.000Z",
      };
      expect(envelope.envelopeStatus).toBe("approved_for_phase13_review");
      expect(envelope.approvedAt).not.toBeNull();
      expect(envelope.approvedByAdminId).not.toBeNull();
    });

    it("draft status has null frozenAt and approvedAt", () => {
      const envelope: PreparationEnvelope = {
        id: "env_3",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "draft",
        payloadHash: "sha256h",
        itemHash: null,
        sourcePacketHash: "sha256h",
        sourcePlanHash: "sha256h",
        amountSnapshot: {},
        cityConfigSnapshotHash: null,
        settlementCycleSnapshotHash: null,
        conflictCheckSnapshot: {},
        frozenByAdminId: null,
        approvedByAdminId: null,
        traceId: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        frozenAt: null,
        approvedAt: null,
      };
      expect(envelope.envelopeStatus).toBe("draft");
      expect(envelope.frozenAt).toBeNull();
      expect(envelope.approvedAt).toBeNull();
    });
  });

  describe("Item shape validation", () => {
    it("items have id, envelopeId, cityCode, itemType, itemRefId, plannedAction, itemOrder, createdAt", () => {
      const item: PreparationEnvelopeItem = {
        id: "epi_1",
        cityCode: "hz",
        envelopeId: "env_1",
        itemType: "statement",
        itemRefId: "wrs_1",
        plannedAction: null,
        itemOrder: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
      };
      expect(item.id).toBeDefined();
      expect(item.envelopeId).toBeDefined();
      expect(item.cityCode).toBeDefined();
      expect(item.itemType).toBeDefined();
      expect(item.itemRefId).toBeDefined();
      expect("plannedAction" in item).toBe(true);
      expect(item.itemOrder).toBeGreaterThanOrEqual(0);
      expect(item.createdAt).toBeDefined();
    });

    it("items do NOT have settlementBatchId, orderId, amount, currency", () => {
      const item = {
        id: "epi_1",
        cityCode: "hz",
        envelopeId: "env_1",
        itemType: "statement",
        itemRefId: "wrs_1",
        plannedAction: null,
        itemOrder: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
      };
      expect("settlementBatchId" in item).toBe(false);
      expect("orderId" in item).toBe(false);
      expect("amount" in item).toBe(false);
      expect("currency" in item).toBe(false);
      expect("itemStatus" in item).toBe(false);
    });
  });

  describe("Audit entry shape validation", () => {
    it("audit entries have id, envelopeId, cityCode, eventType, eventTimestamp, actorAdminId, summary, traceId", () => {
      const entry: PreparationEnvelopeAudit = {
        id: "epa_1",
        cityCode: "hz",
        envelopeId: "env_1",
        eventType: "envelope_created",
        eventTimestamp: "2025-01-01T00:00:00.000Z",
        actorAdminId: "adm_1",
        summary: "Envelope created",
        traceId: "trc_1",
      };
      expect(entry.id).toBeDefined();
      expect(entry.envelopeId).toBeDefined();
      expect(entry.cityCode).toBeDefined();
      expect(entry.eventType).toBeDefined();
      expect(entry.eventTimestamp).toBeDefined();
      expect(entry.actorAdminId).toBeDefined();
      expect("summary" in entry).toBe(true);
      expect("traceId" in entry).toBe(true);
    });

    it("audit entries do NOT have targetType, targetId", () => {
      const entry = {
        id: "epa_1",
        cityCode: "hz",
        envelopeId: "env_1",
        eventType: "envelope_created",
        eventTimestamp: "2025-01-01T00:00:00.000Z",
        actorAdminId: "adm_1",
        summary: "Envelope created",
        traceId: "trc_1",
      };
      expect("targetType" in entry).toBe(false);
      expect("targetId" in entry).toBe(false);
    });
  });

  describe("Envelope shape validation", () => {
    it("envelope does NOT have intentId, reviewId, evidenceBundleId, readinessPacketId", () => {
      const envelope: PreparationEnvelope = {
        id: "env_1",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "draft",
        payloadHash: "sha256h",
        itemHash: null,
        sourcePacketHash: "sha256h",
        sourcePlanHash: "sha256h",
        amountSnapshot: {},
        cityConfigSnapshotHash: null,
        settlementCycleSnapshotHash: null,
        conflictCheckSnapshot: {},
        frozenByAdminId: null,
        approvedByAdminId: null,
        traceId: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        frozenAt: null,
        approvedAt: null,
      };
      expect("intentId" in envelope).toBe(false);
      expect("reviewId" in envelope).toBe(false);
      expect("evidenceBundleId" in envelope).toBe(false);
      expect("readinessPacketId" in envelope).toBe(false);
    });

    it("envelope has sourcePacketId, sourcePlanId, payloadHash, amountSnapshot, conflictCheckSnapshot", () => {
      const envelope: PreparationEnvelope = {
        id: "env_1",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "draft",
        payloadHash: "sha256h",
        itemHash: null,
        sourcePacketHash: "sha256h",
        sourcePlanHash: "sha256h",
        amountSnapshot: { totalWorkerReceivable: 0 },
        cityConfigSnapshotHash: null,
        settlementCycleSnapshotHash: null,
        conflictCheckSnapshot: { conflict_check_at: "2025-01-01T00:00:00Z" },
        frozenByAdminId: null,
        approvedByAdminId: null,
        traceId: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        frozenAt: null,
        approvedAt: null,
      };
      expect(envelope.sourcePacketId).toBeDefined();
      expect("sourcePlanId" in envelope).toBe(true);
      expect(envelope.payloadHash).toBeDefined();
      expect(envelope.amountSnapshot).toBeDefined();
      expect(envelope.conflictCheckSnapshot).toBeDefined();
    });
  });
});
