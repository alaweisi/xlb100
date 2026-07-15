export interface EnvConfig {
  nodeEnv: string;
  backendPort: number;
  autoRunEnabled: boolean;
  autoRunIntervalMs: number;
  autoRunCityCodes: string[];
  mysqlHost: string;
  mysqlPort: number;
  mysqlDatabase: string;
  mysqlUser: string;
  mysqlPassword: string;
  redisHost: string;
  redisPort: number;
  rateLimitBackend: "memory" | "redis";
  trustProxyHops: number;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtActiveKeyId: string;
  jwtKeys: Readonly<Record<string, string>>;
  jwtTtlSeconds: number;
  authPhoneHashSecret: string;
  authOtpPepper: string;
  authOtpTtlSeconds: number;
  authOtpMaxAttempts: number;
  authOtpLockSeconds: number;
  authOtpResendCooldownSeconds: number;
  authDebugCodeEnabled: boolean;
}

const LOCAL_JWT_SECRET = "change-me-in-production";
const LOCAL_MYSQL_PASSWORD = "xlb_local_password";
const LOCAL_PHONE_HASH_SECRET = "xlb-local-phone-hash-secret-change-before-production";
const LOCAL_OTP_PEPPER = "xlb-local-otp-pepper-change-before-production";

const WEAK_SECRET_VALUES = new Set([
  "change-me",
  "change-me-in-production",
  "changeme",
  "password",
  "replace_with_secret_manager_value",
  "secret",
  "xlb_local_password",
  LOCAL_PHONE_HASH_SECRET,
  LOCAL_OTP_PEPPER,
]);

function assertProductionSecret(name: string, value: string, minimumLength: number): void {
  const normalized = value.trim().toLowerCase();
  if (value.trim().length < minimumLength || WEAK_SECRET_VALUES.has(normalized)) {
    throw new Error(
      `${name} must be an explicit, non-default secret of at least ${minimumLength} characters in production`,
    );
  }
}

function validateProductionEnv(config: EnvConfig): void {
  if (config.nodeEnv !== "production") return;

  assertProductionSecret("JWT_SECRET", config.jwtSecret, 32);
  for (const [keyId, secret] of Object.entries(config.jwtKeys)) {
    assertProductionSecret(`JWT_KEYS_JSON[${keyId}]`, secret, 32);
  }
  assertProductionSecret("MYSQL_PASSWORD", config.mysqlPassword, 16);
  assertProductionSecret("AUTH_PHONE_HASH_SECRET", config.authPhoneHashSecret, 32);
  assertProductionSecret("AUTH_OTP_PEPPER", config.authOtpPepper, 32);
  if (!config.jwtIssuer.trim() || !config.jwtAudience.trim()) {
    throw new Error("JWT_ISSUER and JWT_AUDIENCE must be non-empty in production");
  }
  if (!Object.hasOwn(config.jwtKeys, config.jwtActiveKeyId)) {
    throw new Error("JWT_ACTIVE_KID must exist in JWT_KEYS_JSON");
  }
  if (config.rateLimitBackend !== "redis") {
    throw new Error("RATE_LIMIT_BACKEND must be redis in production");
  }
  if (config.trustProxyHops < 1) {
    throw new Error("TRUST_PROXY_HOPS must be at least 1 in production");
  }
}

function readEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function readEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

function readEnvBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true";
}

function readRateLimitBackend(nodeEnv: string): "memory" | "redis" {
  const fallback = nodeEnv === "production" ? "redis" : "memory";
  const value = readEnv("RATE_LIMIT_BACKEND", fallback).trim().toLowerCase();
  if (value === "memory" || value === "redis") return value;
  throw new Error("RATE_LIMIT_BACKEND must be memory or redis");
}

function readTrustProxyHops(nodeEnv: string): number {
  const fallback = nodeEnv === "production" ? 1 : 0;
  const raw = process.env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/u.test(raw)) throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  const value = Number.parseInt(raw, 10);
  if (value < 0 || value > 10) throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  return value;
}

