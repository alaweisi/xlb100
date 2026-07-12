import type { SupportNluEnvelope, SupportNluInput, SupportNluProvider } from "./supportNluProvider.js";

export class MemorySupportNluMock implements SupportNluProvider {
  readonly kind = "mock" as const;
  constructor(private readonly fixture: Omit<SupportNluEnvelope,
    "provider" | "providerName" | "providerStatus" | "externalProviderExecuted" | "ruleVersion">) {}

  async classifyAndRetrieve(_input: SupportNluInput): Promise<SupportNluEnvelope> {
    return { ...this.fixture, provider: "mock", providerName: "xlb-memory-nlu-mock",
      providerStatus: "forced_mock", externalProviderExecuted: false,
      ruleVersion: "phase24e-explicit-memory-mock-v1" };
  }
}
