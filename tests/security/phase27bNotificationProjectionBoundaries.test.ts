import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase27B Notification Projection Foundation boundary", () => {
  it("keeps B1 dormant, source/protected domains read-only, and later runtime entries closed", () => {
    expect(runPowerShellGate("check-phase27b-notification-projection-boundaries.ps1")).toContain(
      "check-phase27b-notification-projection-boundaries: passed",
    );
  });
});
