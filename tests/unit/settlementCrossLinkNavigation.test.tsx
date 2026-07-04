// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { buildHash } from "../../apps/admin/src/hashParams";

describe("Phase 9D — Cross-Link Navigation", () => {
  describe("unit — buildHash", () => {
    it("preserves route without params", () => {
      expect(buildHash("/settlement-ops/exports")).toBe("#/settlement-ops/exports");
    });
    it("appends cityCode query param", () => {
      expect(buildHash("/settlement-ops/exports", { cityCode: "shanghai" }))
        .toBe("#/settlement-ops/exports?cityCode=shanghai");
    });
    it("appends multiple params", () => {
      const h = buildHash("/settlement-ops/exports", { cityCode: "shanghai", statementId: "stmt-001" });
      expect(h).toContain("cityCode=shanghai");
      expect(h).toContain("statementId=stmt-001");
    });
    it("removes empty params", () => {
      expect(buildHash("/settlement-ops/exports", { cityCode: "", statementId: "x" }))
        .toBe("#/settlement-ops/exports?statementId=x");
    });
    it("returns clean route when all params empty", () => {
      expect(buildHash("/settlement-ops/exports", { cityCode: "" })).toBe("#/settlement-ops/exports");
    });
    it("returns clean route when params undefined", () => {
      expect(buildHash("/settlement-ops/exports")).toBe("#/settlement-ops/exports");
    });
    it("builds detail route with cityCode", () => {
      const h = buildHash("/settlement-ops/statements/stmt-001", { cityCode: "hangzhou" });
      expect(h).toBe("#/settlement-ops/statements/stmt-001?cityCode=hangzhou");
    });
  });

  describe("unit — cross-link params", () => {
    it("detail→exports link includes statementId", () => {
      const h = buildHash("/settlement-ops/exports", { statementId: "stmt-001", cityCode: "hangzhou" });
      expect(h).toContain("statementId=stmt-001");
    });
    it("exports→detail link includes real statementId", () => {
      const h = buildHash("/settlement-ops/statements/stmt-001", { cityCode: "hangzhou" });
      expect(h).toContain("stmt-001");
    });
    it("does not invent fake statementId when missing", () => {
      const h = buildHash("/settlement-ops/exports", { cityCode: "shanghai" });
      expect(h).not.toContain("statementId");
    });
    it("dashboard→detail preserves cityCode", () => {
      const h = buildHash("/settlement-ops/statements/stmt-001", { cityCode: "hangzhou" });
      expect(h).toContain("cityCode=hangzhou");
    });
    it("dashboard→exports preserves cityCode", () => {
      const h = buildHash("/settlement-ops/exports", { cityCode: "hangzhou" });
      expect(h).toContain("cityCode=hangzhou");
    });
  });

  describe("security — no forbidden terms", () => {
    const forbidden = ["payout", "paid", "payment_instruction", "provider", "notification",
      "refund", "reversal", "repair", "backfill"];
    it("buildHash output contains no forbidden terms", () => {
      const h = buildHash("/settlement-ops/exports", { cityCode: "hangzhou", statementId: "stmt-001" });
      for (const term of forbidden) {
        expect(h.toLowerCase()).not.toContain(term.toLowerCase());
      }
    });
  });

  describe("contract — missing params", () => {
    it("missing cityCode does not inject default", () => {
      const h = buildHash("/settlement-ops/exports");
      expect(h).not.toContain("cityCode");
      expect(h).not.toContain("hangzhou");
    });
    it("empty cityCode not persisted", () => {
      const h = buildHash("/settlement-ops/exports", { cityCode: "" });
      expect(h).not.toContain("cityCode");
    });
  });
});
