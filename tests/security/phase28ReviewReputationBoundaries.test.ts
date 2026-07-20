import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase28 Review/Reputation engineering boundaries", { timeout: 20_000 }, () => {
  it("freezes the human-approved Entry Gate before runtime construction", () => {
    expect(runPowerShellGate("check-phase28-entry-boundaries.ps1")).toContain(
      "check-phase28-entry-boundaries: passed",
    );
  });

  it("preserves one Review writer, exact v1 delivery, city scope and protected-domain isolation", () => {
    expect(runPowerShellGate("check-phase28-review-reputation-boundaries.ps1")).toContain(
      "check-phase28-review-reputation-boundaries: passed",
    );
  });

  it("keeps the historical Phase23B gate fail-closed while admitting only the exact Phase28 order-trace redaction", () => {
    expect(runPowerShellGate("check-phase23b-boundaries.ps1")).toContain(
      "check-phase23b-boundaries: passed",
    );
  });

  it("keeps the historical Phase25 closure fail-closed with an exact Phase28 runtime allowlist", () => {
    expect(execFileSync("node", ["scripts/check-phase25-closure.mjs"], { encoding: "utf8" })).toContain(
      "[phase25-closure] PASS",
    );
  });

  it("keeps the historical Phase27A migration boundary fail-closed through the exact approved TKE COS 059", () => {
    expect(runPowerShellGate("check-phase27a-platform-delivery-boundaries.ps1")).toContain(
      "check-phase27a-platform-delivery-boundaries: passed",
    );
  });

  it("keeps the historical Phase27B migration boundary fail-closed through the exact approved TKE COS 059", () => {
    expect(runPowerShellGate("check-phase27b-notification-projection-boundaries.ps1")).toContain(
      "check-phase27b-notification-projection-boundaries: passed",
    );
  });

  it("keeps Phase27 B2/C migration boundaries fail-closed through the exact approved TKE COS 059", () => {
    expect(runPowerShellGate("check-phase27b-b2-notification-runtime-boundaries.ps1")).toContain(
      "check-phase27b-b2-notification-runtime-boundaries: passed",
    );
    expect(runPowerShellGate("check-phase27c-notification-api-boundaries.ps1")).toContain(
      "check-phase27c-notification-api-boundaries: passed",
    );
  });

  it("preserves the locked Phase27 completion gate with the exact approved 054-059 ledger", () => {
    expect(runPowerShellGate("check-phase27-completion-boundaries.ps1")).toContain(
      "check-phase27-completion-boundaries: passed",
    );
  });
});
