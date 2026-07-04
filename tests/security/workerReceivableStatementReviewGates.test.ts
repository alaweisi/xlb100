import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const gates = [
  "check-worker-receivable-statement-review-created-only.ps1",
  "check-worker-receivable-statement-review-city-scoped.ps1",
  "check-worker-receivable-statement-review-outbox-idempotent.ps1",
  "check-worker-receivable-statement-review-no-ledger-entries.ps1",
  "check-worker-receivable-statement-review-no-upstream-mutation.ps1",
  "check-worker-receivable-statement-review-no-payout-paid.ps1",
  "check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1",
  "check-worker-receivable-statement-review-no-refund-aftersale-reversal.ps1",
] as const;

describe("Phase 8G architecture gates", () => {
  it.each(gates)("passes %s", (gate) => {
    expect(runPowerShellGate(gate)).toContain("PASS");
  });
});

describe("Phase 8G payout boundary", () => {
  it("has no payout table migration", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const migration = await readFile(join(process.cwd(), "db/migrations/018_worker_receivable_statement_review.sql"), "utf8");
    expect(migration).toMatch(/worker_receivable_statement_reviews/);
    expect(migration).not.toMatch(/CREATE TABLE payout/i);
    expect(migration).not.toMatch(/\bpaid\b/i);
    expect(migration).not.toMatch(/payment_instruction/i);
  });
});
