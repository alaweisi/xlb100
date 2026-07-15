import { describe, expect, it } from "vitest";
import { loadProviderReadinessConfig } from "@xlb/config";

describe("provider readiness configuration", () => {
  it("defaults every capability to truthful local or mock execution", () => {
    expect(loadProviderReadinessConfig({})).toEqual({
      externalExecutionEnabled: false,
      paymentProvider: "mock",
      smsProvider: "mock",
      objectStorageProvider: "local",
      geoProvider: "local_mock",
      enterpriseWebhookProvider: "mock_only",
    });
  });

  it("permits the in-memory object storage mock", () => {
    expect(loadProviderReadinessConfig({ XLB_OBJECT_STORAGE_PROVIDER: "mock" }))
      .toMatchObject({ objectStorageProvider: "mock", externalExecutionEnabled: false });
  });

  it.each([
    ["XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED", "true"],
    ["XLB_PAYMENT_PROVIDER", "wechat"],
    ["XLB_SMS_PROVIDER", "aliyun"],
    ["XLB_OBJECT_STORAGE_PROVIDER", "oss"],
    ["XLB_GEO_PROVIDER", "amap"],
    ["XLB_ENTERPRISE_WEBHOOK_PROVIDER", "https"],
  ])("rejects unauthorized provider configuration %s=%s", (key, value) => {
    expect(() => loadProviderReadinessConfig({ [key]: value })).toThrow();
  });
});
