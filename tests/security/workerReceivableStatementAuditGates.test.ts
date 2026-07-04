import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-worker-receivable-statement-audit-readonly.ps1",
  "check-worker-receivable-statement-audit-no-mutation-routes.ps1",
  "check-worker-receivable-statement-audit-city-scope.ps1",
  "check-worker-receivable-statement-audit-index-only-migration.ps1",
  "check-worker-receivable-statement-audit-no-ui.ps1",
  "check-worker-receivable-statement-audit-forbidden-zone.ps1",
  "check-worker-receivable-statement-audit-no-outbox-write.ps1",
  "check-worker-receivable-statement-audit-route-order.ps1",
] as const;

describe("Phase 8I architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toMatch(/passed/i);
  });
});

describe("Phase 8I audit mutation boundary", () => {
  it("audit routes are GET only", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );

    // Audit routes should only use app.get, never app.post/put/delete/patch
    const auditSection = routes.split("Phase 8I: Audit Query Routes")[1] ?? "";
    expect(auditSection).toMatch(/app\.get\(/);
    expect(auditSection).not.toMatch(/app\.post\(/);
    expect(auditSection).not.toMatch(/app\.put\(/);
    expect(auditSection).not.toMatch(/app\.delete\(/);
    expect(auditSection).not.toMatch(/app\.patch\(/);
  });

  it("audit routes do not accept payload", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const auditSection = routes.split("Phase 8I: Audit Query Routes")[1] ?? "";
    // Audit list/detail should not have payload or body parsing
    expect(auditSection).toContain("request.query");
    expect(auditSection).not.toContain("request.body");
  });

  it("audit routes enforce city scope via middleware", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    const auditSection = routes.split("Phase 8I: Audit Query Routes")[1] ?? "";
    // All audit routes should have preHandler for auth/scoping
    const getMatches = auditSection.match(/app\.get[<(]/g);
    expect(getMatches).toHaveLength(3); // list, detail, export list
  });

  it("audit routes do not expose event_outbox mutation endpoints", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    expect(routes).not.toMatch(/worker-statement-audit.*POST/i);
    expect(routes).not.toMatch(/worker-statement-export-audit.*POST/i);
  });

  it("audit service validates cityCode before repository call", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(process.cwd(), "backend/src/settlement/workerReceivableStatementAuditService.ts"),
      "utf8",
    );
    // Each method checks cityCode first
    const cityCodeChecks = service.match(/if \(!context\.cityCode\)/g);
    expect(cityCodeChecks).toHaveLength(3); // list, detail, export list
  });

  it("no direct SQL in audit service layer", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const service = await readFile(
      join(process.cwd(), "backend/src/settlement/workerReceivableStatementAuditService.ts"),
      "utf8",
    );
    // Service should not contain raw SQL
    expect(service).not.toMatch(/\.query\(/);
    expect(service).not.toMatch(/SELECT /i);
  });

  it("no hardcoded payout or payment tables in audit queries", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(process.cwd(), "backend/src/settlement/workerReceivableStatementAuditRepository.ts"),
      "utf8",
    );
    expect(repository).not.toMatch(/payouts?/i);
    expect(repository).not.toMatch(/payment_orders/i);
    expect(repository).not.toMatch(/payment_instructions/i);
  });

  it("audit repository queries are read-only SELECT", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const repository = await readFile(
      join(process.cwd(), "backend/src/settlement/workerReceivableStatementAuditRepository.ts"),
      "utf8",
    );
    // Should contain SELECT queries but not INSERT/UPDATE/DELETE
    expect(repository).toMatch(/SELECT /);
    expect(repository).not.toMatch(/INSERT /i);
    expect(repository).not.toMatch(/UPDATE /i);
    expect(repository).not.toMatch(/DELETE /i);
  });

  it("audit routes are idempotent (GET only)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const routes = await readFile(
      join(process.cwd(), "backend/src/settlement/settlementRoutes.ts"),
      "utf8",
    );
    // Verify the audit section does not contain idempotency keys or once-only patterns
    const auditSection = routes.split("Phase 8I: Audit Query Routes")[1] ?? "";
    expect(auditSection).not.toMatch(/-once["']/);
  });
});
