import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createToken, verifyToken } from "../../backend/src/auth/tokenAuth.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Stage 2A identity and application security", () => {
  it("issues strict JWT claims with an active key id", () => {
    vi.stubEnv("JWT_ACTIVE_KID", "current");
    vi.stubEnv("JWT_KEYS_JSON", JSON.stringify({
      current: "stage2a-current-signing-secret-at-least-32-characters",
    }));
    vi.stubEnv("JWT_ISSUER", "xlb-test-issuer");
    vi.stubEnv("JWT_AUDIENCE", "xlb-test-audience");

    const token = createToken("customer-stage2a", "customer", "customer");
    const [headerPart, payloadPart] = token.split(".");
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    expect(header).toMatchObject({ alg: "HS256", typ: "JWT", kid: "current" });
    expect(payload).toMatchObject({
      sub: "customer-stage2a",
      role: "customer",
      appType: "customer",
      iss: "xlb-test-issuer",
      aud: "xlb-test-audience",
      tokenUse: "access",
    });
    expect(verifyToken(token).ok).toBe(true);
  });

  it("supports key rotation while rejecting an unknown retired key", () => {
    const previous = "stage2a-previous-signing-secret-at-least-32-characters";
    const current = "stage2a-current-signing-secret-at-least-32-characters";
    vi.stubEnv("JWT_ACTIVE_KID", "previous");
    vi.stubEnv("JWT_KEYS_JSON", JSON.stringify({ previous, current }));
    const previousToken = createToken("admin-stage2a", "operator", "admin");

    vi.stubEnv("JWT_ACTIVE_KID", "current");
    expect(verifyToken(previousToken).ok).toBe(true);
    expect(verifyToken(createToken("admin-stage2a", "operator", "admin")).ok).toBe(true);

    vi.stubEnv("JWT_KEYS_JSON", JSON.stringify({ current }));
    const retired = verifyToken(previousToken);
    expect(retired).toEqual({ ok: false, error: "unknown token signing key" });
  });

  it("rejects algorithm substitution and invalid role/app bindings", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "none", typ: "JWT", kid: "primary" })}.${encode({
      sub: "customer-stage2a",
      role: "customer",
      appType: "customer",
    })}.`;
    expect(verifyToken(unsigned)).toEqual({ ok: false, error: "invalid token header" });
    expect(() => createToken("customer-stage2a", "admin", "customer")).toThrow("invalid subject");
  });

  it("adds security headers and prevents auth response caching", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const app = await buildApp();
    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.headers["x-content-type-options"]).toBe("nosniff");
      expect(health.headers["x-frame-options"]).toBe("SAMEORIGIN");

      const auth = await app.inject({
        method: "POST",
        url: "/api/auth/customer/code",
        payload: { phone: "invalid" },
      });
      expect(auth.headers["cache-control"]).toBe("no-store");
      expect(auth.headers.pragma).toBe("no-cache");
    } finally {
      await app.close();
    }
  });

  it("rate limits brute-force login attempts by client address", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const app = await buildApp();
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/customer/login",
          payload: { phone: "invalid", code: "000000" },
        });
        expect(response.statusCode).toBe(400);
      }
      const blocked = await app.inject({
        method: "POST",
        url: "/api/auth/customer/login",
        payload: { phone: "invalid", code: "000000" },
      });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ ok: false, rule: "auth_login" });
    } finally {
      await app.close();
    }
  });
});
