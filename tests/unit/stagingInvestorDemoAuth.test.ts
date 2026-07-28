import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "@xlb/config";
import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";
import {
  stagingDemoCodeFor,
  stagingInvestorDemoCodeFor,
} from "../../backend/src/auth/authService.js";
import {
  createStagingDemoToken,
  verifyToken,
} from "../../backend/src/auth/tokenAuth.js";
import { buildRequestContext } from "../../backend/src/context/requestContext.js";

function stubStagingDemoEnv(): void {
  vi.stubEnv("NODE_ENV", "staging");
  vi.stubEnv("JWT_SECRET", "investor-demo-jwt-secret-at-least-32-characters");
  vi.stubEnv("MYSQL_PASSWORD", "investor-demo-mysql-password");
  vi.stubEnv("REDIS_PASSWORD", "investor-demo-redis-password");
  vi.stubEnv("AUTH_PHONE_HASH_SECRET", "investor-demo-phone-hash-secret-at-least-32");
  vi.stubEnv("AUTH_OTP_PEPPER", "investor-demo-otp-pepper-at-least-32-chars");
  vi.stubEnv("AUTH_DEBUG_CODE_ENABLED", "false");
  vi.stubEnv("STAGING_DEMO_CUSTOMER_AUTH_ENABLED", "true");
  vi.stubEnv("STAGING_DEMO_CUSTOMER_PHONE", "13800000001");
  vi.stubEnv("STAGING_INVESTOR_DEMO_AUTH_ENABLED", "true");
  vi.stubEnv("STAGING_DEMO_WORKER_ID", "investor-demo-worker-hz");
  vi.stubEnv("STAGING_DEMO_WORKER_PHONE", "13800000011");
  vi.stubEnv("STAGING_DEMO_ADMIN_USER_ID", "investor-demo-admin-hz");
  vi.stubEnv("STAGING_DEMO_ADMIN_USERNAME", "investor_demo_hz");
  vi.stubEnv("STAGING_DEMO_CITY_CODE", "hangzhou");
  vi.stubEnv("STAGING_DEMO_TOKEN_TTL_SECONDS", "900");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("staging investor demo authentication", () => {
  it("returns one-time OTP material only for exact configured staging identities", () => {
    const env = {
      nodeEnv: "staging",
      stagingInvestorDemoAuthEnabled: true,
      stagingDemoWorkerPhone: "13800000011",
      stagingDemoAdminUsername: "investor_demo_hz",
    };
    expect(stagingInvestorDemoCodeFor(env, "worker", "13800000011", "428173"))
      .toBe("428173");
    expect(stagingInvestorDemoCodeFor(env, "admin", "investor_demo_hz", "842731"))
      .toBe("842731");
    expect(stagingInvestorDemoCodeFor(env, "worker", "13800000012", "428173"))
      .toBeUndefined();
    expect(stagingInvestorDemoCodeFor(
      { ...env, nodeEnv: "production" },
      "admin",
      "investor_demo_hz",
      "842731",
    )).toBeUndefined();
  });

  it("preserves the existing exact customer staging whitelist boundary", () => {
    expect(stagingDemoCodeFor({
      nodeEnv: "staging",
      stagingDemoCustomerAuthEnabled: true,
      stagingDemoCustomerPhone: "13800000001",
    }, "13800000001", "193846")).toBe("193846");
  });

  it("issues short, city-bound demo tokens and rejects a forged app binding", () => {
    stubStagingDemoEnv();
    const token = createStagingDemoToken(
      "investor-demo-admin-hz",
      "operator",
      "admin",
      "hangzhou",
    );
    const verified = verifyToken(token);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.payload).toMatchObject({
      sub: "investor-demo-admin-hz",
      role: "operator",
      appType: "admin",
      demo: "investor",
      city: "hangzhou",
    });
    expect(verified.payload.exp - verified.payload.iat).toBe(900);
    expect(buildRequestContext({
      requireAuth: true,
      requireCityCode: true,
      headers: { authorization: `Bearer ${token}` },
    })).toMatchObject({
      ok: true,
      context: { cityCode: "hangzhou", userId: "investor-demo-admin-hz" },
    });
    expect(buildRequestContext({
      requireAuth: true,
      requireCityCode: true,
      headers: {
        authorization: `Bearer ${token}`,
        "x-xlb-city-code": "shanghai",
      },
    })).toMatchObject({
      ok: false,
      statusCode: 401,
      message: "staging demo token city scope mismatch",
    });
    expect(() => createStagingDemoToken(
      "investor-demo-admin-hz",
      "admin",
      "admin",
      "hangzhou",
    )).toThrow("cannot create staging demo token");
  });

  it("fails closed when the investor feature is requested outside staging", () => {
    stubStagingDemoEnv();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STAGING_DEMO_CUSTOMER_AUTH_ENABLED", "false");
    vi.stubEnv("MYSQL_HOST", "mysql.prod.internal");
    vi.stubEnv("MYSQL_DATABASE", "xlb_prod");
    vi.stubEnv("MYSQL_USER", "xlb_prod_app");
    vi.stubEnv("MYSQL_TLS_ENABLED", "true");
    vi.stubEnv("MYSQL_TLS_CA", "production-ca");
    vi.stubEnv("REDIS_HOST", "redis.prod.internal");
    vi.stubEnv("REDIS_TLS_ENABLED", "true");
    vi.stubEnv("REDIS_TLS_CA", "production-ca");
    expect(() => loadEnv()).toThrow("STAGING_INVESTOR_DEMO_AUTH_ENABLED");
  });

  it("fails closed when backend identities diverge from the APK manifest", () => {
    stubStagingDemoEnv();
    expect(INVESTOR_DEMO_IDENTITIES).toMatchObject({
      cityCode: "hangzhou",
      worker: {
        id: "investor-demo-worker-hz",
        phone: "13800000011",
      },
      admin: {
        id: "investor-demo-admin-hz",
        username: "investor_demo_hz",
        role: "operator",
      },
    });
    vi.stubEnv("STAGING_DEMO_WORKER_PHONE", "13800000012");
    expect(() => loadEnv()).toThrow("shared fixed manifest");
  });
});
