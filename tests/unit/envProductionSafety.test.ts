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
  });

  it("accepts explicit strong production secrets", () => {
    stubValidProductionEnv();
    expect(loadEnv().nodeEnv).toBe("production");
  });

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
