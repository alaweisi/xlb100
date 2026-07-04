import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-worker-receivable-statement-export-approved-only.ps1",
  "check-worker-receivable-statement-export-city-scoped.ps1",
  "check-worker-receivable-statement-export-outbox-idempotent.ps1",
  "check-worker-receivable-statement-export-no-ledger-entries.ps1",
  "check-worker-receivable-statement-export-no-upstream-mutation.ps1",
  "check-worker-receivable-statement-export-no-payout-paid.ps1",
  "check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1",
  "check-worker-receivable-statement-export-no-refund-aftersale-reversal.ps1",
] as const;

describe("Phase 8H architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toContain("PASS");
  });
});

describe("Phase 8H payout boundary", () => {
  it("has no payout table migration", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const migration = await readFile(join(process.cwd(), "db/migrations/019_worker_receivable_statement_export.sql"), "utf8");
    expect(migration).toMatch(/worker_receivable_statement_exports/);
    expect(migration).not.toMatch(/CREATE TABLE payout/i);
    expect(migration).not.toMatch(/\bpaid\b/i);
    expect(migration).not.toMatch(/payment_instruction/i);
  });
});
