export interface EnvConfig {
  nodeEnv: string;
  backendPort: number;
  mysqlHost: string;
  mysqlPort: number;
  redisHost: string;
  redisPort: number;
  jwtSecret: string;
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

export function loadEnv(): EnvConfig {
  return {
    nodeEnv: readEnv("NODE_ENV", "development"),
    backendPort: readEnvInt("BACKEND_PORT", 3000),
    mysqlHost: readEnv("MYSQL_HOST", "localhost"),
    mysqlPort: readEnvInt("MYSQL_PORT", 3306),
    redisHost: readEnv("REDIS_HOST", "localhost"),
    redisPort: readEnvInt("REDIS_PORT", 6379),
    jwtSecret: readEnv("JWT_SECRET", "change-me-in-production"),
  };
}
