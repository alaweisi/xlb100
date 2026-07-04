import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-worker-receivable-statement-queued-only.ps1",
  "check-worker-receivable-statement-city-scoped.ps1",
  "check-worker-receivable-statement-outbox-idempotent.ps1",
  "check-worker-receivable-statement-no-ledger-entries.ps1",
  "check-worker-receivable-statement-no-upstream-mutation.ps1",
  "check-worker-receivable-statement-no-payout-paid.ps1",
  "check-worker-receivable-statement-no-provider-withdraw-ui.ps1",
  "check-worker-receivable-statement-no-refund-aftersale-reversal.ps1",
] as const;

describe("Phase 8F architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toContain("PASS");
  });
});

describe("Phase 8F payout boundary", () => {
  it("has no payout table migration", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const migration = await readFile(join(process.cwd(), "db/migrations/017_worker_receivable_statement.sql"), "utf8");
    expect(migration).toMatch(/worker_receivable_statements/);
    expect(migration).not.toMatch(/CREATE TABLE payout/i);
    expect(migration).not.toMatch(/\bpaid\b/i);
    expect(migration).not.toMatch(/payment_instruction/i);
  });
});
