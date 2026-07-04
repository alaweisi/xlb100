import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-settlement-payable-queue-payable-only.ps1",
  "check-settlement-payable-queue-city-scoped.ps1",
  "check-settlement-payable-queue-outbox-idempotent.ps1",
  "check-settlement-payable-queue-no-ledger-entries.ps1",
  "check-settlement-payable-queue-no-upstream-mutation.ps1",
  "check-settlement-payable-queue-no-payout-paid.ps1",
  "check-settlement-payable-queue-no-provider-withdraw-ui.ps1",
  "check-settlement-payable-queue-no-refund-aftersale-reversal.ps1",
] as const;

describe("Phase 8E architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toContain("PASS");
  });
});

describe("Phase 8E payout boundary", () => {
  it("has no payout table migration", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const migration = await readFile(join(process.cwd(), "db/migrations/016_settlement_payable_queue.sql"), "utf8");
    expect(migration).toMatch(/settlement_payable_queue/);
    expect(migration).not.toMatch(/CREATE TABLE payout/i);
    expect(migration).not.toMatch(/\bpaid\b/i);
  });
});
