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
  jwtSecret: string;
  authOtpTtlSeconds: number;
  authOtpMaxAttempts: number;
  authDebugCodeEnabled: boolean;
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

function readEnvList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Load env with defaults aligned to deploy/compose/docker-compose.local.yml */
export function loadEnv(): EnvConfig {
  return {
    nodeEnv: readEnv("NODE_ENV", "development"),
    backendPort: readEnvInt("BACKEND_PORT", 3000),
    autoRunEnabled: readEnvBool("AUTO_RUN_ENABLED", false),
    autoRunIntervalMs: readEnvInt("AUTO_RUN_INTERVAL_MS", 8000),
    autoRunCityCodes: readEnvList("AUTO_RUN_CITY_CODES", ["hangzhou"]),
    mysqlHost: readEnv("MYSQL_HOST", "127.0.0.1"),
    mysqlPort: readEnvInt("MYSQL_PORT", 3306),
    mysqlDatabase: readEnv("MYSQL_DATABASE", "xlb_local"),
    mysqlUser: readEnv("MYSQL_USER", "xlb"),
    mysqlPassword: readEnv("MYSQL_PASSWORD", "xlb_local_password"),
    redisHost: readEnv("REDIS_HOST", "127.0.0.1"),
    redisPort: readEnvInt("REDIS_PORT", 6379),
    jwtSecret: readEnv("JWT_SECRET", "change-me-in-production"),
    authOtpTtlSeconds: readEnvInt("AUTH_OTP_TTL_SECONDS", 300),
    authOtpMaxAttempts: readEnvInt("AUTH_OTP_MAX_ATTEMPTS", 5),
    authDebugCodeEnabled: readEnvBool(
      "AUTH_DEBUG_CODE_ENABLED",
      readEnv("NODE_ENV", "development") !== "production",
    ),
  };
}
