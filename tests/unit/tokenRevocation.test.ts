import { describe, expect, it, vi } from "vitest";
import type { TokenPayload } from "../../backend/src/auth/tokenAuth";
import { isTokenRevoked, revokeToken } from "../../backend/src/auth/tokenRevocation";

describe("access token revocation", () => {
  it("stores only the jti with a TTL bounded by the token expiry", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    const payload = {
      jti: "11111111-1111-4111-8111-111111111111",
      exp: Math.floor(Date.now() / 1_000) + 600,
    } as TokenPayload;

    await revokeToken(payload, { set, get: vi.fn() } as never);

    expect(set).toHaveBeenCalledWith(
      `xlb:auth:revoked:${payload.jti}`,
      "1",
      "EX",
      expect.any(Number),
    );
    const ttl = set.mock.calls[0]?.[3] as number;
    expect(ttl).toBeGreaterThanOrEqual(598);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it("recognizes revoked and active jtis", async () => {
    await expect(isTokenRevoked("revoked", { get: vi.fn().mockResolvedValue("1"), set: vi.fn() } as never))
      .resolves.toBe(true);
    await expect(isTokenRevoked("active", { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as never))
      .resolves.toBe(false);
  });
});
