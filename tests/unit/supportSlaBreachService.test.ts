import { describe, expect, it } from "vitest";
import { nextSupportPriority } from "../../backend/src/support/ticket/supportSlaBreachService.js";

describe("support SLA breach priority ladder", () => {
  it("raises exactly one step and leaves critical capped", () => {
    expect(["low", "normal", "high", "urgent", "critical"].map((priority) =>
      nextSupportPriority(priority as "low" | "normal" | "high" | "urgent" | "critical")))
      .toEqual(["normal", "high", "urgent", "critical", "critical"]);
  });
});
