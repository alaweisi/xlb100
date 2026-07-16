import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "@xlb/config";

function stubValidProductionEnv(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JWT_SECRET", "jwt-production-secret-with-at-least-32-characters");
  vi.stubEnv("MYSQL_HOST", "mysql.prod.internal");
  vi.stubEnv("MYSQL_DATABASE", "xlb_prod");
  vi.stubEnv("MYSQL_USER", "xlb_prod_app");
  vi.stubEnv("MYSQL_PASSWORD", "mysql-production-password-strong");
  vi.stubEnv("MYSQL_TLS_ENABLED", "true");
  vi.stubEnv("MYSQL_TLS_CA", "test-production-mysql-ca");
  vi.stubEnv("REDIS_HOST", "redis.prod.internal");
  vi.stubEnv("REDIS_PASSWORD", "redis-production-password-strong");
  vi.stubEnv("REDIS_TLS_ENABLED", "true");
  vi.stubEnv("REDIS_TLS_CA", "test-production-redis-ca");
  vi.stubEnv("AUTH_PHONE_HASH_SECRET", "phone-hash-production-secret-at-least-32-chars");
  vi.stubEnv("AUTH_OTP_PEPPER", "otp-pepper-production-secret-at-least-32-chars");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production environment safety", () => {
  it("keeps local development defaults compatible", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("MYSQL_PASSWORD", "");
    vi.stubEnv("AUTH_PHONE_HASH_SECRET", "");

    const env = loadEnv();
    expect(env.jwtSecret).toBe("");
    expect(env.mysqlPassword).toBe("");
    expect(env.authPhoneHashSecret).toBe("");
    expect(env).toMatchObject({ rateLimitBackend: "memory", trustProxyHops: 0 });
  });

  it("accepts explicit strong production secrets", () => {
    stubValidProductionEnv();
    expect(loadEnv()).toMatchObject({
      nodeEnv: "production",
      rateLimitBackend: "redis",
      trustProxyHops: 1,
      mysqlTlsEnabled: true,
      redisTlsEnabled: true,
    });
  });

  it("rejects an in-memory production rate limit backend", () => {
    stubValidProductionEnv();
    vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
    expect(() => loadEnv()).toThrow("RATE_LIMIT_BACKEND");
  });

  it("rejects an unknown rate limit backend", () => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "unknown");
    expect(() => loadEnv()).toThrow("RATE_LIMIT_BACKEND");
  });

  it.each(["0", "-1", "eleven", "11"])(
    "rejects unsafe production TRUST_PROXY_HOPS=%s",
    (value) => {
      stubValidProductionEnv();
      vi.stubEnv("TRUST_PROXY_HOPS", value);
      expect(() => loadEnv()).toThrow("TRUST_PROXY_HOPS");
    },
  );

  it.each([
    ["JWT_SECRET", "change-me-in-production"],
    ["JWT_SECRET", "short"],
    ["JWT_SECRET", "REPLACE_WITH_SECRET_MANAGER_VALUE"],
    ["MYSQL_PASSWORD", "xlb_local_password"],
    ["MYSQL_PASSWORD", "short"],
    ["MYSQL_PASSWORD", "REPLACE_WITH_SECRET_MANAGER_VALUE"],
    ["REDIS_PASSWORD", "short"],
    ["REDIS_PASSWORD", "REPLACE_WITH_SECRET_MANAGER_VALUE"],
    ["AUTH_PHONE_HASH_SECRET", "xlb-local-phone-hash-secret-change-before-production"],
    ["AUTH_PHONE_HASH_SECRET", "short"],
    ["AUTH_OTP_PEPPER", "xlb-local-otp-pepper-change-before-production"],
    ["AUTH_OTP_PEPPER", "short"],
  ])("rejects weak production %s", (name, value) => {
    stubValidProductionEnv();
    vi.stubEnv(name, value);
    expect(() => loadEnv()).toThrow(name);
  });

  it.each(["JWT_SECRET", "MYSQL_PASSWORD", "REDIS_PASSWORD", "AUTH_PHONE_HASH_SECRET", "AUTH_OTP_PEPPER"])(
    "rejects missing production %s",
    (name) => {
      stubValidProductionEnv();
      vi.stubEnv(name, "");
      expect(() => loadEnv()).toThrow(name);
    },
  );

  it.each([
    ["MYSQL_TLS_ENABLED", "false", "MYSQL_TLS_ENABLED"],
    ["REDIS_TLS_ENABLED", "false", "REDIS_TLS_ENABLED"],
    ["MYSQL_TLS_CA", "", "MYSQL_TLS_CA_FILE"],
    ["REDIS_TLS_CA", "", "REDIS_TLS_CA_FILE"],
  ])("rejects missing production transport security %s", (name, value, message) => {
    stubValidProductionEnv();
    vi.stubEnv(name, value);
    expect(() => loadEnv()).toThrow(message);
  });

  it("rejects ambiguous raw and file-backed secret sources", () => {
    vi.stubEnv("MYSQL_PASSWORD", "raw-secret-value");
    vi.stubEnv("MYSQL_PASSWORD_FILE", "C:/run/secrets/mysql_password");
    expect(() => loadEnv()).toThrow("cannot both be set");
  });

  it("loads secret values from mounted files without exposing them in environment values", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "xlb-env-secret-"));
    const secretPath = path.join(directory, "mysql-password");
    try {
      writeFileSync(secretPath, "file-backed-password\n", { mode: 0o600 });
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("MYSQL_PASSWORD", "");
      vi.stubEnv("MYSQL_PASSWORD_FILE", secretPath);
      expect(loadEnv().mysqlPassword).toBe("file-backed-password");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
