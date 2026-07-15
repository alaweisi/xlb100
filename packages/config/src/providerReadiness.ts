export type PaymentProviderMode = "mock";
export type SmsProviderMode = "mock";
export type ObjectStorageProviderMode = "local" | "mock";
export type GeoProviderMode = "local_mock";
export type EnterpriseWebhookProviderMode = "mock_only";

export interface ProviderReadinessConfig {
  externalExecutionEnabled: false;
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

/**
 * Provider execution is deliberately closed while XLB has no approved legal
 * entity, credentials, commercial account, filing, or production activation.
 * Adding a real mode requires a reviewed code change; an environment variable
 * alone can never enable external execution in this build.
 */
export function loadProviderReadinessConfig(
  environment: ProviderEnvironment = process.env,
): ProviderReadinessConfig {
  const externalExecutionRequested =
    (environment.XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED ?? "false").trim().toLowerCase();
  if (externalExecutionRequested !== "false") {
    throw new Error(
      "XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED must remain false until separately authorized",
    );
  }

  return Object.freeze({
    externalExecutionEnabled: false,
    paymentProvider: readClosedMode(environment, "XLB_PAYMENT_PROVIDER", ["mock"], "mock"),
    smsProvider: readClosedMode(environment, "XLB_SMS_PROVIDER", ["mock"], "mock"),
    objectStorageProvider: readClosedMode(
      environment,
      "XLB_OBJECT_STORAGE_PROVIDER",
      ["local", "mock"],
      "local",
    ),
    geoProvider: readClosedMode(environment, "XLB_GEO_PROVIDER", ["local_mock"], "local_mock"),
    enterpriseWebhookProvider: readClosedMode(
      environment,
      "XLB_ENTERPRISE_WEBHOOK_PROVIDER",
      ["mock_only"],
      "mock_only",
    ),
  });
}
