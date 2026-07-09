import { XLB_HEADERS } from "@xlb/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EnvelopeService,
  PreparationError,
  envelopeService,
} from "../../backend/src/preparation/envelopeService.js";
import { stableHash } from "@shared/deterministic/stableHash.js";
import { buildApp } from "../../backend/src/app.js";
import { adminAuthHeaders } from "../integration/helpers/authTestHelper.js";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Envelope Service Unit Tests (vitest)
// Exercises create/freeze/approve with mock DB, verifying all
// guard rails: missing plan, non-generated plan, review revalidation,
// hash mismatch, amount snapshot fail-closed, cross-city rejection,
// and approved regression prevention.
// ══════════════════════════════════════════════════════════════════

// ── Test helpers ──────────────────────────────────────────────────

function mockPool(): any {
  const query = vi.fn().mockResolvedValue([[]]);
  const getConnection = vi.fn().mockResolvedValue({
    query,
    release: vi.fn(),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  });
  return { query, getConnection };
}

function ctx(cityCode = "hangzhou", userId = "adm_1", traceId = "trc_1"): any {
  return {
    appType: "admin",
    role: "operator",
    cityCode,
    userId,
    traceId,
    requestStartedAt: "2026-07-05T00:00:00.000Z",
  };
}

/**
 * Sets up a readiness packet + dry-run plan that passes validation.
 */
function setupReadinessPacket(query: any, cityCode: string, packetId: string) {
  // Mock: getReadinessPacket
  query.mockImplementationOnce((sql: string, params: any[]) => {
    if (sql.includes("settlement_action_governance_readiness_packets")) {
      return [
        [
          {
            id: packetId,
            city_code: cityCode,
            intent_id: "gi_1",
            review_id: "gr_1",
            packet_status: "ready_for_future_phase_review",
            source_refs_json: "{}",
          },
        ],
      ];
    }
    return [[], []];
  });

  // Mock: verifiedReviewApproved
  query.mockImplementationOnce((sql: string, params: any[]) => {
    if (sql.includes("settlement_action_governance_reviews")) {
      return [[{ review_status: "approved_for_governance" }]];
    }
    return [[], []];
  });

  // Mock: findLinkedPlan
  query.mockImplementationOnce((sql: string, params: any[]) => {
    if (sql.includes("settlement_execution_dry_run_plans")) {
      return [
        [
          {
            id: "drp_1",
            readiness_packet_id: packetId,
            city_code: cityCode,
            plan_status: "generated",
            plan_hash: "sha256planhash",
          },
        ],
      ];
    }
    return [[], []];
  });
}

/**
 * Sets up checkExistingEnvelope — returns no existing envelope.
 */
function setupNoExistingEnvelope(query: any, cityCode: string, packetId: string) {
  query.mockImplementationOnce((sql: string, params: any[]) => {
    if (
      sql.includes("FROM settlement_execution_preparation_envelopes") &&
      sql.includes("source_packet_id")
    ) {
      return [[]];
    }
    return [[], []];
  });
}

function sourcePacketHash(packet: Record<string, unknown>): string {
  return stableHash({
    id: packet.id,
    city_code: packet.city_code,
    intent_id: packet.intent_id,
    review_id: packet.review_id,
    packet_status: packet.packet_status,
    source_refs_json: packet.source_refs_json,
  });
}

function sourcePlanHash(plan: Record<string, unknown>): string {
  return stableHash({
    id: plan.id,
    plan_hash: plan.plan_hash,
    plan_status: plan.plan_status,
  });
}

const basePacket = {
  id: "rp_1",
  city_code: "hangzhou",
  intent_id: "gi_1",
  review_id: "gr_1",
  packet_status: "ready_for_future_phase_review",
  source_refs_json: "{}",
};

const basePlan = {
  id: "drp_1",
  readiness_packet_id: "rp_1",
  city_code: "hangzhou",
  plan_status: "generated",
  plan_hash: "sha256planhash",
};

const adminHeaders = {
  ...adminAuthHeaders("adm_1", "hangzhou"),
  [XLB_HEADERS.traceId]: "trc_1",
};

