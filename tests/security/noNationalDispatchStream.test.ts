import { describe, it, expect } from "vitest";
import { getDispatchStreamName } from "../../backend/src/streams/cityStreamNames.js";
import { runPowerShellGateResult } from "./helpers/runPowerShellGate.js";

describe("noNationalDispatchStream", () => {
  it("gate script passes", () => {
    expect(
      runPowerShellGateResult("check-no-national-dispatch-stream.ps1").code,
    ).toBe(0);
  });

  it("no national stream names in cityStreamNames", () => {
    expect(() => getDispatchStreamName("all")).toThrow();
    expect(() => getDispatchStreamName("global")).toThrow();
  });
});
