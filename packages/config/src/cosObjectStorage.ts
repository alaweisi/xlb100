import { readFileSync } from "node:fs";

type CosEnvironment = Readonly<Record<string, string | undefined>>;

export interface CosObjectStorageConfig {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  timeoutMs: number;
}

function required(environment: CosEnvironment, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required for Tencent COS`);
  return value;
}

function readSecretFile(environment: CosEnvironment, key: string): string {
  const path = required(environment, key);
  let value: string;
  try {
    value = readFileSync(path, "utf8").trim();
  } catch {
    throw new Error(`${key} must point to a readable secret file`);
  }
  if (!value) throw new Error(`${key} must point to a non-empty secret file`);
  return value;
}

function readTimeout(environment: CosEnvironment): number {
  const raw = environment.XLB_COS_TIMEOUT_MS?.trim() ?? "10000";
  const timeoutMs = Number(raw);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("XLB_COS_TIMEOUT_MS must be an integer between 1000 and 60000");
  }
  return timeoutMs;
}

/**
 * Loads COS credentials only from mounted secret files. This module prepares
 * the TKE runtime contract but does not enable COS in the provider factory.
 */
export function loadCosObjectStorageConfig(
  environment: CosEnvironment = process.env,
): CosObjectStorageConfig {
  const bucket = required(environment, "XLB_COS_BUCKET");
  if (!/^[a-z0-9][a-z0-9-]{0,48}-\d{5,}$/.test(bucket)) {
    throw new Error("XLB_COS_BUCKET must include the Tencent Cloud APPID suffix");
  }

  const region = required(environment, "XLB_COS_REGION");
  if (!/^ap-[a-z0-9-]+$/.test(region)) {
    throw new Error("XLB_COS_REGION must be a Tencent Cloud region such as ap-guangzhou");
  }

  return Object.freeze({
    bucket,
    region,
    secretId: readSecretFile(environment, "XLB_COS_SECRET_ID_FILE"),
    secretKey: readSecretFile(environment, "XLB_COS_SECRET_KEY_FILE"),
    timeoutMs: readTimeout(environment),
  });
}