function readEnvList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readJwtKeys(activeKeyId: string, fallbackSecret: string): Readonly<Record<string, string>> {
  const raw = process.env.JWT_KEYS_JSON;
  if (raw === undefined || raw.trim() === "") {
    return Object.freeze({ [activeKeyId]: fallbackSecret });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JWT_KEYS_JSON must be a JSON object of key ids to secrets");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JWT_KEYS_JSON must be a JSON object of key ids to secrets");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 5) {
    throw new Error("JWT_KEYS_JSON must contain between 1 and 5 verification keys");
  }
  const keys: Record<string, string> = {};
  for (const [keyId, secret] of entries) {
    if (!/^[A-Za-z0-9._-]{1,64}$/u.test(keyId) || typeof secret !== "string" || !secret.trim()) {
      throw new Error("JWT_KEYS_JSON contains an invalid key id or secret");
    }
    keys[keyId] = secret;
  }
  if (!Object.hasOwn(keys, activeKeyId)) {
    throw new Error("JWT_ACTIVE_KID must exist in JWT_KEYS_JSON");
  }
  return Object.freeze(keys);
}

/** Load env with defaults aligned to deploy/compose/docker-compose.local.yml */
export function loadEnv(): EnvConfig {
  const nodeEnv = readEnv("NODE_ENV", "development");
  const jwtSecret = readEnv("JWT_SECRET", LOCAL_JWT_SECRET);
  const jwtActiveKeyId = readEnv("JWT_ACTIVE_KID", "primary").trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/u.test(jwtActiveKeyId)) {
    throw new Error("JWT_ACTIVE_KID must be a safe key identifier");
  }
  const config: EnvConfig = {
    nodeEnv,
    backendPort: readEnvInt("BACKEND_PORT", 3000),
    autoRunEnabled: readEnvBool("AUTO_RUN_ENABLED", false),
    autoRunIntervalMs: readEnvInt("AUTO_RUN_INTERVAL_MS", 8000),
    autoRunCityCodes: readEnvList("AUTO_RUN_CITY_CODES", ["hangzhou"]),
    mysqlHost: readEnv("MYSQL_HOST", "127.0.0.1"),
    mysqlPort: readEnvInt("MYSQL_PORT", 3306),
    mysqlDatabase: readEnv("MYSQL_DATABASE", "xlb_local"),
    mysqlUser: readEnv("MYSQL_USER", "xlb"),
    mysqlPassword: readEnv("MYSQL_PASSWORD", LOCAL_MYSQL_PASSWORD),
    redisHost: readEnv("REDIS_HOST", "127.0.0.1"),
    redisPort: readEnvInt("REDIS_PORT", 6379),
    rateLimitBackend: readRateLimitBackend(nodeEnv),
    trustProxyHops: readTrustProxyHops(nodeEnv),
    jwtSecret,
    jwtIssuer: readEnv("JWT_ISSUER", "xlb-backend"),
    jwtAudience: readEnv("JWT_AUDIENCE", "xlb-apps"),
    jwtActiveKeyId,
    jwtKeys: readJwtKeys(jwtActiveKeyId, jwtSecret),
    jwtTtlSeconds: Math.max(300, readEnvInt("JWT_TTL_SECONDS", 86_400)),
    authPhoneHashSecret: readEnv("AUTH_PHONE_HASH_SECRET", LOCAL_PHONE_HASH_SECRET),
    authOtpPepper: readEnv("AUTH_OTP_PEPPER", LOCAL_OTP_PEPPER),
    authOtpTtlSeconds: readEnvInt("AUTH_OTP_TTL_SECONDS", 300),
    authOtpMaxAttempts: readEnvInt("AUTH_OTP_MAX_ATTEMPTS", 5),
    authOtpLockSeconds: Math.max(60, readEnvInt("AUTH_OTP_LOCK_SECONDS", 900)),
    authOtpResendCooldownSeconds: Math.max(
      1,
      readEnvInt("AUTH_OTP_RESEND_COOLDOWN_SECONDS", 60),
    ),
    authDebugCodeEnabled: readEnvBool(
      "AUTH_DEBUG_CODE_ENABLED",
      nodeEnv !== "production",
    ),
  };

  validateProductionEnv(config);
  return config;
}
