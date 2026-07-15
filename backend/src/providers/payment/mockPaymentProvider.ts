import { createHash } from "node:crypto";
import { loadProviderReadinessConfig } from "@xlb/config";
import type { ProviderFaultPlan } from "../providerSimulation.js";
import { applyProviderFault, SimulatedProviderError } from "../providerSimulation.js";

export interface PrepareMockPaymentInput {
  paymentOrderId: string;
  orderId: string;
  amount: number;
  currency: "CNY";
}

export interface MockPaymentPreparationEnvelope {
  provider: "mock";
  providerStatus: "prepared_mock";
  externalProviderExecuted: false;
  providerOrderRef: string;
  preparedAt: string;
}

export type MockPaymentCallbackScenario =
  | "normal"
  | "duplicate"
  | "out_of_order"
  | "invalid_signature";

export interface VerifyMockPaymentCallbackInput {
  paymentOrderId: string;
  providerTradeNo: string;
  scenario?: MockPaymentCallbackScenario;
}

export interface MockPaymentCallbackEnvelope {
  provider: "mock";
  providerStatus: "callback_verified_mock" | "callback_duplicate_mock";
  externalProviderExecuted: false;
  duplicate: boolean;
  providerTradeNo: string;
  verifiedAt: string;
}

export class MockPaymentProtocolError extends Error {
  readonly externalProviderExecuted = false;

  constructor(readonly code: "INVALID_SIGNATURE" | "OUT_OF_ORDER_CALLBACK") {
    super(`mock payment callback rejected: ${code.toLowerCase()}`);
    this.name = "MockPaymentProtocolError";
  }
}

export interface PaymentGatewayProvider {
  readonly kind: "mock";
  prepare(input: PrepareMockPaymentInput): Promise<MockPaymentPreparationEnvelope>;
  verifyCallback(input: VerifyMockPaymentCallbackInput): Promise<MockPaymentCallbackEnvelope>;
}

function stableMockReference(input: PrepareMockPaymentInput): string {
  return `mock_${createHash("sha256")
    .update(`${input.paymentOrderId}:${input.orderId}:${input.amount}:${input.currency}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export class MockPaymentProvider implements PaymentGatewayProvider {
  readonly kind = "mock" as const;

  constructor(private readonly faultPlan: ProviderFaultPlan = {}) {}

  async prepare(input: PrepareMockPaymentInput): Promise<MockPaymentPreparationEnvelope> {
    await applyProviderFault("payment", this.faultPlan);
    return {
      provider: "mock",
      providerStatus: "prepared_mock",
      externalProviderExecuted: false,
      providerOrderRef: stableMockReference(input),
      preparedAt: new Date().toISOString(),
    };
  }

  async verifyCallback(
    input: VerifyMockPaymentCallbackInput,
  ): Promise<MockPaymentCallbackEnvelope> {
    await applyProviderFault("payment", this.faultPlan);
    const scenario = input.scenario ?? "normal";
    if (scenario === "invalid_signature") {
      throw new MockPaymentProtocolError("INVALID_SIGNATURE");
    }
    if (scenario === "out_of_order") {
      throw new MockPaymentProtocolError("OUT_OF_ORDER_CALLBACK");
    }
    return {
      provider: "mock",
      providerStatus:
        scenario === "duplicate" ? "callback_duplicate_mock" : "callback_verified_mock",
      externalProviderExecuted: false,
      duplicate: scenario === "duplicate",
      providerTradeNo: input.providerTradeNo,
      verifiedAt: new Date().toISOString(),
    };
  }
}

export function createPaymentGatewayProvider(): PaymentGatewayProvider {
  const config = loadProviderReadinessConfig();
  if (config.paymentProvider === "mock") return new MockPaymentProvider();
  throw new SimulatedProviderError("payment", "SIMULATED_PERMANENT_FAILURE", false);
}

export const paymentGatewayProvider = createPaymentGatewayProvider();
