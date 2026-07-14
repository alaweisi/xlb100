import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase29 Marketing/Coupon engineering boundaries", () => {
  it("freezes the human-approved Phase29 Entry Gate", () => {
    expect(runPowerShellGate("check-phase29-entry-boundaries.ps1")).toContain(
      "check-phase29-entry-boundaries: passed",
    );
  });

  it("preserves coupon-first money, city, migration, UI and protected-domain boundaries", () => {
    expect(runPowerShellGate("check-phase29-marketing-coupon-boundaries.ps1")).toContain(
      "check-phase29-marketing-coupon-boundaries: passed",
    );
  });
});
