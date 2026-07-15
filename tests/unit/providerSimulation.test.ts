import { describe, expect, it } from "vitest";
import {
  applyProviderFault,
  SimulatedProviderError,
  type ProviderTransportFault,
} from "../../backend/src/providers/providerSimulation.js";

describe("provider fault model", () => {
  it("does nothing when no fault is selected", async () => {
    await expect(applyProviderFault("sms")).resolves.toBeUndefined();
  });

  it.each([
    ["timeout", "SIMULATED_TIMEOUT", true],
    ["transient_failure", "SIMULATED_TRANSIENT_FAILURE", true],
    ["permanent_failure", "SIMULATED_PERMANENT_FAILURE", false],
    ["rate_limited", "SIMULATED_RATE_LIMIT", true],
  ] as const)("models %s truthfully", async (transport, code, retryable) => {
    let error: unknown;
    try {
      await applyProviderFault("payment", {
        transport: transport as ProviderTransportFault,
        retryAfterMs: 2_500,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SimulatedProviderError);
    expect(error).toMatchObject({
      capability: "payment",
      code,
      retryable,
      externalProviderExecuted: false,
    });
    if (transport === "rate_limited") {
      expect(error).toMatchObject({ retryAfterMs: 2_500 });
    }
  });
});
