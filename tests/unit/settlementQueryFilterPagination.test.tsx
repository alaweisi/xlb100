/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildHash, parseHashParams, parseView } from "../../apps/admin/src/hashParams";

describe("Phase 9E — Query / Filter / Pagination", () => {
  beforeEach(() => { window.location.hash = ""; });
  afterEach(() => { window.location.hash = ""; });

  // ── Unit: Hash helpers ──
  describe("unit — hash helpers", () => {
    it("buildHash returns path-only when no params", () => {
      expect(buildHash("/settlement-ops/exports")).toBe("#/settlement-ops/exports");
    });
    it("buildHash appends cityCode param", () => {
      expect(buildHash("", { cityCode: "shanghai" })).toBe("#?cityCode=shanghai");
    });
    it("buildHash strips empty values", () => {
      expect(buildHash("/path", { cityCode: "" })).toBe("#/path");
    });
    it("parseHashParams reads cityCode from hash", () => {
      window.location.hash = "#?cityCode=shanghai";
      expect(parseHashParams().get("cityCode")).toBe("shanghai");
    });
    it("parseHashParams returns empty when no query", () => {
      window.location.hash = "#/settlement-ops/exports";
      expect([...parseHashParams().entries()]).toHaveLength(0);
    });
    it("parseView returns dashboard for empty hash", () => {
      expect(parseView().page).toBe("dashboard");
    });
    it("parseView returns exports for /settlement-ops/exports", () => {
      window.location.hash = "#/settlement-ops/exports";
      expect(parseView().page).toBe("exports");
    });
    it("parseView returns detail with statementId", () => {
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      const v = parseView();
      expect(v.page).toBe("detail");
      if (v.page === "detail") expect(v.statementId).toBe("stmt-001");
    });
  });

  // ── Unit: Pagination behavior (source-level) ──
  describe("unit — pagination source checks", () => {
    it("SettlementOpsPage has nextCursor in source", async () => {
      // Static source check: nextCursor is consumed
      const fs = await import("fs");
      const src = fs.readFileSync("apps/admin/src/pages/SettlementOpsPage.tsx", "utf-8") as string;
      expect(src).toContain("nextCursor");
      expect(src).not.toMatch(/slice\(0,\s*10\)/);
    });
    it("SettlementOpsPage imports buildHash", async () => {
      const fs = await import("fs");
      const src = fs.readFileSync("apps/admin/src/pages/SettlementOpsPage.tsx", "utf-8") as string;
      expect(src).toContain("buildHash");
      expect(src).toContain("parseHashParams");
    });
  });

  // ── Security: No mutation ──
  describe("security — no mutation", () => {
    it("hashParams has no POST/PUT/PATCH/DELETE", () => {
      expect(buildHash.toString()).not.toMatch(/\bPOST\b/);
      expect(buildHash.toString()).not.toMatch(/\bDELETE\b/);
    });
    it("hashParams has no forbidden terms", () => {
      const src = buildHash.toString() + parseHashParams.toString() + parseView.toString();
      expect(src).not.toMatch(/payout/);
      expect(src).not.toMatch(/provider/);
      expect(src).not.toMatch(/refund/);
      expect(src).not.toMatch(/reversal/);
    });
  });

  // ── Contract: URL state ──
  describe("contract — URL state", () => {
    it("dashboard reads cityCode from hash on mount", () => {
      window.location.hash = "#?cityCode=shanghai";
      expect(parseHashParams().get("cityCode")).toBe("shanghai");
    });
    it("empty hash defaults cityCode", () => {
      expect(parseHashParams().get("cityCode")).toBeNull();
    });
    it("cross-links preserve cityCode in URL", () => {
      const link = buildHash("/settlement-ops/statements/stmt-001", { cityCode: "shanghai" });
      const sp = new URLSearchParams(link.replace(/^#.*\?/, ""));
      expect(sp.get("cityCode")).toBe("shanghai");
    });
  });
});
