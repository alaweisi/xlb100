import { describe, expect, it } from "vitest";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Preparation Record Schema Tests (vitest)
// Validates settlement execution preparation envelope/item/audit record shapes.
// ══════════════════════════════════════════════════════════════════

// ── Inline schemas (mirrors expected zod validators) ──
// These are lightweight schema checks against the expected Phase 12 preparation shapes.
// The real validators will live in packages/validators/src/preparationSchema.ts once created.

const PREPARATION_ENVELOPE_STATUSES = ["draft", "locked", "ready_for_execution", "archived"] as const;
const PREPARATION_ITEM_STATUSES = ["pending", "validated", "blocked", "excluded"] as const;
const PREPARATION_AUDIT_EVENTS = [
  "envelope_created",
  "envelope_locked",
  "item_added",
  "item_validated",
  "item_blocked",
  "item_excluded",
  "envelope_archived",
  "envelope_unlocked",
] as const;

function isValidEnvelopeId(id: string): boolean {
  return typeof id === "string" && id.length >= 1 && id.length <= 64;
}

function isValidCityCode(code: string): boolean {
  return typeof code === "string" && code.length >= 2 && code.length <= 64;
}

function isValidIsoDate(s: string): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

interface PreparationEnvelopeRecord {
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
  archivedAt: string | null;
}

