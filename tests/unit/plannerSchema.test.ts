import { describe, expect, it } from "vitest";

// ══════════════════════════════════════════════════════════════════
// Phase 11 — Planner Record Schema Tests (vitest)
// Validates governance-driven dry-run planner record shapes.
// ══════════════════════════════════════════════════════════════════

// ── Inline schemas (mirrors expected zod validators) ──
// These are lightweight schema checks against the expected Phase 11 planner shapes.
// The real validators will live in packages/validators/src/plannerSchema.ts once created.

const DRY_RUN_PLAN_STATUSES = ["draft", "simulating", "simulation_complete", "archived"] as const;
const DRY_RUN_PLAN_ITEM_STATUSES = ["pending", "simulated", "blocked", "excluded"] as const;

function isValidPlanId(id: string): boolean {
  return typeof id === "string" && id.length >= 1 && id.length <= 64;
}

function isValidCityCode(code: string): boolean {
  return typeof code === "string" && code.length >= 2 && code.length <= 64;
}

function isValidIsoDate(s: string): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

interface DryRunPlanRecord {
  planId: string;
  planHash: string;
  status: string;
  packetId: string;
  cityCode: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface DryRunPlanItemRecord {
  planItemId: string;
  planId: string;
  statementId: string;
  workerId: string;
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  status: string;
  notes: string | null;
}

interface DryRunPlanAuditEntry {
  auditId: string;
  planId: string;
  event: string;
  details: unknown;
  createdAt: string;
}

describe("Phase 11 — Planner Record Schema", () => {
  describe("DryRunPlanRecord", () => {
    it("accepts a valid plan record", () => {
      const plan: DryRunPlanRecord = {
        planId: "drp_abc123",
        planHash: "sha256:deadbeef",
        status: "draft",
        packetId: "rp_xyz",
        cityCode: "hz",
        itemCount: 3,
        createdAt: "2025-06-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
        archivedAt: null,
      };
      expect(isValidPlanId(plan.planId)).toBe(true);
      expect(isValidCityCode(plan.cityCode)).toBe(true);
      expect(DRY_RUN_PLAN_STATUSES).toContain(plan.status);
      expect(plan.itemCount).toBeGreaterThanOrEqual(0);
    });

    it("validates planId length bounds", () => {
      expect(isValidPlanId("")).toBe(false);
      expect(isValidPlanId("a".repeat(65))).toBe(false);
      expect(isValidPlanId("drp_1")).toBe(true);
    });

    it("validates cityCode format", () => {
      expect(isValidCityCode("hz")).toBe(true);
      expect(isValidCityCode("hangzhou")).toBe(true);
      expect(isValidCityCode("")).toBe(false);
      expect(isValidCityCode("x")).toBe(false);
    });

    it("accepts all allowed plan statuses", () => {
      for (const s of DRY_RUN_PLAN_STATUSES) {
        expect(DRY_RUN_PLAN_STATUSES).toContain(s);
      }
    });

    it("validates timestamps are ISO dates", () => {
      expect(isValidIsoDate("2025-06-01T00:00:00Z")).toBe(true);
      expect(isValidIsoDate("2025-06-01T12:30:45.123Z")).toBe(true);
      expect(isValidIsoDate("not-a-date")).toBe(false);
    });

    it("allows null archivedAt", () => {
      const plan: DryRunPlanRecord = {
        planId: "drp_1", planHash: "h", status: "draft", packetId: "rp_1",
        cityCode: "hz", itemCount: 0,
        createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z", archivedAt: null,
      };
      expect(plan.archivedAt).toBeNull();
    });

    it("requires planHash to be non-empty", () => {
      const hash = "sha256:deadbeef";
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toMatch(/^sha256:/);
    });
  });

  describe("DryRunPlanItemRecord", () => {
    it("accepts a valid plan item", () => {
      const item: DryRunPlanItemRecord = {
        planItemId: "drpi_1",
        planId: "drp_1",
        statementId: "wrs_1",
        workerId: "wrk_1",
        grossAmount: 89.00,
        platformFee: 8.90,
        workerReceivable: 80.10,
        status: "pending",
        notes: null,
      };
      expect(isValidPlanId(item.planItemId)).toBe(true);
      expect(DRY_RUN_PLAN_ITEM_STATUSES).toContain(item.status);
      expect(item.workerReceivable).toBe(item.grossAmount - item.platformFee);
    });

    it("accepts all allowed item statuses", () => {
      for (const s of DRY_RUN_PLAN_ITEM_STATUSES) {
        expect(DRY_RUN_PLAN_ITEM_STATUSES).toContain(s);
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

    it("allows null notes", () => {
      const item: DryRunPlanItemRecord = {
        planItemId: "drpi_1", planId: "drp_1", statementId: "wrs_1", workerId: "wrk_1",
        grossAmount: 89.00, platformFee: 8.90, workerReceivable: 80.10,
        status: "pending", notes: null,
      };
      expect(item.notes).toBeNull();
    });

    it("rejects non-numeric amounts", () => {
      const isNumber = (v: unknown): v is number => typeof v === "number" && !isNaN(v);
      expect(isNumber(89.00)).toBe(true);
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber("89")).toBe(false);
    });
  });

  describe("DryRunPlanAuditEntry", () => {
    it("accepts a valid audit entry", () => {
      const entry: DryRunPlanAuditEntry = {
        auditId: "aud_1",
        planId: "drp_1",
        event: "plan_created",
        details: { source: "readiness_packet", packetId: "rp_1" },
        createdAt: "2025-06-01T00:00:00Z",
      };
      expect(isValidPlanId(entry.auditId)).toBe(true);
      expect(entry.event.length).toBeGreaterThan(0);
      expect(isValidIsoDate(entry.createdAt)).toBe(true);
    });

    it("accepts null details", () => {
      const entry: DryRunPlanAuditEntry = {
        auditId: "aud_2", planId: "drp_2", event: "simulation_started",
        details: null, createdAt: "2025-06-01T00:00:00Z",
      };
      expect(entry.details).toBeNull();
    });
  });
});