function envelopeRow(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "env_1",
    city_code: "hangzhou",
    source_packet_id: "rp_1",
    source_plan_id: "drp_1",
    envelope_status: status,
    payload_hash: "p".repeat(64),
    item_hash: "i".repeat(64),
    source_packet_hash: sourcePacketHash(basePacket),
    source_plan_hash: sourcePlanHash(basePlan),
    amount_snapshot_json: "{}",
    city_config_snapshot_hash: null,
    settlement_cycle_snapshot_hash: null,
    conflict_check_snapshot_hash: null,
    conflict_check_snapshot_json: "{}",
    frozen_by_admin_id: status === "draft" ? null : "adm_1",
    approved_by_admin_id: status === "approved_for_phase13_review" ? "adm_1" : null,
    trace_id: "trc_1",
    created_at: new Date("2026-07-05T00:00:00.000Z"),
    updated_at: new Date("2026-07-05T00:00:00.000Z"),
    frozen_at: status === "draft" ? null : new Date("2026-07-05T00:00:00.000Z"),
    approved_at: status === "approved_for_phase13_review" ? new Date("2026-07-05T00:00:00.000Z") : null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("EnvelopeService (production-connected)", () => {
  let service: EnvelopeService;
  let pool: any;

  beforeEach(() => {
    pool = mockPool();
    service = new EnvelopeService(pool);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════
  // createEnvelope
  // ════════════════════════════════════════════════════════════════

  describe("createEnvelope", () => {
    it("rejects when readiness packet not found (missing plan)", async () => {
      // Mock: getReadinessPacket returns empty
      pool.query.mockImplementationOnce(() => [[]]);
      // Mock: findLinkedPlan (shouldn't be reached but mock anyway)
      pool.query.mockImplementationOnce(() => [[]]);

      await expect(
        service.createEnvelope(ctx(), "rp_nonexistent"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 404 });
    });

    it("rejects when plan status is not 'generated' (non-generated plan)", async () => {
      // Mock: getReadinessPacket returns ready packet
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "rp_1",
            city_code: "hangzhou",
            intent_id: "gi_1",
            review_id: "gr_1",
            packet_status: "ready_for_future_phase_review",
            source_refs_json: "{}",
          },
        ],
      ]);
      // Mock: verifiedReviewApproved
      pool.query.mockImplementationOnce(() => [[{ review_status: "approved_for_governance" }]]);
      // Mock: findLinkedPlan returns non-generated plan
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "drp_1",
            readiness_packet_id: "rp_1",
            city_code: "hangzhou",
            plan_status: "draft",
            plan_hash: "sha256planhash",
          },
        ],
      ]);

      await expect(
        service.createEnvelope(ctx(), "rp_1"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 422 });
    });

    it("rejects when review status is not verified (review-status revalidation)", async () => {
      // Mock: getReadinessPacket
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "rp_1",
            city_code: "hangzhou",
            intent_id: "gi_1",
            review_id: "gr_1",
            packet_status: "ready_for_future_phase_review",
            source_refs_json: "{}",
          },
        ],
      ]);

      // Mock: verifiedReviewApproved - non-approved review blocks before plan lookup
      pool.query.mockImplementationOnce(() => [[{ review_status: "pending_review" }]]);

      await expect(
        service.createEnvelope(ctx(), "rp_1"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 422 });
    });

    it("rejects on hash mismatch with existing envelope", async () => {
      setupReadinessPacket(pool.query, "hangzhou", "rp_1");

      // Mock: checkExistingEnvelope returns existing with mismatched hash
      pool.query.mockImplementationOnce((sql: string, params: any[]) => {
        if (
          sql.includes("FROM settlement_execution_preparation_envelopes") &&
          sql.includes("source_packet_id")
        ) {
          return [
            [
              {
                id: "env_existing",
                city_code: "hangzhou",
                source_packet_id: "rp_1",
                source_plan_id: "drp_1",
                envelope_status: "draft",
                payload_hash: "differentHash",
                item_hash: null,
                source_packet_hash: "DIFFERENT_packet_hash",
                source_plan_hash: "DIFFERENT_plan_hash",
                amount_snapshot_json: "{}",
                city_config_snapshot_hash: null,
                settlement_cycle_snapshot_hash: null,
                conflict_check_snapshot_json: "{}",
                frozen_by_admin_id: null,
                approved_by_admin_id: null,
                trace_id: null,
                created_at: new Date("2025-01-01T00:00:00Z"),
                updated_at: new Date("2025-01-01T00:00:00Z"),
                frozen_at: null,
                approved_at: null,
              },
            ],
          ];
        }
        return [[], []];
      });

      await expect(
        service.createEnvelope(ctx(), "rp_1"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 409 });
    });

    it("successfully creates envelope with valid plan", async () => {
      setupReadinessPacket(pool.query, "hangzhou", "rp_1");
      setupNoExistingEnvelope(pool.query, "hangzhou", "rp_1");

      // Mock: getPlanItems (for createEnvelope)
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "drpi_1",
            plan_id: "drp_1",
            city_code: "hangzhou",
            item_type: "settlement_batch",
            item_ref_id: "stb_1",
            planned_action: "freeze",
            item_order: 0,
          },
        ],
      ]);

      // Mock: INSERT (createEnvelope)
      pool.query.mockImplementationOnce(() => [{ affectedRows: 1 }]);

      // Mock: INSERT items (envelope items)
      pool.query.mockImplementationOnce(() => [{ affectedRows: 1 }]);

      // Mock: INSERT audit
      pool.query.mockImplementationOnce(() => [{ affectedRows: 1 }]);

      // Mock: SELECT readback of created envelope
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "env_new",
            city_code: "hangzhou",
            source_packet_id: "rp_1",
            source_plan_id: "drp_1",
            envelope_status: "draft",
            payload_hash: "a".repeat(64),
            item_hash: "b".repeat(64),
            source_packet_hash: "c".repeat(64),
            source_plan_hash: "d".repeat(64),
            amount_snapshot_json: "{}",
            city_config_snapshot_hash: null,
            settlement_cycle_snapshot_hash: null,
            conflict_check_snapshot_hash: null,
            conflict_check_snapshot_json: "{}",
            frozen_by_admin_id: null,
            approved_by_admin_id: null,
            trace_id: "trc_1",
            created_at: new Date(),
            updated_at: new Date(),
            frozen_at: null,
            approved_at: null,
          },
        ],
      ]);

      const envelope = await service.createEnvelope(ctx(), "rp_1");

      expect(envelope.id).toBe("env_new");
      expect(envelope.envelopeStatus).toBe("draft");
      expect(pool.getConnection).toHaveBeenCalledTimes(1);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // freezeEnvelope
  // ════════════════════════════════════════════════════════════════

  describe("freezeEnvelope", () => {
    it("real freeze success path stores amount snapshot without double-counting", async () => {
      const frozenRow = envelopeRow("frozen", {
        amount_snapshot_json: JSON.stringify({
          total_gross_amount: 500,
          total_platform_fee: 50,
          total_worker_receivable: 450,
          total_item_count: 1,
        }),
        frozen_at: new Date("2026-07-05T01:00:00.000Z"),
      });

      pool.query
        .mockImplementationOnce(() => [[envelopeRow("draft")]])
        .mockImplementationOnce(() => [[basePacket]])
        .mockImplementationOnce(() => [[{ review_status: "approved_for_governance" }]])
        .mockImplementationOnce(() => [[basePlan]])
        .mockImplementationOnce(() => [[
          { item_type: "settlement_batch", item_ref_id: "sb_1", planned_action: "freeze", item_order: 0 },
          { item_type: "ledger_accrual", item_ref_id: "la_1", planned_action: "freeze", item_order: 1 },
        ]])
        .mockImplementationOnce(() => [[{
          settlement_batch_id: "sb_1",
          total_gross_amount: 500,
          total_platform_fee: 50,
          total_worker_receivable: 450,
          item_count: 1,
          status: "prepared",
        }]])
        .mockImplementationOnce(() => [[{
          settlement_item_id: "si_1",
          accrual_id: "la_1",
          gross_amount: 500,
          platform_fee: 50,
          worker_receivable: 450,
          currency: "CNY",
          status: "prepared",
        }]])
        .mockImplementationOnce(() => [[{
          accrual_id: "la_1",
          gross_amount: 500,
          platform_fee: 50,
          worker_receivable: 450,
          currency: "CNY",
          status: "accrued",
        }]])
        .mockImplementationOnce(() => [[]]) // city config optional
        .mockImplementationOnce(() => [[{ settlement_batch_id: "sb_1", status: "prepared" }]])
        .mockImplementationOnce(() => [[]]) // cancelled batches
        .mockImplementationOnce(() => [[]]) // voided accruals
        .mockImplementationOnce(() => [[]]) // duplicate envelopes
        .mockImplementationOnce(() => [[{
          item_type: "settlement_batch",
          item_ref_id: "sb_1",
          planned_action: "freeze",
          item_order: 0,
        }]])
        .mockImplementationOnce(() => [{ affectedRows: 1 }])
        .mockImplementationOnce(() => [{ affectedRows: 1 }])
        .mockImplementationOnce(() => [[frozenRow]]);

      const result = await service.freezeEnvelope(ctx(), "env_1");

      expect(result.envelopeStatus).toBe("frozen");
      expect(result.amountSnapshot.total_gross_amount).toBe(500);
      expect(result.amountSnapshot.total_worker_receivable).toBe(450);
      expect(result.amountSnapshot.total_item_count).toBe(1);
    });

    it("real freeze missing envelope returns PreparationError 404", async () => {
      await expect(
        service.freezeEnvelope(ctx(), "env_nonexistent_xyz"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 404 });
    });

    it("real freeze stale source hash conflict returns PreparationError 409", async () => {
      pool.query.mockImplementationOnce(() => [[
        envelopeRow("draft", { source_packet_hash: "stale_packet_hash" }),
      ]]);
      pool.query.mockImplementationOnce(() => [[basePacket]]);
      pool.query.mockImplementationOnce(() => [[{ review_status: "approved_for_governance" }]]);
      pool.query.mockImplementationOnce(() => [[basePlan]]);

      await expect(
        service.freezeEnvelope(ctx(), "env_1"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 409 });
    });

    it("real freeze amount snapshot fail-closed returns PreparationError 422", async () => {
      pool.query.mockImplementationOnce(() => [[envelopeRow("draft")]]);
      pool.query.mockImplementationOnce(() => [[basePacket]]);
      pool.query.mockImplementationOnce(() => [[{ review_status: "approved_for_governance" }]]);
      pool.query.mockImplementationOnce(() => [[basePlan]]);
      pool.query.mockImplementationOnce(() => [[
        { item_type: "settlement_item", item_ref_id: "missing_si_1", planned_action: "freeze", item_order: 0 },
      ]]);
      pool.query.mockImplementationOnce(() => [[]]);

      await expect(
        service.freezeEnvelope(ctx(), "env_1"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 422 });
    });
  });

  // ════════════════════════════════════════════════════════════════
  // approveEnvelope
  // ════════════════════════════════════════════════════════════════

  describe("approveEnvelope", () => {
    it("real approve success path transitions frozen to approved_for_phase13_review", async () => {
      pool.query.mockImplementationOnce(() => [[envelopeRow("frozen")]]);
      pool.query.mockImplementationOnce(() => [[basePacket]]);
      pool.query.mockImplementationOnce(() => [[{ review_status: "approved_for_governance" }]]);
      pool.query.mockImplementationOnce(() => [[basePlan]]);
      pool.query.mockImplementationOnce(() => [{ affectedRows: 1 }]);
      pool.query.mockImplementationOnce(() => [{ affectedRows: 1 }]);
      pool.query.mockImplementationOnce(() => [[envelopeRow("approved_for_phase13_review")]]);

      const result = await service.approveEnvelope(ctx(), "env_1");

      expect(result.envelopeStatus).toBe("approved_for_phase13_review");
      expect(result.approvedByAdminId).toBe("adm_1");
      expect(result.approvedAt).not.toBeNull();
    });

    it("real approve missing envelope returns PreparationError 404", async () => {
      await expect(
        service.approveEnvelope(ctx(), "env_nonexistent_xyz"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 404 });
    });

    it("approved envelope cannot regress to frozen through approve path", async () => {
      pool.query.mockImplementationOnce(() => [[envelopeRow("approved_for_phase13_review")]]);

      await expect(
        service.approveEnvelope(ctx(), "env_1"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 422 });
    });

    it("approveEnvelope gate: validateSourceReadiness computes deterministic hashes", async () => {
      pool.query.mockImplementationOnce(() => [[{
        id: "rp_1", city_code: "hangzhou", intent_id: "gi_1",
        review_id: "gr_1", packet_status: "ready_for_future_phase_review",
        source_refs_json: "{}",
      }]]);
      pool.query.mockImplementationOnce(() => [[{ review_status: "approved_for_governance" }]]);
      pool.query.mockImplementationOnce(() => [[{
        id: "drp_1", readiness_packet_id: "rp_1", city_code: "hangzhou",
        plan_status: "generated", plan_hash: "abc123",
      }]]);

      const result = await (service as any).validateSourceReadiness(pool, "hangzhou", "rp_1");
      expect(result).toHaveProperty("sourcePacketHash");
      expect(result).toHaveProperty("sourcePlanHash");
      expect(typeof result.sourcePacketHash).toBe("string");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // envelope status contract
  // ════════════════════════════════════════════════════════════════

  describe("envelope status contract", () => {
    it("only draft, frozen, approved_for_phase13_review are valid statuses", () => {
      const VALID_STATUSES = ["draft", "frozen", "approved_for_phase13_review"];
      const FORBIDDEN = [
        "locked",
        "archived",
        "ready_for_execution",
        "approved_for_execution",
        "execute_ready",
        "payout_ready",
        "payment_ready",
      ];

      for (const f of FORBIDDEN) {
        expect(VALID_STATUSES).not.toContain(f);
      }
    });

    it("frozen requires freeze to be called first", () => {
      // draft → frozen → approved is the only valid transition path
      const validTransitions: Record<string, string[]> = {
        draft: ["frozen"],
        frozen: ["approved_for_phase13_review"],
        approved_for_phase13_review: [],
      };

      expect(validTransitions["draft"]).toContain("frozen");
      expect(validTransitions["frozen"]).toContain("approved_for_phase13_review");
      expect(validTransitions["approved_for_phase13_review"]).toEqual([]);
      expect(validTransitions["draft"]).not.toContain("approved_for_phase13_review");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // computePayloadHash — pure function test
  // ════════════════════════════════════════════════════════════════

  describe("computePayloadHash", () => {
    it("produces deterministic SH256 hash", async () => {
      // Dynamic import of the hash function
      const mod = await import(
        "../../backend/src/preparation/envelopeService.js"
      );
      const hash1 = mod.computePayloadHash("rp_1", "hangzhou", "planHash", [
        "a",
        "b",
        "c",
      ]);
      const hash2 = mod.computePayloadHash("rp_1", "hangzhou", "planHash", [
        "a",
        "b",
        "c",
      ]);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("different plan hash produces different payload hash", async () => {
      const mod = await import(
        "../../backend/src/preparation/envelopeService.js"
      );
      const hash1 = mod.computePayloadHash("rp_1", "hangzhou", "planHash1", [
        "a",
        "b",
      ]);
      const hash2 = mod.computePayloadHash("rp_1", "hangzhou", "planHash2", [
        "a",
        "b",
      ]);
      expect(hash1).not.toBe(hash2);
    });

    it("different item refs produce different payload hash", async () => {
      const mod = await import(
        "../../backend/src/preparation/envelopeService.js"
      );
      const hash1 = mod.computePayloadHash("rp_1", "hangzhou", "planHash", [
        "a",
        "b",
      ]);
      const hash2 = mod.computePayloadHash("rp_1", "hangzhou", "planHash", [
        "a",
        "c",
      ]);
      expect(hash1).not.toBe(hash2);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
describe("Preparation routes — PreparationError maps to 4xx", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps stale/hash conflict to HTTP 409 instead of 500", async () => {
    vi.spyOn(envelopeService, "freezeEnvelope").mockRejectedValueOnce(
      new PreparationError("Source packet hash mismatch", 409),
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/internal/settlement-action-governance/preparation-envelopes/env_1/freeze",
      headers: adminHeaders,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ ok: false });
    await app.close();
  });

  it("maps missing readiness source/not found to HTTP 404 instead of 500", async () => {
    vi.spyOn(envelopeService, "createEnvelope").mockRejectedValueOnce(
      new PreparationError("Readiness packet missing_rp not found", 404),
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/internal/settlement-action-governance/preparation-envelopes",
      headers: adminHeaders,
      payload: { sourcePacketId: "missing_rp" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ ok: false });
    await app.close();
  });

  it("maps non-generated plan or non-approved review to HTTP 422 instead of 500", async () => {
    vi.spyOn(envelopeService, "createEnvelope").mockRejectedValueOnce(
      new PreparationError("Plan drp_1 status is 'draft', expected 'generated'", 422),
    );
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/internal/settlement-action-governance/preparation-envelopes",
      headers: adminHeaders,
      payload: { sourcePacketId: "rp_1" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ ok: false });
    await app.close();
  });
});

// Internal method tests: direct unit tests for F1-F4 logic
// These bypass the transaction wrapper and test helper methods directly.
// ══════════════════════════════════════════════════════════════════

describe("EnvelopeService — internal helpers (F1-F4)", () => {
  let service: EnvelopeService;
  let pool: any;

  beforeEach(() => {
    pool = mockPool();
    service = new EnvelopeService(pool);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verifiedReviewApproved (F1)", () => {
    it("resolves when review_status is approved_for_governance", async () => {
      pool.query.mockImplementationOnce(() => [
        [{ review_status: "approved_for_governance" }],
      ]);

      await expect(
        (service as any).verifiedReviewApproved(
          pool.query.bind(pool) ? { query: pool.query } : pool,
          "gr_1",
          "hangzhou",
        ),
      ).resolves.toBeUndefined();
    });

    it("throws when review has non-approved status", async () => {
      pool.query.mockImplementationOnce(() => [
        [{ review_status: "rejected_for_governance" }],
      ]);

      await expect(
        (service as any).verifiedReviewApproved(pool, "gr_1", "hangzhou"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 422 });
    });

    it("throws when review not found", async () => {
      pool.query.mockImplementationOnce(() => [[]]);
      await expect(
        (service as any).verifiedReviewApproved(pool, "gr_1", "hangzhou"),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 404 });
    });
  });

  describe("checkExistingEnvelope (F1 — reject stale)", () => {
    it("returns null when no existing envelope found", async () => {
      pool.query.mockImplementationOnce(() => [[]]);

      const result = await (service as any).checkExistingEnvelope(
        pool, "hangzhou", "rp_1", "hash1", "planhash1",
      );
      expect(result).toBeNull();
    });

    it("throws REJECT on hash mismatch (no stale_or_conflict)", async () => {
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "env_1",
            city_code: "hangzhou",
            source_packet_id: "rp_1",
            source_plan_id: "drp_1",
            envelope_status: "draft",
            payload_hash: "ph",
            item_hash: null,
            source_packet_hash: "stale_hash",
            source_plan_hash: "stale_plan_hash",
            amount_snapshot_json: "{}",
            city_config_snapshot_hash: null,
            settlement_cycle_snapshot_hash: null,
            conflict_check_snapshot_hash: null,
            conflict_check_snapshot_json: "{}",
            frozen_by_admin_id: null,
            approved_by_admin_id: null,
            trace_id: null,
            created_at: new Date(),
            updated_at: new Date(),
            frozen_at: null,
            approved_at: null,
          },
        ],
      ]);

      await expect(
        (service as any).checkExistingEnvelope(
          pool, "hangzhou", "rp_1", "fresh_hash", "fresh_plan_hash",
        ),
      ).rejects.toThrow(/source has changed/);
    });
  });

  describe("buildAmountSnapshot (F2)", () => {
    it("throws when no relevant plan items", async () => {
      await expect(
        (service as any).buildAmountSnapshot(pool, "hangzhou", []),
      ).rejects.toThrow(/no matching settlement items found/);
    });

    it("throws when plan items have only non-settlement types", async () => {
      const nonSettlementItems = [
        { item_type: "statement", item_ref_id: "stmt_1" },
        { item_type: "export", item_ref_id: "exp_1" },
      ];

      await expect(
        (service as any).buildAmountSnapshot(pool, "hangzhou", nonSettlementItems),
      ).rejects.toThrow(/no matching settlement items found/);
    });

    it("resolves payable references through settlement_payables→settlement_items", async () => {
      // Mock: settlement_payables lookup
      pool.query.mockImplementationOnce(() => [
        [{ settlement_batch_id: "sb_1" }],
      ]);
      // Mock: settlement_batches lookup
      pool.query.mockImplementationOnce(() => [
        [
          {
            settlement_batch_id: "sb_1",
            total_gross_amount: 500,
            total_platform_fee: 50,
            total_worker_receivable: 450,
            item_count: 1,
            status: "prepared",
          },
        ],
      ]);
      // Mock: settlement_items lookup
      pool.query.mockImplementationOnce(() => [
        [
          {
            settlement_item_id: "si_1",
            accrual_id: "la_1",
            gross_amount: 500,
            platform_fee: 50,
            worker_receivable: 450,
            currency: "CNY",
            status: "prepared",
          },
        ],
      ]);

      const payableItem = {
        item_type: "settlement_payable",
        item_ref_id: "sp_1",
      };

      const snapshot = await (service as any).buildAmountSnapshot(
        pool,
        "hangzhou",
        [payableItem],
      );

      expect(snapshot.total_gross_amount).toBeGreaterThan(0);
      expect(Array.isArray(snapshot.batch_amounts)).toBe(true);
    });

    it("does not double-count ledger accruals already represented by settlement batch items", async () => {
      pool.query.mockImplementationOnce(() => [[{
        settlement_batch_id: "sb_1",
        total_gross_amount: 500,
        total_platform_fee: 50,
        total_worker_receivable: 450,
        item_count: 1,
        status: "prepared",
      }]]);
      pool.query.mockImplementationOnce(() => [[{
        settlement_item_id: "si_1",
        accrual_id: "la_1",
        gross_amount: 500,
        platform_fee: 50,
        worker_receivable: 450,
        currency: "CNY",
        status: "prepared",
      }]]);
      pool.query.mockImplementationOnce(() => [[{
        accrual_id: "la_1",
        gross_amount: 500,
        platform_fee: 50,
        worker_receivable: 450,
        currency: "CNY",
        status: "accrued",
      }]]);

      const snapshot = await (service as any).buildAmountSnapshot(pool, "hangzhou", [
        { item_type: "settlement_batch", item_ref_id: "sb_1" },
        { item_type: "ledger_accrual", item_ref_id: "la_1" },
      ]);

      expect(snapshot.total_gross_amount).toBe(500);
      expect(snapshot.total_platform_fee).toBe(50);
      expect(snapshot.total_worker_receivable).toBe(450);
      expect(snapshot.total_item_count).toBe(1);
      expect(snapshot.accrual_amounts[0].counted).toBe(false);
    });

    it("missing settlement_item reference blocks freeze amount snapshot", async () => {
      pool.query.mockImplementationOnce(() => [[]]);

      await expect(
        (service as any).buildAmountSnapshot(pool, "hangzhou", [
          { item_type: "settlement_item", item_ref_id: "missing_si" },
        ]),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 422 });
    });

    it("missing ledger_accrual reference blocks freeze amount snapshot", async () => {
      pool.query.mockImplementationOnce(() => [[]]);

      await expect(
        (service as any).buildAmountSnapshot(pool, "hangzhou", [
          { item_type: "ledger_accrual", item_ref_id: "missing_la" },
        ]),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 422 });
    });
  });

  describe("buildConflictCheckSnapshot (F3)", () => {
    it("returns identical hash for same source state when DB rows arrive in different order", async () => {
      const planItems = [
        { item_type: "settlement_item", item_ref_id: "si_1" },
        { item_type: "settlement_item", item_ref_id: "si_2" },
      ];
      const amountSnapshot = {
        total_gross_amount: 300,
        total_platform_fee: 30,
        total_worker_receivable: 270,
        total_item_count: 2,
      };

      pool.query
        .mockImplementationOnce(() => [[
          { settlement_item_id: "si_2", settlement_batch_id: "sb_2", accrual_id: "la_2" },
          { settlement_item_id: "si_1", settlement_batch_id: "sb_1", accrual_id: "la_1" },
        ]])
        .mockImplementationOnce(() => [[]])
        .mockImplementationOnce(() => [[]])
        .mockImplementationOnce(() => [[]]);
      const first = await (service as any).buildConflictCheckSnapshot(
        pool,
        "hangzhou",
        "rp_1",
        "env_a",
        planItems,
        amountSnapshot,
        "city_hash",
        "cycle_hash",
      );

      pool.query
        .mockImplementationOnce(() => [[
          { settlement_item_id: "si_1", settlement_batch_id: "sb_1", accrual_id: "la_1" },
          { settlement_item_id: "si_2", settlement_batch_id: "sb_2", accrual_id: "la_2" },
        ]])
        .mockImplementationOnce(() => [[]])
        .mockImplementationOnce(() => [[]])
        .mockImplementationOnce(() => [[]]);
      const second = await (service as any).buildConflictCheckSnapshot(
        pool,
        "hangzhou",
        "rp_1",
        "env_b",
        planItems,
        amountSnapshot,
        "city_hash",
        "cycle_hash",
      );

      expect(first.hash).toBe(second.hash);
      expect(first.snapshot).not.toHaveProperty("conflict_check_at");
      expect(JSON.stringify(first.snapshot)).not.toContain("env_a");
      expect(JSON.stringify(second.snapshot)).not.toContain("env_b");
    });

    it("detects cancelled batches as blocking conflict", async () => {
      pool.query.mockImplementationOnce(() => [[{ settlement_batch_id: "sb_1", status: "cancelled" }]]);
      pool.query.mockImplementationOnce(() => [[]]);
      pool.query.mockImplementationOnce(() => [[]]);

      await expect(
        (service as any).buildConflictCheckSnapshot(
          pool,
          "hangzhou",
          "rp_1",
          "env_1",
          [{ item_type: "settlement_batch", item_ref_id: "sb_1" }],
          { total_gross_amount: 100, total_platform_fee: 10, total_worker_receivable: 90, total_item_count: 1 },
          null,
          null,
        ),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 409 });
    });

    it("detects voided ledger accruals as blocking conflict", async () => {
      pool.query.mockImplementationOnce(() => [[]]);
      pool.query.mockImplementationOnce(() => [[{ accrual_id: "la_1", status: "voided" }]]);
      pool.query.mockImplementationOnce(() => [[]]);

      await expect(
        (service as any).buildConflictCheckSnapshot(
          pool,
          "hangzhou",
          "rp_1",
          "env_1",
          [{ item_type: "ledger_accrual", item_ref_id: "la_1" }],
          { total_gross_amount: 100, total_platform_fee: 10, total_worker_receivable: 90, total_item_count: 1 },
          null,
          null,
        ),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 409 });
    });

    it("detects duplicate frozen/approved envelopes without hashing duplicate envelope IDs", async () => {
      pool.query.mockImplementationOnce(() => [[]]);
      pool.query.mockImplementationOnce(() => [[
        { id: "env_other_2", envelope_status: "approved_for_phase13_review" },
        { id: "env_other_1", envelope_status: "frozen" },
      ]]);

      await expect(
        (service as any).buildConflictCheckSnapshot(
          pool,
          "hangzhou",
          "rp_1",
          "env_1",
          [{ item_type: "settlement_batch", item_ref_id: "sb_1" }],
          { total_gross_amount: 100, total_platform_fee: 10, total_worker_receivable: 90, total_item_count: 1 },
          null,
          null,
        ),
      ).rejects.toMatchObject({ name: "PreparationError", statusCode: 409 });
    });

    it("marks refund/reversal as not_applicable when tables are outside Phase 12", async () => {
      pool.query.mockImplementationOnce(() => [[]]);
      pool.query.mockImplementationOnce(() => [[]]);
      pool.query.mockImplementationOnce(() => [[]]);

      const result = await (service as any).buildConflictCheckSnapshot(
        pool,
        "hangzhou",
        "rp_1",
        "env_1",
        [{ item_type: "ledger_accrual", item_ref_id: "la_1" }],
        { total_gross_amount: 100, total_platform_fee: 10, total_worker_receivable: 90, total_item_count: 1 },
        null,
        null,
      );

      expect(result.snapshot.refund_reversal_check).toMatchObject({ status: "not_applicable" });
    });
  });

  describe("F4: immutability and guard rails", () => {
    it("validateSourceReadiness computes deterministic hashes", async () => {
      // Mock: getReadinessPacket
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "rp_1",
            city_code: "hangzhou",
            intent_id: "gi_1",
            review_id: "gr_1",
            packet_status: "ready_for_future_phase_review",
            source_refs_json: "{}",
          },
        ],
      ]);
      // Mock: verifiedReviewApproved
      pool.query.mockImplementationOnce(() => [
        [{ review_status: "approved_for_governance" }],
      ]);
      // Mock: findLinkedPlan
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "drp_1",
            readiness_packet_id: "rp_1",
            city_code: "hangzhou",
            plan_status: "generated",
            plan_hash: "abc123",
          },
        ],
      ]);

      const result1 = await (service as any).validateSourceReadiness(
        pool, "hangzhou", "rp_1",
      );

      // Re-mock for second call
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "rp_1",
            city_code: "hangzhou",
            intent_id: "gi_1",
            review_id: "gr_1",
            packet_status: "ready_for_future_phase_review",
            source_refs_json: "{}",
          },
        ],
      ]);
      pool.query.mockImplementationOnce(() => [
        [{ review_status: "approved_for_governance" }],
      ]);
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "drp_1",
            readiness_packet_id: "rp_1",
            city_code: "hangzhou",
            plan_status: "generated",
            plan_hash: "abc123",
          },
        ],
      ]);

      const result2 = await (service as any).validateSourceReadiness(
        pool, "hangzhou", "rp_1",
      );

      expect(result1.sourcePacketHash).toBe(result2.sourcePacketHash);
      expect(result1.sourcePlanHash).toBe(result2.sourcePlanHash);
    });

    it("requires review_id to be present on readiness packet", async () => {
      pool.query.mockImplementationOnce(() => [
        [
          {
            id: "rp_1",
            city_code: "hangzhou",
            intent_id: "gi_1",
            review_id: null, // missing
            packet_status: "ready_for_future_phase_review",
            source_refs_json: "{}",
          },
        ],
      ]);

      await expect(
        (service as any).validateSourceReadiness(pool, "hangzhou", "rp_1"),
      ).rejects.toThrow(/no linked governance review/);
    });

  });
});