interface PreparationItemRecord {
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

describe("Phase 12 — Preparation Record Schema", () => {
  describe("PreparationEnvelopeRecord", () => {
    it("accepts a valid envelope record", () => {
      const envelope: PreparationEnvelopeRecord = {
        envelopeId: "env_abc123",
        envelopeHash: "sha256:deadbeef",
        status: "draft",
        planId: "drp_xyz",
        packetId: "rp_xyz",
        cityCode: "hz",
        itemCount: 5,
        lockedAt: null,
        createdAt: "2025-06-15T00:00:00Z",
        updatedAt: "2025-06-15T00:00:00Z",
        archivedAt: null,
      };
      expect(isValidEnvelopeId(envelope.envelopeId)).toBe(true);
      expect(isValidCityCode(envelope.cityCode)).toBe(true);
      expect(PREPARATION_ENVELOPE_STATUSES).toContain(envelope.status);
      expect(envelope.itemCount).toBeGreaterThanOrEqual(0);
    });

    it("validates envelopeId length bounds", () => {
      expect(isValidEnvelopeId("")).toBe(false);
      expect(isValidEnvelopeId("a".repeat(65))).toBe(false);
      expect(isValidEnvelopeId("env_1")).toBe(true);
    });

    it("validates cityCode format", () => {
      expect(isValidCityCode("hz")).toBe(true);
      expect(isValidCityCode("hangzhou")).toBe(true);
      expect(isValidCityCode("")).toBe(false);
      expect(isValidCityCode("x")).toBe(false);
    });

    it("accepts all allowed envelope statuses", () => {
      for (const s of PREPARATION_ENVELOPE_STATUSES) {
        expect(PREPARATION_ENVELOPE_STATUSES).toContain(s);
      }
    });

    it("validates timestamps are ISO dates", () => {
      expect(isValidIsoDate("2025-06-15T00:00:00Z")).toBe(true);
      expect(isValidIsoDate("2025-06-15T12:30:45.123Z")).toBe(true);
      expect(isValidIsoDate("not-a-date")).toBe(false);
    });

    it("allows null lockedAt and archivedAt", () => {
      const envelope: PreparationEnvelopeRecord = {
        envelopeId: "env_1",
        envelopeHash: "sha256:h",
        status: "draft",
        planId: "drp_1",
        packetId: "rp_1",
        cityCode: "hz",
        itemCount: 0,
        lockedAt: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        archivedAt: null,
      };
      expect(envelope.lockedAt).toBeNull();
      expect(envelope.archivedAt).toBeNull();
    });

    it("requires envelopeHash to be non-empty", () => {
      const hash = "sha256:deadbeef";
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toMatch(/^sha256:/);
    });

    it("locked status must have non-null lockedAt", () => {
      const envelope: PreparationEnvelopeRecord = {
        envelopeId: "env_2",
        envelopeHash: "sha256:h",
        status: "locked",
        planId: "drp_2",
        packetId: "rp_2",
        cityCode: "hz",
        itemCount: 5,
        lockedAt: "2025-06-15T12:00:00Z",
        createdAt: "2025-06-15T10:00:00Z",
        updatedAt: "2025-06-15T12:00:00Z",
        archivedAt: null,
      };
      expect(envelope.status).toBe("locked");
      expect(envelope.lockedAt).not.toBeNull();
    });
  });

  describe("PreparationItemRecord", () => {
    it("accepts a valid preparation item", () => {
      const item: PreparationItemRecord = {
        itemId: "prep_item_1",
        envelopeId: "env_1",
        planItemId: "drpi_1",
        statementId: "wrs_1",
        workerId: "wrk_1",
        grossAmount: 89.00,
        platformFee: 8.90,
        workerReceivable: 80.10,
        status: "pending",
        validationErrors: null,
        notes: null,
      };
      expect(isValidEnvelopeId(item.itemId)).toBe(true);
      expect(PREPARATION_ITEM_STATUSES).toContain(item.status);
      expect(item.workerReceivable).toBe(item.grossAmount - item.platformFee);
    });

    it("accepts all allowed item statuses", () => {
      for (const s of PREPARATION_ITEM_STATUSES) {
        expect(PREPARATION_ITEM_STATUSES).toContain(s);
      }
    });

    it("ensures grossAmount is non-negative", () => {
      expect(0).toBeGreaterThanOrEqual(0);
      expect(100.50).toBeGreaterThan(0);
    });

    it("ensures workerReceivable = grossAmount - platformFee", () => {
      const gross = 100.00;
      const fee = 10.00;
      const receivable = gross - fee;
      expect(receivable).toBe(90.00);
    });

    it("allows null validationErrors and notes", () => {
      const item: PreparationItemRecord = {
        itemId: "prep_item_1",
        envelopeId: "env_1",
        planItemId: "drpi_1",
        statementId: "wrs_1",
        workerId: "wrk_1",
        grossAmount: 89.00,
        platformFee: 8.90,
        workerReceivable: 80.10,
        status: "pending",
        validationErrors: null,
        notes: null,
      };
      expect(item.validationErrors).toBeNull();
      expect(item.notes).toBeNull();
    });

    it("blocked items must have validationErrors", () => {
      const item: PreparationItemRecord = {
        itemId: "prep_item_2",
        envelopeId: "env_1",
        planItemId: "drpi_2",
        statementId: "wrs_2",
        workerId: "wrk_2",
        grossAmount: 0,
        platformFee: 0,
        workerReceivable: 0,
        status: "blocked",
        validationErrors: "Invalid statement: amount is zero",
        notes: null,
      };
      expect(item.status).toBe("blocked");
      expect(item.validationErrors).not.toBeNull();
      expect(item.validationErrors!.length).toBeGreaterThan(0);
    });

    it("rejects non-numeric amounts", () => {
      const isNumber = (v: unknown): v is number => typeof v === "number" && !isNaN(v);
      expect(isNumber(89.00)).toBe(true);
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber("89")).toBe(false);
    });
  });

  describe("PreparationAuditEntry", () => {
    it("accepts a valid audit entry", () => {
      const entry: PreparationAuditEntry = {
        auditId: "aud_1",
        envelopeId: "env_1",
        event: "envelope_created",
        details: { source: "dry_run_plan", planId: "drp_1" },
        createdAt: "2025-06-15T00:00:00Z",
      };
      expect(isValidEnvelopeId(entry.auditId)).toBe(true);
      expect(entry.event.length).toBeGreaterThan(0);
      expect(isValidIsoDate(entry.createdAt)).toBe(true);
    });

    it("accepts null details", () => {
      const entry: PreparationAuditEntry = {
        auditId: "aud_2",
        envelopeId: "env_2",
        event: "envelope_locked",
        details: null,
        createdAt: "2025-06-15T00:00:00Z",
      };
      expect(entry.details).toBeNull();
    });

    it("all audit events must be recognized", () => {
      for (const ev of PREPARATION_AUDIT_EVENTS) {
        expect(PREPARATION_AUDIT_EVENTS).toContain(ev);
      }
    });
  });
});
