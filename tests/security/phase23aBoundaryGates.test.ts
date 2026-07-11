import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { cityConfigUpdateSchema } from "@xlb/validators";
import { loadEnv } from "@xlb/config";
import { buildApp } from "../../backend/src/app.js";
import { createRateLimitGuard } from "../../backend/src/security/rateLimit.js";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function source(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function fakeReply() {
  return {
    statusCode: 200,
    headers: new Map<string, unknown>(),
    payload: undefined as unknown,
    header(name: string, value: unknown) {
      this.headers.set(name, value);
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

describe("Phase 23A boundary gates", () => {
  it("preserves locked migrations, protected semantics, and provider boundaries", () => {
    expect(runPowerShellGate("check-phase23a-boundaries.ps1")).toContain(
      "check-phase23a-boundaries: passed",
    );
  });

  it.each([
    "/api/auth/customer/code",
    "/api/auth/admin/code",
    "/api/auth/worker/code",
  ])("rate limits the real OTP issue route %s by default", async route => {
    const guard = createRateLimitGuard({ now: () => 1_000 });
    let lastReply = fakeReply();
    for (let requestNumber = 0; requestNumber < 11; requestNumber += 1) {
      lastReply = fakeReply();
      await guard(
        { url: route, ip: "203.0.113.23" } as never,
        lastReply as never,
      );
    }
    expect(lastReply.statusCode).toBe(429);
    expect(lastReply.payload).toMatchObject({ ok: false, rule: "otp" });
  });

  it("does not register debug OTP routes unconditionally in production", () => {
    const routes = source("backend/src/auth/authRoutes.ts");
    expect(routes).toMatch(/registerDebugRoutes\s*=\s*[^;]*(production|nodeEnv|NODE_ENV)/i);
    expect(routes.match(/if\s*\(\s*registerDebugRoutes\s*\)\s*\{\s*app\.get\s*\(\s*["']\/api\/auth\/(customer|admin|worker)\/debug-code/gi)).toHaveLength(3);
  });

  it("returns 404 for every debug OTP route in production even when the debug flag is requested", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEBUG_CODE_ENABLED", "true");
    vi.stubEnv("JWT_SECRET", "phase23a-production-jwt-secret-0000000001");
    vi.stubEnv("MYSQL_PASSWORD", "phase23a-production-mysql-secret-000001");
    vi.stubEnv("AUTH_PHONE_HASH_SECRET", "phase23a-production-phone-hash-secret-01");
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      app = await buildApp();
      for (const route of [
        "/api/auth/customer/debug-code?phone=13800000000",
        "/api/auth/admin/debug-code?username=operator",
        "/api/auth/worker/debug-code?phone=13800000000",
      ]) {
        expect((await app.inject({ method: "GET", url: route })).statusCode).toBe(404);
      }
    } finally {
      await app?.close();
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["JWT_SECRET", "change-me-in-production"],
    ["MYSQL_PASSWORD", "xlb_local_password"],
    ["AUTH_PHONE_HASH_SECRET", "change-me-in-production"],
  ])("fails closed on weak production %s", (name, weakValue) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "phase23a-production-jwt-secret-0000000001");
    vi.stubEnv("MYSQL_PASSWORD", "phase23a-production-mysql-secret-000001");
    vi.stubEnv("AUTH_PHONE_HASH_SECRET", "phase23a-production-phone-hash-secret-01");
    vi.stubEnv(name, weakValue);
    try {
      expect(() => loadEnv()).toThrow(new RegExp(name));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("never falls back from exact worker hash lookup to masked-phone account binding", () => {
    const authService = source("backend/src/auth/authService.ts");
    expect(authService).toMatch(/FROM\s+worker_profiles\s+WHERE\s+phone_hash\s*=\s*\?/i);
    expect(authService).not.toMatch(
      /WHERE\s+phone_hash\s+IS\s+NULL\s+AND\s+phone_masked\s*=/i,
    );
  });

  it("requires expectedVersion in the CityConfig update contract", () => {
    const withoutVersion = cityConfigUpdateSchema.safeParse({
      cityCode: "hangzhou",
      isOpen: false,
    });
    const withVersion = cityConfigUpdateSchema.safeParse({
      cityCode: "hangzhou",
      expectedVersion: 1,
      isOpen: false,
    });
    expect(withoutVersion.success).toBe(false);
    expect(withVersion.success).toBe(true);
  });

  it("uses a compare-and-swap update and checks affected rows", () => {
    const repository = source("backend/src/cityConfig/cityConfigRepository.ts");
    expect(repository).toMatch(/WHERE[\s\S]{0,300}version\s*=\s*\?/i);
    expect(repository).toMatch(/affectedRows|CityConfigVersionConflict|Optimistic|Conflict/i);
  });
});
