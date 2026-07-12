import { describe, expect, it } from "vitest";
import {
  addSupportAgentSkillGroupRequestSchema,
  createSupportAgentRequestSchema,
  createSupportSkillGroupRequestSchema,
  removeSupportAgentSkillGroupRequestSchema,
  supportAgentResponseSchema,
  supportAgentSkillGroupResponseSchema,
  supportSkillGroupSchema,
  updateSupportAgentRequestSchema,
  updateSupportSkillGroupRequestSchema,
} from "@xlb/validators";

const at = "2026-07-12T12:00:00.000Z";

describe("Phase 24C Phase 1 agent and skill-group contracts", () => {
  it("accepts identity binding but rejects client-supplied city, role, and agent identity", () => {
    const valid = { adminUserId: "operator-hangzhou", displayName: "Hangzhou Support",
      lifecycleStatus: "active", workStatus: "online", idempotencyKey: "phase24c-agent-create-001" };
    expect(createSupportAgentRequestSchema.safeParse(valid).success).toBe(true);
    for (const spoofed of [{ cityCode: "shanghai" }, { role: "admin" }, { agentId: "client-agent" }]) {
      expect(createSupportAgentRequestSchema.safeParse({ ...valid, ...spoofed }).success).toBe(false);
    }
  });

  it("requires positive CAS versions and at least one mutable field", () => {
    expect(updateSupportAgentRequestSchema.safeParse({ displayName: "Updated", expectedVersion: 1, idempotencyKey: "phase24c-agent-update-001" }).success).toBe(true);
    expect(updateSupportAgentRequestSchema.safeParse({ expectedVersion: 1, idempotencyKey: "phase24c-agent-update-002" }).success).toBe(false);
    expect(updateSupportAgentRequestSchema.safeParse({ workStatus: "online", expectedVersion: 0, idempotencyKey: "phase24c-agent-update-003" }).success).toBe(false);
  });

  it("enforces canonical bounded group scopes and a language-neutral default", () => {
    const valid = { name: "General support", matchedTypes: ["order_question", "other"], matchedLanguages: [],
      priorityWeight: 100, isDefault: true, isActive: true, idempotencyKey: "phase24c-group-create-001" };
    expect(createSupportSkillGroupRequestSchema.safeParse(valid).success).toBe(true);
    expect(createSupportSkillGroupRequestSchema.safeParse({ ...valid, matchedLanguages: ["zh-CN"] }).success).toBe(false);
    expect(createSupportSkillGroupRequestSchema.safeParse({ ...valid, matchedTypes: ["other", "other"] }).success).toBe(false);
    expect(createSupportSkillGroupRequestSchema.safeParse({ ...valid, matchedTypes: ["refund_execution"] }).success).toBe(false);
    expect(createSupportSkillGroupRequestSchema.safeParse({ ...valid, priorityWeight: 1001 }).success).toBe(false);
    expect(updateSupportSkillGroupRequestSchema.safeParse({ isActive: false, expectedVersion: 1, idempotencyKey: "phase24c-group-update-001" }).success).toBe(true);
  });

  it("requires membership CAS and rejects spoofable city or agent IDs", () => {
    const valid = { skillGroupId: "sgp_contract", proficiency: 80, isPrimary: true,
      expectedAgentVersion: 1, idempotencyKey: "phase24c-membership-add-001" };
    expect(addSupportAgentSkillGroupRequestSchema.safeParse(valid).success).toBe(true);
    expect(addSupportAgentSkillGroupRequestSchema.safeParse({ ...valid, cityCode: "shanghai" }).success).toBe(false);
    expect(addSupportAgentSkillGroupRequestSchema.safeParse({ ...valid, agentId: "spoofed" }).success).toBe(false);
    expect(removeSupportAgentSkillGroupRequestSchema.safeParse({ expectedAgentVersion: 1, idempotencyKey: "phase24c-membership-remove-001" }).success).toBe(true);
  });

  it("keeps response schemas strict and aligned with Phase 1 types", () => {
    const agent = { agentId: "sag_contract", cityCode: "hangzhou", adminUserId: "operator-hangzhou",
      displayName: "Support", lifecycleStatus: "active", workStatus: "online", version: 1, createdAt: at, updatedAt: at };
    const group = { skillGroupId: "sgp_contract", cityCode: "hangzhou", name: "General",
      matchedTypes: ["other"], matchedLanguages: [], priorityWeight: 0, isDefault: true,
      isActive: true, version: 1, createdAt: at, updatedAt: at };
    expect(supportAgentResponseSchema.safeParse({ ok: true, agent }).success).toBe(true);
    expect(supportSkillGroupSchema.safeParse(group).success).toBe(true);
    expect(supportAgentSkillGroupResponseSchema.safeParse({ ok: true, agent, membership: {
      cityCode: "hangzhou", agentId: agent.agentId, skillGroupId: group.skillGroupId,
      proficiency: 80, isPrimary: true, isActive: true, createdAt: at, updatedAt: at,
    } }).success).toBe(true);
    expect(supportAgentResponseSchema.safeParse({ ok: true, agent, token: "secret" }).success).toBe(false);
  });
});
