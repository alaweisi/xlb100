import { describe, expect, it } from "vitest";
import {
  preparationEnvelopeStatusSchema,
  preparationItemRecordSchema,
  preparationAuditEntrySchema,
  envelopeRecordSchema,
  createEnvelopeRequestSchema,
} from "@xlb/validators";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Preparation Record Schema Tests (vitest)
// Validates settlement execution preparation envelope/item/audit record shapes
// against the actual zod validators from @xlb/validators.
// ══════════════════════════════════════════════════════════════════

describe("Phase 12 — Preparation Record Schema", () => {
  describe("preparationEnvelopeStatusSchema", () => {
    it("accepts 'draft'", () => {
      expect(preparationEnvelopeStatusSchema.parse("draft")).toBe("draft");
    });

    it("accepts 'frozen'", () => {
      expect(preparationEnvelopeStatusSchema.parse("frozen")).toBe("frozen");
    });

    it("accepts 'approved_for_phase13_review'", () => {
      expect(preparationEnvelopeStatusSchema.parse("approved_for_phase13_review")).toBe("approved_for_phase13_review");
    });

    it("rejects forbidden status 'locked'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("locked")).toThrow();
    });

    it("rejects forbidden status 'archived'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("archived")).toThrow();
    });

    it("rejects forbidden status 'ready_for_execution'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("ready_for_execution")).toThrow();
    });

    it("rejects forbidden status 'approved_for_execution'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("approved_for_execution")).toThrow();
    });

    it("rejects forbidden status 'execution_approved'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("execution_approved")).toThrow();
    });

    it("rejects forbidden status 'ready_to_execute'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("ready_to_execute")).toThrow();
    });

    it("rejects forbidden status 'execute_ready'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("execute_ready")).toThrow();
    });

    it("rejects forbidden status 'payout_ready'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("payout_ready")).toThrow();
    });

    it("rejects forbidden status 'payment_ready'", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("payment_ready")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("")).toThrow();
    });

    it("rejects unknown status", () => {
      expect(() => preparationEnvelopeStatusSchema.parse("unknown")).toThrow();
    });
  });

  describe("createEnvelopeRequestSchema", () => {
    it("accepts valid request with sourcePacketId", () => {
      const result = createEnvelopeRequestSchema.parse({ sourcePacketId: "rp_xyz" });
      expect(result.sourcePacketId).toBe("rp_xyz");
    });

    it("rejects empty sourcePacketId", () => {
      expect(() => createEnvelopeRequestSchema.parse({ sourcePacketId: "" })).toThrow();
    });

    it("rejects extra fields", () => {
      expect(() => createEnvelopeRequestSchema.parse({ sourcePacketId: "rp_xyz", extra: true })).toThrow();
    });

    it("rejects missing sourcePacketId", () => {
      expect(() => createEnvelopeRequestSchema.parse({})).toThrow();
    });
  });

  describe("preparationItemRecordSchema", () => {
    it("accepts a valid item record", () => {
      const item = preparationItemRecordSchema.parse({
        id: "epi_1",
        envelopeId: "env_1",
        cityCode: "hz",
        itemType: "statement",
        itemRefId: "wrs_1",
        plannedAction: null,
        itemOrder: 0,
        createdAt: "2025-06-15T00:00:00.000Z",
      });
      expect(item.id).toBe("epi_1");
      expect(item.itemType).toBe("statement");
      expect(item.itemRefId).toBe("wrs_1");
      expect(item.plannedAction).toBeNull();
    });

    it("accepts null plannedAction", () => {
      const item = preparationItemRecordSchema.parse({
        id: "epi_1",
        envelopeId: "env_1",
        cityCode: "hz",
        itemType: "statement",
        itemRefId: "wrs_1",
        plannedAction: null,
        itemOrder: 0,
        createdAt: "2025-06-15T00:00:00.000Z",
      });
      expect(item.plannedAction).toBeNull();
    });

    it("rejects extra fields like settlementBatchId", () => {
      expect(() =>
        preparationItemRecordSchema.parse({
          id: "epi_1",
          envelopeId: "env_1",
          cityCode: "hz",
          itemType: "statement",
          itemRefId: "wrs_1",
          plannedAction: null,
          itemOrder: 0,
          createdAt: "2025-06-15T00:00:00.000Z",
          settlementBatchId: "stb_1",
        }),
      ).toThrow();
    });

    it("rejects extra fields like amount", () => {
      expect(() =>
        preparationItemRecordSchema.parse({
          id: "epi_1",
          envelopeId: "env_1",
          cityCode: "hz",
          itemType: "statement",
          itemRefId: "wrs_1",
          plannedAction: null,
          itemOrder: 0,
          createdAt: "2025-06-15T00:00:00.000Z",
          amount: 100,
        }),
      ).toThrow();
    });

    it("accepts item with non-null plannedAction", () => {
      const item = preparationItemRecordSchema.parse({
        id: "epi_2",
        envelopeId: "env_1",
        cityCode: "hz",
        itemType: "settlement_batch",
        itemRefId: "stb_1",
        plannedAction: "freeze",
        itemOrder: 1,
        createdAt: "2025-06-15T00:00:00.000Z",
      });
      expect(item.plannedAction).toBe("freeze");
    });

    it("rejects invalid cityCode", () => {
      expect(() =>
        preparationItemRecordSchema.parse({
          id: "epi_1",
          envelopeId: "env_1",
          cityCode: "",
          itemType: "statement",
          itemRefId: "wrs_1",
          plannedAction: null,
          itemOrder: 0,
          createdAt: "2025-06-15T00:00:00.000Z",
        }),
      ).toThrow();
    });
  });

  describe("preparationAuditEntrySchema", () => {
    it("accepts a valid audit entry", () => {
      const entry = preparationAuditEntrySchema.parse({
        id: "epa_1",
        envelopeId: "env_1",
        cityCode: "hz",
        eventType: "envelope_created",
        eventTimestamp: "2025-06-15T00:00:00.000Z",
        actorAdminId: "adm_1",
        summary: "Envelope created",
        traceId: "trc_1",
      });
      expect(entry.id).toBe("epa_1");
      expect(entry.eventType).toBe("envelope_created");
      expect(entry.actorAdminId).toBe("adm_1");
      expect(entry.summary).toBe("Envelope created");
      expect(entry.traceId).toBe("trc_1");
    });

    it("accepts null actorAdminId, summary, traceId", () => {
      const entry = preparationAuditEntrySchema.parse({
        id: "epa_1",
        envelopeId: "env_1",
        cityCode: "hz",
        eventType: "envelope_frozen",
        eventTimestamp: "2025-06-15T00:00:00.000Z",
        actorAdminId: null,
        summary: null,
        traceId: null,
      });
      expect(entry.actorAdminId).toBeNull();
      expect(entry.summary).toBeNull();
      expect(entry.traceId).toBeNull();
    });

    it("rejects extra fields like targetType", () => {
      expect(() =>
        preparationAuditEntrySchema.parse({
          id: "epa_1",
          envelopeId: "env_1",
          cityCode: "hz",
          eventType: "envelope_created",
          eventTimestamp: "2025-06-15T00:00:00.000Z",
          actorAdminId: "adm_1",
          summary: "Envelope created",
          traceId: "trc_1",
          targetType: "envelope",
        }),
      ).toThrow();
    });

    it("rejects extra fields like targetId", () => {
      expect(() =>
        preparationAuditEntrySchema.parse({
          id: "epa_1",
          envelopeId: "env_1",
          cityCode: "hz",
          eventType: "envelope_created",
          eventTimestamp: "2025-06-15T00:00:00.000Z",
          actorAdminId: "adm_1",
          summary: "Envelope created",
          traceId: "trc_1",
          targetId: "env_1",
        }),
      ).toThrow();
    });
  });

  describe("envelopeRecordSchema", () => {
    it("accepts a valid draft envelope", () => {
      const env = envelopeRecordSchema.parse({
        id: "env_1",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "draft",
        payloadHash: "sha256payloadhash",
        itemHash: null,
        sourcePacketHash: "sha256packethash",
        sourcePlanHash: "sha256planhash",
        amountSnapshot: {},
        cityConfigSnapshotHash: null,
        settlementCycleSnapshotHash: null,
        conflictCheckSnapshot: {},
        frozenAt: null,
        approvedAt: null,
        frozenByAdminId: null,
        approvedByAdminId: null,
        traceId: "trc_1",
        createdAt: "2025-06-15T00:00:00.000Z",
        updatedAt: "2025-06-15T00:00:00.000Z",
      });
      expect(env.envelopeStatus).toBe("draft");
      expect(env.frozenAt).toBeNull();
      expect(env.approvedAt).toBeNull();
    });

    it("accepts a valid frozen envelope", () => {
      const env = envelopeRecordSchema.parse({
        id: "env_1",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "frozen",
        payloadHash: "sha256payloadhash",
        itemHash: "sha256itemhash",
        sourcePacketHash: "sha256packethash",
        sourcePlanHash: "sha256planhash",
        amountSnapshot: { totalWorkerReceivable: 5000, statementCount: 3, statementIds: ["a", "b", "c"], queriedAt: "2025-06-15T00:00:00Z" },
        cityConfigSnapshotHash: "sha256confighash",
        settlementCycleSnapshotHash: "sha256cyclehash",
        conflictCheckSnapshot: { conflict_check_at: "2025-06-15T00:00:00Z" },
        frozenAt: "2025-06-15T12:00:00.000Z",
        approvedAt: null,
        frozenByAdminId: "adm_1",
        approvedByAdminId: null,
        traceId: "trc_1",
        createdAt: "2025-06-15T00:00:00.000Z",
        updatedAt: "2025-06-15T12:00:00.000Z",
      });
      expect(env.envelopeStatus).toBe("frozen");
      expect(env.frozenAt).toBe("2025-06-15T12:00:00.000Z");
      expect(env.frozenByAdminId).toBe("adm_1");
    });

    it("accepts a valid approved_for_phase13_review envelope", () => {
      const env = envelopeRecordSchema.parse({
        id: "env_1",
        cityCode: "hz",
        sourcePacketId: "rp_1",
        sourcePlanId: "drp_1",
        envelopeStatus: "approved_for_phase13_review",
        payloadHash: "sha256payloadhash",
        itemHash: "sha256itemhash",
        sourcePacketHash: "sha256packethash",
        sourcePlanHash: "sha256planhash",
        amountSnapshot: { totalWorkerReceivable: 5000, statementCount: 3, statementIds: ["a", "b", "c"], queriedAt: "2025-06-15T00:00:00Z" },
        cityConfigSnapshotHash: "sha256confighash",
        settlementCycleSnapshotHash: "sha256cyclehash",
        conflictCheckSnapshot: {},
        frozenAt: "2025-06-15T12:00:00.000Z",
        approvedAt: "2025-06-15T13:00:00.000Z",
        frozenByAdminId: "adm_1",
        approvedByAdminId: "adm_1",
        traceId: "trc_1",
        createdAt: "2025-06-15T00:00:00.000Z",
        updatedAt: "2025-06-15T13:00:00.000Z",
      });
      expect(env.envelopeStatus).toBe("approved_for_phase13_review");
      expect(env.approvedAt).toBe("2025-06-15T13:00:00.000Z");
      expect(env.approvedByAdminId).toBe("adm_1");
    });

    it("rejects frozen envelope with null frozenAt", () => {
      expect(() =>
        envelopeRecordSchema.parse({
          id: "env_1",
          cityCode: "hz",
          sourcePacketId: "rp_1",
          sourcePlanId: "drp_1",
          envelopeStatus: "frozen",
          payloadHash: "sha256payloadhash",
          itemHash: "sha256itemhash",
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenAt: null,
          approvedAt: null,
          frozenByAdminId: null,
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
        }),
      ).toThrow(/frozenAt must be set/);
    });

    it("rejects draft envelope with non-null frozenAt", () => {
      expect(() =>
        envelopeRecordSchema.parse({
          id: "env_1",
          cityCode: "hz",
          sourcePacketId: "rp_1",
          sourcePlanId: "drp_1",
          envelopeStatus: "draft",
          payloadHash: "sha256payloadhash",
          itemHash: null,
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenAt: "2025-06-15T12:00:00.000Z",
          approvedAt: null,
          frozenByAdminId: null,
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
        }),
      ).toThrow(/frozenAt must be null/);
    });

    it("rejects approved_for_phase13_review with null approvedAt", () => {
      expect(() =>
        envelopeRecordSchema.parse({
          id: "env_1",
          cityCode: "hz",
          sourcePacketId: "rp_1",
          sourcePlanId: "drp_1",
          envelopeStatus: "approved_for_phase13_review",
          payloadHash: "sha256payloadhash",
          itemHash: "sha256itemhash",
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenAt: "2025-06-15T12:00:00.000Z",
          approvedAt: null,
          frozenByAdminId: "adm_1",
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
        }),
      ).toThrow(/approvedAt must be set/);
    });

    it("rejects fields like intentId", () => {
      expect(() =>
        envelopeRecordSchema.parse({
          id: "env_1",
          cityCode: "hz",
          sourcePacketId: "rp_1",
          sourcePlanId: "drp_1",
          envelopeStatus: "draft",
          payloadHash: "sha256payloadhash",
          itemHash: null,
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenAt: null,
          approvedAt: null,
          frozenByAdminId: null,
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
          intentId: "gi_1",
        }),
      ).toThrow();
    });

    it("rejects fields like reviewId", () => {
      expect(() =>
        envelopeRecordSchema.parse({
          id: "env_1",
          cityCode: "hz",
          sourcePacketId: "rp_1",
          sourcePlanId: "drp_1",
          envelopeStatus: "draft",
          payloadHash: "sha256payloadhash",
          itemHash: null,
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenAt: null,
          approvedAt: null,
          frozenByAdminId: null,
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
          reviewId: "gr_1",
        }),
      ).toThrow();
    });

    it("rejects fields like evidenceBundleId", () => {
      expect(() =>
        envelopeRecordSchema.parse({
          id: "env_1",
          cityCode: "hz",
          sourcePacketId: "rp_1",
          sourcePlanId: "drp_1",
          envelopeStatus: "draft",
          payloadHash: "sha256payloadhash",
          itemHash: null,
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenAt: null,
          approvedAt: null,
          frozenByAdminId: null,
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
          evidenceBundleId: "eb_1",
        }),
      ).toThrow();
    });

    it("rejects fields like readinessPacketId", () => {
      expect(() =>
        envelopeRecordSchema.parse({
          id: "env_1",
          cityCode: "hz",
          sourcePacketId: "rp_1",
          sourcePlanId: "drp_1",
          envelopeStatus: "draft",
          payloadHash: "sha256payloadhash",
          itemHash: null,
          sourcePacketHash: "sha256packethash",
          sourcePlanHash: "sha256planhash",
          amountSnapshot: {},
          cityConfigSnapshotHash: null,
          settlementCycleSnapshotHash: null,
          conflictCheckSnapshot: {},
          frozenAt: null,
          approvedAt: null,
          frozenByAdminId: null,
          approvedByAdminId: null,
          traceId: null,
          createdAt: "2025-06-15T00:00:00.000Z",
          updatedAt: "2025-06-15T00:00:00.000Z",
          readinessPacketId: "rp_1",
        }),
      ).toThrow();
    });

    it("rejects forbidden statuses in envelopeStatus", () => {
      const forbidden = [
        "locked",
        "archived",
        "ready_for_execution",
        "approved_for_execution",
        "execution_approved",
        "ready_to_execute",
        "execute_ready",
        "payout_ready",
        "payment_ready",
      ];
      for (const status of forbidden) {
        expect(() =>
          envelopeRecordSchema.parse({
            id: "env_1",
            cityCode: "hz",
            sourcePacketId: "rp_1",
            sourcePlanId: "drp_1",
            envelopeStatus: status,
            payloadHash: "sha256payloadhash",
            itemHash: null,
            sourcePacketHash: "sha256packethash",
            sourcePlanHash: "sha256planhash",
            amountSnapshot: {},
            cityConfigSnapshotHash: null,
            settlementCycleSnapshotHash: null,
            conflictCheckSnapshot: {},
            frozenAt: status === "frozen" ? "2025-06-15T12:00:00.000Z" : null,
            approvedAt: null,
            frozenByAdminId: null,
            approvedByAdminId: null,
            traceId: null,
            createdAt: "2025-06-15T00:00:00.000Z",
            updatedAt: "2025-06-15T00:00:00.000Z",
          }),
        ).toThrow();
      }
    });
  });
});
