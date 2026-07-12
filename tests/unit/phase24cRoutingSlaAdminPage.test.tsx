// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportSkillGroup, SupportSlaPolicy } from "@xlb/types";

const adminApi = vi.hoisted(() => ({
  listSupportSkillGroups: vi.fn(), createSupportSkillGroup: vi.fn(), updateSupportSkillGroup: vi.fn(),
  listSupportSlaPolicies: vi.fn(), createSupportSlaPolicy: vi.fn(), reviseSupportSlaPolicy: vi.fn(),
}));
vi.mock("../../apps/admin/src/adminAuth", () => ({ adminOpsApi: adminApi }));
import { SupportRoutingConfigPage } from "../../apps/admin/src/pages/SupportRoutingConfigPage";

const at = "2026-07-12T08:00:00.000Z";
const group: SupportSkillGroup = {
  skillGroupId: "sgp-hz-order", cityCode: "hangzhou", name: "Order Chinese",
  matchedTypes: ["order_question"], matchedLanguages: ["zh-CN"], priorityWeight: 90,
  isDefault: false, isActive: true, version: 2, createdAt: at, updatedAt: at,
};
const policy: SupportSlaPolicy = {
  policyId: "slp-hz-order-normal-r1", policySeriesId: "sls-hz-order-normal", revision: 1,
  supersedesPolicyId: null, cityCode: "hangzhou", type: "order_question", priority: "normal",
  firstResponseMinutes: 30, resolutionMinutes: 240, effectiveFrom: at, effectiveTo: null,
  isActive: true, version: 1, createdAt: at, updatedAt: at,
};

afterEach(cleanup);

describe("Phase 24C Phase 2 Admin routing and SLA configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.listSupportSkillGroups.mockResolvedValue({ ok: true, skillGroups: [group], nextCursor: null });
    adminApi.listSupportSlaPolicies.mockResolvedValue({ ok: true, policies: [policy], nextCursor: null });
    adminApi.createSupportSkillGroup.mockResolvedValue({ ok: true, skillGroup: group });
    adminApi.updateSupportSkillGroup.mockResolvedValue({ ok: true, skillGroup: { ...group, isActive: false, version: 3 } });
    adminApi.createSupportSlaPolicy.mockResolvedValue({ ok: true, policy });
    adminApi.reviseSupportSlaPolicy.mockResolvedValue({ ok: true, policy: { ...policy, policyId: "slp-r2", revision: 2, supersedesPolicyId: policy.policyId, isActive: false } });
  });

  it("loads city-scoped groups and policies and creates configuration through the Admin API", async () => {
    render(<SupportRoutingConfigPage cityCode="hangzhou" />);
    expect(await screen.findByText("Order Chinese")).toBeTruthy();
    expect(screen.getByText("order_question / normal")).toBeTruthy();
    expect(adminApi.listSupportSkillGroups).toHaveBeenCalledWith({ limit: 100 });
    expect(adminApi.listSupportSlaPolicies).toHaveBeenCalledWith({ limit: 100 });

    fireEvent.change(screen.getByLabelText("Skill group name"), { target: { value: "Safety team" } });
    fireEvent.change(screen.getByLabelText("Matched ticket type"), { target: { value: "safety" } });
    fireEvent.change(screen.getByLabelText("Matched languages"), { target: { value: "zh-CN, en" } });
    fireEvent.change(screen.getByLabelText("Routing weight"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill group" }));
    await waitFor(() => expect(adminApi.createSupportSkillGroup).toHaveBeenCalledWith(expect.objectContaining({
      name: "Safety team", matchedTypes: ["safety"], matchedLanguages: ["zh-CN", "en"],
      priorityWeight: 100, isDefault: false, isActive: true,
      idempotencyKey: expect.stringMatching(/^support-group-create-/),
    })));

    fireEvent.change(screen.getByLabelText("SLA ticket type"), { target: { value: "safety" } });
    fireEvent.change(screen.getByLabelText("SLA priority"), { target: { value: "urgent" } });
    fireEvent.change(screen.getByLabelText("First response minutes"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Resolution minutes"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Create SLA policy" }));
    await waitFor(() => expect(adminApi.createSupportSlaPolicy).toHaveBeenCalledWith(expect.objectContaining({
      type: "safety", priority: "urgent", firstResponseMinutes: 10, resolutionMinutes: 60,
      isActive: true, idempotencyKey: expect.stringMatching(/^support-sla-create-/),
    })));
  });

  it("uses resource versions when deactivating a group or creating an append-only policy revision", async () => {
    render(<SupportRoutingConfigPage cityCode="hangzhou" />);
    await screen.findByText("Order Chinese");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate group" }));
    await waitFor(() => expect(adminApi.updateSupportSkillGroup).toHaveBeenCalledWith(group.skillGroupId, {
      isActive: false, expectedVersion: 2, idempotencyKey: expect.stringMatching(/^support-group-status-/),
    }));

    fireEvent.change(screen.getByLabelText("First response minutes"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Resolution minutes"), { target: { value: "360" } });
    fireEvent.click(screen.getByRole("button", { name: "Revise timing" }));
    await waitFor(() => expect(adminApi.reviseSupportSlaPolicy).toHaveBeenCalledWith(policy.policyId, {
      firstResponseMinutes: 45, resolutionMinutes: 360, expectedVersion: 1,
      idempotencyKey: expect.stringMatching(/^support-sla-revise-/),
    }));

    fireEvent.click(screen.getByRole("button", { name: "Deactivate policy" }));
    await waitFor(() => expect(adminApi.reviseSupportSlaPolicy).toHaveBeenCalledWith(policy.policyId, {
      isActive: false, expectedVersion: 1, idempotencyKey: expect.stringMatching(/^support-sla-deactivate-/),
    }));
  });

  it("prevents a language-specific default group and invalid SLA duration from being submitted", async () => {
    render(<SupportRoutingConfigPage cityCode="hangzhou" />);
    await screen.findByText("Order Chinese");
    fireEvent.change(screen.getByLabelText("Skill group name"), { target: { value: "Invalid default" } });
    fireEvent.change(screen.getByLabelText("Matched languages"), { target: { value: "zh-CN" } });
    fireEvent.click(screen.getByLabelText("Default fallback"));
    expect(screen.getByRole("button", { name: "Create skill group" })).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("First response minutes"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Resolution minutes"), { target: { value: "60" } });
    expect(screen.getByRole("button", { name: "Create SLA policy" })).toHaveProperty("disabled", true);
    expect(adminApi.createSupportSkillGroup).not.toHaveBeenCalled();
    expect(adminApi.createSupportSlaPolicy).not.toHaveBeenCalled();
  });
});
