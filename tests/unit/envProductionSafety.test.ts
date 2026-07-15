import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "@xlb/config";

function stubValidProductionEnv(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JWT_SECRET", "jwt-production-secret-with-at-least-32-characters");
  vi.stubEnv("MYSQL_PASSWORD", "mysql-production-password-strong");
  vi.stubEnv("AUTH_PHONE_HASH_SECRET", "phone-hash-production-secret-at-least-32-chars");
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
    ["AUTH_PHONE_HASH_SECRET", "xlb-local-phone-hash-secret-change-before-production"],
    ["AUTH_PHONE_HASH_SECRET", "short"],
  ])("rejects weak production %s", (name, value) => {
    stubValidProductionEnv();
    vi.stubEnv(name, value);
    expect(() => loadEnv()).toThrow(name);
  });

  it.each(["JWT_SECRET", "MYSQL_PASSWORD", "AUTH_PHONE_HASH_SECRET"])(
    "rejects missing production %s",
    (name) => {
      stubValidProductionEnv();
      vi.stubEnv(name, "");
      expect(() => loadEnv()).toThrow(name);
    },
  );
});
