import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAppTypeRole } from "../../backend/src/gateway/appTypeGuard.js";
import { createOaToken, createToken, verifyToken } from "../../backend/src/auth/tokenAuth.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configureJwt() {
  vi.stubEnv("JWT_ACTIVE_KID", "oa-current");
  vi.stubEnv("JWT_KEYS_JSON", JSON.stringify({
    "oa-current": "oa-current-signing-secret-at-least-32-characters",
  }));
  vi.stubEnv("JWT_ISSUER", "xlb-oa-test");
  vi.stubEnv("JWT_AUDIENCE", "xlb-apps-test");
}

describe("OA identity security", () => {
  it("issues OA access tokens only through the backoffice-bound issuer", () => {
    configureJwt();
    const issued = createOaToken("admin-global", "operator", {
      sessionId: "session-1",
      membershipId: "membership-1",
      organizationId: "organization-1",
      authzVersion: 7,
    });
    expect(issued.jti).toMatch(/^[0-9a-f-]{36}$/u);
    const verified = verifyToken(issued.token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload).toMatchObject({
        appType: "oa",
        role: "operator",
        sid: "session-1",
        mid: "membership-1",
        oid: "organization-1",
        av: 7,
      });
    }
    expect(() => createToken("admin-global", "operator", "oa")).toThrow(/invalid subject/);
  });

  it("rejects invalid OA roles and authorization versions", () => {
    configureJwt();
    expect(() => createOaToken("customer-1", "customer", {
      sessionId: "session-1",
      membershipId: "membership-1",
      organizationId: "organization-1",
      authzVersion: 0,
    })).toThrow(/invalid identity/);
    expect(() => createOaToken("admin-1", "admin", {
      sessionId: "session-1",
      membershipId: "membership-1",
      organizationId: "organization-1",
      authzVersion: -1,
    })).toThrow(/invalid identity/);
  });

  it("keeps customer and worker roles outside the OA application boundary", () => {
    expect(assertAppTypeRole("oa", "customer")).toMatchObject({ ok: false, statusCode: 401 });
    expect(assertAppTypeRole("oa", "worker")).toMatchObject({ ok: false, statusCode: 401 });
    expect(assertAppTypeRole("oa", "admin")).toEqual({ ok: true });
    expect(assertAppTypeRole("oa", "operator")).toEqual({ ok: true });
    expect(assertAppTypeRole("oa", "auditor")).toEqual({ ok: true });
  });
});
