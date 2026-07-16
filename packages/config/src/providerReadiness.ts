export type PaymentProviderMode = "mock";
export type SmsProviderMode = "mock";
export type ObjectStorageProviderMode = "local" | "mock" | "cos";
export type GeoProviderMode = "local_mock";
export type EnterpriseWebhookProviderMode = "mock_only";

export interface ProviderReadinessConfig {
  externalExecutionEnabled: boolean;
  paymentProvider: PaymentProviderMode;
  smsProvider: SmsProviderMode;
  objectStorageProvider: ObjectStorageProviderMode;
  geoProvider: GeoProviderMode;
  enterpriseWebhookProvider: EnterpriseWebhookProviderMode;
}

type ProviderEnvironment = Readonly<Record<string, string | undefined>>;

function readClosedMode<T extends string>(
  environment: ProviderEnvironment,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = (environment[key] ?? fallback).trim().toLowerCase();
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
}

function readBoolean(environment: ProviderEnvironment, key: string, fallback = false): boolean {
  const value = (environment[key] ?? String(fallback)).trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} must be true or false`);
}

/**
 * External execution remains fail-closed. Tencent COS requires both selecting
 * the cos provider and explicitly enabling external provider execution. Every
 * other provider remains local/mock-only and rejects the global switch.
 */
export function loadProviderReadinessConfig(
  environment: ProviderEnvironment = process.env,
): ProviderReadinessConfig {
  const externalExecutionEnabled = readBoolean(
    environment,
    "XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED",
  );
  const objectStorageProvider = readClosedMode(
    environment,
    "XLB_OBJECT_STORAGE_PROVIDER",
    ["local", "mock", "cos"],
    "local",
  );
  if (objectStorageProvider === "cos" && !externalExecutionEnabled) {
    throw new Error(
      "Tencent COS requires XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true",
    );
  }
  if (objectStorageProvider !== "cos" && externalExecutionEnabled) {
    throw new Error(
      "XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true requires XLB_OBJECT_STORAGE_PROVIDER=cos",
    );
  }

  return Object.freeze({
    externalExecutionEnabled,
    paymentProvider: readClosedMode(environment, "XLB_PAYMENT_PROVIDER", ["mock"], "mock"),
    smsProvider: readClosedMode(environment, "XLB_SMS_PROVIDER", ["mock"], "mock"),
    objectStorageProvider,
    geoProvider: readClosedMode(environment, "XLB_GEO_PROVIDER", ["local_mock"], "local_mock"),
    enterpriseWebhookProvider: readClosedMode(
      environment,
      "XLB_ENTERPRISE_WEBHOOK_PROVIDER",
      ["mock_only"],
      "mock_only",
    ),
  });
}
