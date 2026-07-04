import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-settlement-payable-confirmed-only.ps1",
  "check-settlement-payable-city-scoped.ps1",
  "check-settlement-payable-outbox-idempotent.ps1",
  "check-settlement-payable-no-ledger-entries.ps1",
  "check-settlement-payable-no-upstream-mutation.ps1",
  "check-settlement-payable-no-payout-paid.ps1",
  "check-settlement-payable-no-provider-withdraw-ui.ps1",
  "check-settlement-payable-no-refund-aftersale-reversal.ps1",
] as const;

describe("Phase 8D architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toContain("PASS");
  });
});

describe("Phase 8D payout boundary", () => {
  it("has no payout table migration", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const migration = await readFile(join(process.cwd(), "db/migrations/015_settlement_payable_readiness.sql"), "utf8");
    expect(migration).toMatch(/settlement_payables/);
    expect(migration).not.toMatch(/CREATE TABLE payout/i);
    expect(migration).not.toMatch(/\bpaid\b/i);
  });
});
