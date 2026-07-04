import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-phase8k-readonly.ps1",
  "check-phase8k-no-mutation-routes.ps1",
  "check-phase8k-city-scope.ps1",
  "check-phase8k-no-migration.ps1",
  "check-phase8k-no-ui.ps1",
  "check-phase8k-forbidden-zone.ps1",
  "check-phase8k-no-outbox-write.ps1",
  "check-phase8k-route-order.ps1",
] as const;

describe("Phase 8K architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toMatch(/passed/i);
  });
});

describe("Phase 8K audit summary boundary", () => {
  it("audit summary route is GET only", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );

    // Phase 8K section should only use app.get, never app.post/put/delete/patch
    const phase8kSection = routes.split("Phase 8K")[1] ?? "";
    // If there's a later phase after 8K, isolate to the 8K section
    const isolated = phase8kSection.split("Phase 8L")[0];
    expect(isolated).toMatch(/app\.get\(/);
    expect(isolated).not.toMatch(/app\.post\(/);
    expect(isolated).not.toMatch(/app\.put\(/);
    expect(isolated).not.toMatch(/app\.delete\(/);
    expect(isolated).not.toMatch(/app\.patch\(/);
  });

  it("audit summary route does not accept payload", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const phase8kSection = routes.split("Phase 8K")[1] ?? "";
    const isolated = phase8kSection.split("Phase 8L")[0];
    // Audit summary route should parse query params, not body
    expect(isolated).toContain("request.query");
    expect(isolated).not.toContain("request.body");
  });

  it("audit summary route enforces city scope via middleware", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const phase8kSection = routes.split("Phase 8K")[1] ?? "";
    const isolated = phase8kSection.split("Phase 8L")[0];
    // The audit summary route should have preHandler for auth/scoping
    const getMatches = isolated.match(/app\.get[<(]/g);
    expect(getMatches).toHaveLength(1); // single GET route in 8K section
  });

  it("audit summary route does not expose event_outbox mutation endpoints", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    expect(routes).not.toMatch(/audit-summary.*POST/i);
  });

  it("audit summary service validates cityCode before repository call", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/settlementAuditSummaryService.ts",
      ),
      "utf8",
    );
    // The only method checks cityCode first
    const cityCodeChecks = service.match(/if \(!context\.cityCode\)/g);
    expect(cityCodeChecks).toHaveLength(1);
  });

  it("no direct SQL in audit summary service layer", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/settlementAuditSummaryService.ts",
      ),
      "utf8",
    );
    // Service should not contain raw SQL
    expect(service).not.toMatch(/\.query\(/);
    expect(service).not.toMatch(/SELECT /i);
  });

  it("repository queries are read-only SELECT, no mutation statements", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/settlementAuditSummaryRepository.ts",
      ),
      "utf8",
    );
    // Should contain SELECT queries but not INSERT/UPDATE/DELETE
    expect(repository).toMatch(/SELECT /);
    expect(repository).not.toMatch(/INSERT /i);
    expect(repository).not.toMatch(/UPDATE /i);
    expect(repository).not.toMatch(/DELETE /i);
    // Should not contain any CREATE TABLE
    expect(repository).not.toMatch(/CREATE\s+TABLE/i);
  });

  it("no payout tables or payment_orders referenced in audit repository", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/settlementAuditSummaryRepository.ts",
      ),
      "utf8",
    );
    expect(repository).not.toMatch(/payouts?/i);
    expect(repository).not.toMatch(/payment_orders/i);
    expect(repository).not.toMatch(/payment_instructions/i);
  });

  it("repository enforces city scope via assertCityScopedContext", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/settlementAuditSummaryRepository.ts",
      ),
      "utf8",
    );
    expect(repository).toMatch(/assertCityScopedContext/);
    // All queries should filter by city_code
    expect(repository).toMatch(/city_code\s*=\s*\?/);
  });

  it("audit summary route is idempotent (GET only, no -once pattern)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const phase8kSection = routes.split("Phase 8K")[1] ?? "";
    const isolated = phase8kSection.split("Phase 8L")[0];
    // No -once routes for 8K
    expect(isolated).not.toMatch(/-once["']/);
  });

  it("no hardcoded forbidden phase 8K terms in service", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/settlementAuditSummaryService.ts",
      ),
      "utf8",
    );
    expect(service).not.toMatch(/\bpayout\b/i);
    expect(service).not.toMatch(/\bpaid\b/i);
    expect(service).not.toMatch(/\bwithdraw\b/i);
    expect(service).not.toMatch(/\brefund\b/i);
    expect(service).not.toMatch(/\baftersale\b/i);
    expect(service).not.toMatch(/\bnotification\b/i);
  });

  it("no hardcoded forbidden phase 8K terms in repository", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/settlementAuditSummaryRepository.ts",
      ),
      "utf8",
    );
    // The repository reads from settlement_batches, settlement_items,
    // settlement_payables, settlement_payable_queue tables only
    expect(repository).toMatch(/settlement_batches/);
    expect(repository).toMatch(/settlement_items/);
    expect(repository).not.toMatch(/\bpaid\b/i);
    expect(repository).not.toMatch(/\bwithdraw\b/i);
  });
});
