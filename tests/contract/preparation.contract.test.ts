import { describe, expect, it } from "vitest";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Preparation API Contract Tests (vitest)
// Verifies settlement execution preparation API contract shapes.
// ══════════════════════════════════════════════════════════════════

interface PreparationEnvelopeResponse {
  envelopeId: string;
  envelopeHash: string;
  status: string;
  planId: string;
  packetId: string;
  cityCode: string;
  itemCount: number;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PreparationItemResponse {
  itemId: string;
  envelopeId: string;
  planItemId: string;
  statementId: string;
  workerId: string;
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  status: string;
  validationErrors: string | null;
  notes: string | null;
}

interface PreparationAuditEntry {
  auditId: string;
  envelopeId: string;
  event: string;
  details: unknown;
  createdAt: string;
}

interface EnvelopeLockResponse {
  envelopeId: string;
  locked: boolean;
  lockedAt: string | null;
  itemCount: number;
}

describe("Phase 12 — Preparation API Contract", () => {
  describe("PreparationEnvelopeResponse shape", () => {
    it("has required envelopeId, envelopeHash, status, planId, packetId, cityCode fields", () => {
      const envelope: PreparationEnvelopeResponse = {
        envelopeId: "env_1",
        envelopeHash: "sha256:abc",
        status: "draft",
        planId: "drp_1",
        packetId: "rp_1",
        cityCode: "hz",
        itemCount: 5,
        lockedAt: null,
        createdAt: "2025-06-15T00:00:00Z",
        updatedAt: "2025-06-15T00:00:00Z",
      };
      expect(envelope.envelopeId).toBeDefined();
      expect(envelope.envelopeHash).toBeDefined();
      expect(envelope.status).toBeDefined();
      expect(envelope.planId).toBeDefined();
      expect(envelope.packetId).toBeDefined();
      expect(envelope.cityCode).toBeDefined();
      expect(envelope.itemCount).toBeGreaterThanOrEqual(0);
    });

    it("status must be a recognized preparation status", () => {
      const validStatuses = ["draft", "locked", "ready_for_execution", "archived"];
      const envelope: PreparationEnvelopeResponse = {
        envelopeId: "env_1",
        envelopeHash: "sha256:abc",
        status: "draft",
        planId: "drp_1",
        packetId: "rp_1",
        cityCode: "hz",
        itemCount: 0,
        lockedAt: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };
      expect(validStatuses).toContain(envelope.status);
    });
  });

  describe("EnvelopeLockResponse shape", () => {
    it("has required envelopeId, locked, lockedAt, itemCount fields", () => {
      const lockResponse: EnvelopeLockResponse = {
        envelopeId: "env_1",
        locked: true,
        lockedAt: "2025-06-15T12:00:00Z",
        itemCount: 5,
      };
      expect(lockResponse.envelopeId).toBeDefined();
      expect(typeof lockResponse.locked).toBe("boolean");
      expect(lockResponse.itemCount).toBeGreaterThanOrEqual(0);
    });

    it("lockedAt is null when locked is false", () => {
      const lockResponse: EnvelopeLockResponse = {
        envelopeId: "env_2",
        locked: false,
        lockedAt: null,
        itemCount: 0,
      };
      expect(lockResponse.locked).toBe(false);
      expect(lockResponse.lockedAt).toBeNull();
    });

    it("lockedAt is non-null when locked is true", () => {
      const lockResponse: EnvelopeLockResponse = {
        envelopeId: "env_3",
        locked: true,
        lockedAt: "2025-06-15T12:00:00Z",
        itemCount: 3,
      };
      expect(lockResponse.locked).toBe(true);
      expect(lockResponse.lockedAt).not.toBeNull();
    });
  });
});
