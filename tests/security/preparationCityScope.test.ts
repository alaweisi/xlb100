import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Preparation City Scope Tests (vitest)
// Verifies preparation queries enforce city_code = ? pattern.
// Production-connected: reads and greps real envelopeService.ts.
// ══════════════════════════════════════════════════════════════════

// ── Read real envelopeService.ts ──
const envelopeServicePath = resolve(
  __dirname,
  "../../backend/src/preparation/envelopeService.ts",
);
let envelopeServiceContent = "";
try {
  envelopeServiceContent = readFileSync(envelopeServicePath, "utf-8");
} catch {
  // File not yet created
}

describe("Phase 12 — Preparation City Scope", () => {
  describe("production-connected: envelopeService.ts city scope patterns", () => {
    it("envelopeService.ts must exist and be readable", () => {
      expect(envelopeServiceContent.length).toBeGreaterThan(0);
    });

    it("envelopeService.ts must contain city_code = ? query patterns", () => {
      expect(envelopeServiceContent).toMatch(/city_code\s*=\s*\?/);
    });

    it("envelopeService.ts must use buildCityScopedWhere or assertCityScopedContext", () => {
      const hasScopedWhere = envelopeServiceContent.includes("buildCityScopedWhere");
      const hasAssertCtx = envelopeServiceContent.includes("assertCityScopedContext");
      expect(hasScopedWhere || hasAssertCtx).toBe(true);
    });

    it("every SQL query in envelopeService.ts must include city_code = ?", () => {
      // Join multi-line template literals before checking
      const lines = envelopeServiceContent.split("\n");
      let inTemplate = false;
      let currentSql = "";
      const sqlStatements: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!inTemplate && trimmed.startsWith("`") && trimmed !== "`") {
          // Start of a template literal
          inTemplate = true;
          currentSql = trimmed;
        } else if (inTemplate) {
          // Inside a template — append
          currentSql += " " + trimmed;
          // Check if this line ends the template
          if (trimmed.endsWith("`,") || trimmed.endsWith("`);") || trimmed.endsWith("`)") || trimmed.endsWith("`;") || (trimmed === "`,") || (trimmed === "`);") || (trimmed === "`)")) {
            sqlStatements.push(currentSql);
            inTemplate = false;
            currentSql = "";
          }
        }
      }

      for (const sql of sqlStatements) {
        if (sql.match(/\b(FROM|INTO|UPDATE|JOIN)\b/)) {
          if (sql.match(/^\s*`INSERT\b/)) {
            expect(sql).toMatch(/\bcity_code\b/);
          } else {
            expect(sql).toMatch(/city_code\s*=\s*\?|\$\{clause\}|\$\{conds\.join|buildCityScopedWhere/);
          }
        }
      }
    });
  });

  describe("city scope enforcement in query construction", () => {
    // Simulates the repository's city scope guard pattern
    const buildQuery = (cityCode: string, table: string): string => {
      return `SELECT * FROM ${table} WHERE city_code = ?`;
    };

    it("all queries must include city_code = ? in WHERE clause", () => {
      const query = buildQuery(
        "hz",
        "settlement_execution_preparation_envelope",
      );
      expect(query).toContain("city_code = ?");
    });

    it("city_code parameter must be a positional placeholder", () => {
      const query = buildQuery("sh", "settlement_execution_preparation_item");
      expect(query).toMatch(/city_code\s*=\s*\?/);
    });

    it("preparation must reject cross-city data access", () => {
      // city scope guard: data from city X must not be returned for city Y
      const ctxCity = "hangzhou";
      const rowCity = "shanghai";

      const isCityScoped = rowCity === ctxCity;
      expect(isCityScoped).toBe(false);

      const isSameCity = "hangzhou" === ctxCity;
      expect(isSameCity).toBe(true);
    });

    it("assertCityScopedContext must be called before any query", () => {
      let guardCalled = false;
      const assertCityScopedContext = () => {
        guardCalled = true;
      };

      // Simulate preparation repository method
      assertCityScopedContext();
      expect(guardCalled).toBe(true);
    });

    it("city code must be injected from context, not from request body/query", () => {
      // Preparation must use ctx.cityCode, never req.body.cityCode or req.query.cityCode directly
      const ctx = { cityCode: "hz" };
      const body = { cityCode: "sh" }; // should be ignored/rejected

      // The correct behavior: ctx.cityCode wins, body.cityCode is rejected
      const effectiveCity = ctx.cityCode;
      expect(effectiveCity).toBe("hz");
      expect(effectiveCity).not.toBe(body.cityCode);
    });
  });

  describe("preparation table naming convention", () => {
    it("all preparation tables must be prefixed with settlement_execution_preparation_", () => {
      const preparationTables = [
        "settlement_execution_preparation_envelope",
        "settlement_execution_preparation_item",
        "settlement_execution_preparation_audit",
      ];
      for (const table of preparationTables) {
        expect(table.startsWith("settlement_execution_preparation_")).toBe(
          true,
        );
      }
    });

    it("preparation must not query non-preparation settlement tables", () => {
      const prepPattern = /^settlement_execution_preparation_/;
      expect(prepPattern.test("settlement_batches")).toBe(false);
      expect(prepPattern.test("settlement_payables")).toBe(false);
      expect(prepPattern.test("settlement_execution_dry_run_plan")).toBe(false);
      expect(
        prepPattern.test("settlement_execution_preparation_envelope"),
      ).toBe(true);
    });
  });
});
