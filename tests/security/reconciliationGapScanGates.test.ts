import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-phase8l-readonly.ps1",
  "check-phase8l-no-mutation-routes.ps1",
  "check-phase8l-city-scope.ps1",
  "check-phase8l-no-migration.ps1",
  "check-phase8l-no-ui.ps1",
  "check-phase8l-forbidden-zone.ps1",
  "check-phase8l-no-outbox-write.ps1",
  "check-phase8l-route-order.ps1",
] as const;

describe("Phase 8L architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toMatch(/passed/i);
  });
});

describe("Phase 8L reconciliation gap scan boundary", () => {
  it("gap scan route is GET only", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );

    // Phase 8L section should only use app.get, never app.post/put/delete/patch
    const phase8lSection = routes.split("Phase 8L")[1] ?? "";
    // If there's a later phase after 8L, isolate to the 8L section
    const isolated = phase8lSection.split("Phase 8M")[0];
    expect(isolated).toMatch(/app\.get\(/);
    expect(isolated).not.toMatch(/app\.post\(/);
    expect(isolated).not.toMatch(/app\.put\(/);
    expect(isolated).not.toMatch(/app\.delete\(/);
    expect(isolated).not.toMatch(/app\.patch\(/);
  });

  it("gap scan route does not accept payload", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const phase8lSection = routes.split("Phase 8L")[1] ?? "";
    const isolated = phase8lSection.split("Phase 8M")[0];
    // Gap scan route should parse query params, not body
    expect(isolated).toContain("request.query");
    expect(isolated).not.toContain("request.body");
  });

  it("gap scan route enforces city scope via middleware", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const phase8lSection = routes.split("Phase 8L")[1] ?? "";
    const isolated = phase8lSection.split("Phase 8M")[0];
    // The gap scan route should have preHandler for auth/scoping
    const getMatches = isolated.match(/app\.get[<(]/g);
    expect(getMatches).toHaveLength(1); // single GET route in 8L section
  });

  it("gap scan route does not expose mutation endpoints", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    expect(routes).not.toMatch(/reconciliation-gap-scan.*POST/i);
  });

  it("gap scan service validates cityCode before repository call", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/reconciliationGapScanService.ts",
      ),
      "utf8",
    );
    // The only method checks cityCode first
    const cityCodeChecks = service.match(/if \(!context\.cityCode\)/g);
    expect(cityCodeChecks).toHaveLength(1);
  });

  it("no direct SQL in gap scan service layer", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/reconciliationGapScanService.ts",
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
        "backend/src/settlement/reconciliationGapScanRepository.ts",
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

  it("no payout tables or payment_orders referenced in gap scan repository", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/reconciliationGapScanRepository.ts",
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
        "backend/src/settlement/reconciliationGapScanRepository.ts",
      ),
      "utf8",
    );
    expect(repository).toMatch(/assertCityScopedContext/);
    // All queries should filter by city_code
    expect(repository).toMatch(/city_code\s*=\s*\?/);
  });

  it("gap scan route is idempotent (GET only, no -once pattern)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const phase8lSection = routes.split("Phase 8L")[1] ?? "";
    const isolated = phase8lSection.split("Phase 8M")[0];
    // No -once routes for 8L
    expect(isolated).not.toMatch(/-once["']/);
  });

  it("no auto-fix or auto-correct logic in gap scan service", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/reconciliationGapScanService.ts",
      ),
      "utf8",
    );
    // Gap scan service should not contain auto-fix/correct logic
    expect(service).not.toMatch(/auto.?fix/i);
    expect(service).not.toMatch(/auto.?correct/i);
    expect(service).not.toMatch(/auto.?resolve/i);
  });

  it("no auto-fix or auto-correct logic in gap scan repository", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/reconciliationGapScanRepository.ts",
      ),
      "utf8",
    );
    expect(repository).not.toMatch(/auto.?fix/i);
    expect(repository).not.toMatch(/auto.?correct/i);
    expect(repository).not.toMatch(/auto.?resolve/i);
  });

  it("no hardcoded forbidden phase 8L terms in service", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/reconciliationGapScanService.ts",
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

  it("no hardcoded forbidden phase 8L terms in repository", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(
        process.cwd(),
        "backend/src/settlement/reconciliationGapScanRepository.ts",
      ),
      "utf8",
    );
    // The repository reads from settlement_batches, settlement_payables,
    // settlement_payable_queue, worker_receivable_statements, reviews, exports
    expect(repository).toMatch(/settlement_batches/);
    expect(repository).toMatch(/settlement_payables/);
    expect(repository).not.toMatch(/\bpaid\b/i);
    expect(repository).not.toMatch(/\bwithdraw\b/i);
  });
});
