import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase27A Platform Delivery boundary", () => {
  it("keeps source/protected domains read-only while later Notification remains separately gated", () => {
    expect(runPowerShellGate("check-phase27a-platform-delivery-boundaries.ps1")).toContain(
      "check-phase27a-platform-delivery-boundaries: passed",
    );
  });
});
