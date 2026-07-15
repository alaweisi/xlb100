import { describe, expect, it } from "vitest";
import {
  MockPaymentProtocolError,
  MockPaymentProvider,
} from "../../backend/src/providers/payment/mockPaymentProvider.js";
import { SimulatedProviderError } from "../../backend/src/providers/providerSimulation.js";

const preparation = {
  paymentOrderId: "pay-1",
  orderId: "order-1",
  amount: 128,
  currency: "CNY" as const,
};

describe("mock payment provider", () => {
  it("prepares a deterministic mock reference without external execution", async () => {
    const provider = new MockPaymentProvider();
    const first = await provider.prepare(preparation);
    const second = await provider.prepare(preparation);
    expect(first).toMatchObject({
      provider: "mock",
      providerStatus: "prepared_mock",
      externalProviderExecuted: false,
    });
    expect(first.providerOrderRef).toBe(second.providerOrderRef);
  });

  it("models normal and duplicate callbacks", async () => {
    const provider = new MockPaymentProvider();
    const input = { paymentOrderId: "pay-1", providerTradeNo: "trade-1" };
    await expect(provider.verifyCallback(input)).resolves.toMatchObject({
      providerStatus: "callback_verified_mock",
      duplicate: false,
      externalProviderExecuted: false,
    });
    await expect(provider.verifyCallback({ ...input, scenario: "duplicate" })).resolves
      .toMatchObject({ providerStatus: "callback_duplicate_mock", duplicate: true });
  });

  it.each(["invalid_signature", "out_of_order"] as const)(
    "rejects the %s callback scenario",
    async (scenario) => {
      const provider = new MockPaymentProvider();
      await expect(provider.verifyCallback({
        paymentOrderId: "pay-1",
        providerTradeNo: "trade-1",
        scenario,
      })).rejects.toBeInstanceOf(MockPaymentProtocolError);
    },
  );

  it("injects a retryable timeout before payment preparation", async () => {
    const provider = new MockPaymentProvider({ transport: "timeout" });
    await expect(provider.prepare(preparation)).rejects.toMatchObject({
      code: "SIMULATED_TIMEOUT",
      retryable: true,
      externalProviderExecuted: false,
    } satisfies Partial<SimulatedProviderError>);
  });
});
