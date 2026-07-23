import { createAuthApi } from "@xlb/api-client";
import { describe, expect, it, vi } from "vitest";
import { CustomerAuthCoordinator } from "../../apps/customer/src/features/auth/CustomerAuthCoordinator.js";
import {
  CustomerCacheScopeCoordinator,
  clearCustomerScopedBrowserCaches,
} from "../../apps/customer/src/features/shell/cacheScope.js";
import { CustomerCityRepository } from "../../apps/customer/src/features/shell/citySelection.js";
import { CustomerAppShellCoordinator } from "../../apps/customer/src/features/shell/CustomerAppShellCoordinator.js";
import {
  createCustomerEntryGuardAssembly,
  evaluateCustomerGuardPlan,
} from "../../apps/customer/src/features/shell/customerGuards.js";
import {
  resolveSafeCustomerReturnUrl,
} from "../../apps/customer/src/features/shell/safeReturnUrl.js";
import {
  CustomerSessionRepository,
  MemoryCustomerStorage,
  createCustomerSessionFromLogin,
} from "../../apps/customer/src/features/shell/sessionLifecycle.js";

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessToken(
  actor: {
    appType: string;
    role: string;
    sub: string;
  },
  expiresAtSeconds = Math.floor(Date.now() / 1_000) + 3_600,
): string {
  return [
    base64Url({ alg: "HS256", typ: "JWT", kid: "test-key" }),
    base64Url({
      ...actor,
      tokenUse: "access",
      exp: expiresAtSeconds,
    }),
    "test-signature",
  ].join(".");
}

function customerToken(userId = "customer-1"): string {
  return accessToken({
    appType: "customer",
    role: "customer",
    sub: userId,
  });
}

function shellFixture() {
  const storage = new MemoryCustomerStorage();
  const scopes = new CustomerCacheScopeCoordinator(() => {
    clearCustomerScopedBrowserCaches(storage);
  });
  const shell = new CustomerAppShellCoordinator(
    new CustomerSessionRepository(storage),
    new CustomerCityRepository(storage),
    scopes,
  );
  return { shell, storage, scopes };
}

describe("Customer Wave 1 B1A entry and guard", () => {
  it("accepts only a matching Customer actor and rejects cross-app or expired tokens", () => {
    const customer = createCustomerSessionFromLogin({
      ok: true,
      token: customerToken("customer-7"),
      userId: "customer-7",
      role: "customer",
    });
    const worker = createCustomerSessionFromLogin({
      ok: true,
      token: accessToken({ appType: "worker", role: "worker", sub: "worker-7" }),
      userId: "worker-7",
      role: "customer",
    });
    const expired = createCustomerSessionFromLogin({
      ok: true,
      token: customerToken("customer-old").replace(
        base64Url({
          appType: "customer",
          role: "customer",
          sub: "customer-old",
          tokenUse: "access",
          exp: Math.floor(Date.now() / 1_000) + 3_600,
        }),
        base64Url({
          appType: "customer",
          role: "customer",
          sub: "customer-old",
          tokenUse: "access",
          exp: 1,
        }),
      ),
      userId: "customer-old",
      role: "customer",
    });

    expect(customer?.actor).toEqual({
      appType: "customer",
      role: "customer",
      userId: "customer-7",
    });
    expect(worker).toBeNull();
    expect(expired).toBeNull();
  });

  it("allows only same-origin return URLs and rejects legacy or credentialed targets", () => {
    const origin = "https://customer.xlb.test";

    expect(resolveSafeCustomerReturnUrl("/orders/order-1?view=detail", origin))
      .toBe("/orders/order-1?view=detail");
    expect(resolveSafeCustomerReturnUrl(
      "https://customer.xlb.test/support#ticket",
      origin,
    )).toBe("/support#ticket");
    expect(resolveSafeCustomerReturnUrl("//evil.example/orders", origin)).toBe("/");
    expect(resolveSafeCustomerReturnUrl("javascript:alert(1)", origin)).toBe("/");
    expect(resolveSafeCustomerReturnUrl("/auth/login", origin)).toBe("/");
    expect(resolveSafeCustomerReturnUrl("/customer/orders", origin)).toBe("/");
  });

  it("rotates actor and city scopes, clearing scoped caches while retaining safe city preference", async () => {
    const { shell, storage } = shellFixture();
    storage.setItem("xlb.customer.sdui.manifest.v1:customer.home:hangzhou", "cached");
    storage.setItem("xlb.customer.feature.orders:old", "cached");
    storage.setItem("xlb.customer.visual.mode", "light");

    await shell.restore();
    const session = createCustomerSessionFromLogin({
      ok: true,
      token: customerToken("customer-scope"),
      userId: "customer-scope",
      role: "customer",
    });
    expect(session).not.toBeNull();
    await shell.establishSession(session!);
    const actorScope = shell.snapshot();
    await shell.selectCity("shanghai");
    const cityScope = shell.snapshot();

    expect(storage.getItem("xlb.customer.sdui.manifest.v1:customer.home:hangzhou")).toBeNull();
    expect(storage.getItem("xlb.customer.feature.orders:old")).toBeNull();
    expect(storage.getItem("xlb.customer.visual.mode")).toBe("light");
    expect(storage.getItem("xlb.customer.cityCode")).toBe("shanghai");
    expect(actorScope.status === "ready" ? actorScope.cacheScope.key : null)
      .not.toBe(cityScope.status === "ready" ? cityScope.cacheScope.key : null);
  });

  it("assembles session, city and protected-route guards in deterministic order", async () => {
    const assembly = createCustomerEntryGuardAssembly();
    const base = {
      sliceId: "CSL-10",
      pathname: "/orders/order-1",
      safeReturnUrl: "/orders/order-1",
      routeParams: { orderId: "order-1" },
      city: { status: "unresolved" as const },
    };

    await expect(evaluateCustomerGuardPlan(
      ["session", "city", "protected-route"],
      { ...base, session: { status: "anonymous" } },
      assembly,
    )).resolves.toEqual({
      outcome: "redirect",
      route: "/auth/login",
      reason: "session_required",
    });

    await expect(evaluateCustomerGuardPlan(
      ["session", "city", "protected-route"],
      {
        ...base,
        session: {
          status: "authenticated",
          actor: {
            appType: "customer",
            role: "customer",
            userId: "customer-1",
          },
        },
      },
      assembly,
    )).resolves.toEqual({
      outcome: "redirect",
      route: "/location",
      reason: "city_required",
    });
  });

  it("runs OTP request/login without debug-code and establishes the validated session", async () => {
    const now = Date.parse("2026-07-24T08:00:00.000Z");
    const token = accessToken(
      { appType: "customer", role: "customer", sub: "customer-auth" },
      Math.floor(now / 1_000) + 3_600,
    );
    const requestCustomerLoginCode = vi.fn().mockResolvedValue({
      ok: true,
      expiresAt: "2026-07-24T08:05:00.000Z",
      ttlSeconds: 300,
      attemptsLeft: 5,
    });
    const customerLogin = vi.fn().mockResolvedValue({
      ok: true,
      token,
      userId: "customer-auth",
      role: "customer",
    });
    const api = {
      requestCustomerLoginCode,
      customerLogin,
    } as unknown as ReturnType<typeof createAuthApi>;
    const { shell } = shellFixture();
    await shell.restore();
    const coordinator = new CustomerAuthCoordinator(api, shell, {
      origin: "https://customer.xlb.test",
      returnUrl: "/orders/order-9",
      now: () => now,
    });

    coordinator.setPhone("13800138000");
    await coordinator.requestCode();
    coordinator.setCode("123456");
    await coordinator.verifyCode();

    expect(requestCustomerLoginCode).toHaveBeenCalledTimes(1);
    expect(customerLogin).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot().status).toBe("authenticated");
    expect(coordinator.snapshot().code).toBe("");
    expect(shell.sessionSnapshot()).toEqual({
      status: "authenticated",
      actor: {
        appType: "customer",
        role: "customer",
        userId: "customer-auth",
      },
    });
  });

  it("keeps wrong-actor login responses out of storage and enters conflict", async () => {
    const now = Date.parse("2026-07-24T08:00:00.000Z");
    const api = {
      requestCustomerLoginCode: vi.fn().mockResolvedValue({
        ok: true,
        expiresAt: "2026-07-24T08:05:00.000Z",
        ttlSeconds: 300,
        attemptsLeft: 5,
      }),
      customerLogin: vi.fn().mockResolvedValue({
        ok: true,
        token: accessToken(
          { appType: "worker", role: "worker", sub: "worker-cross-app" },
          Math.floor(now / 1_000) + 3_600,
        ),
        userId: "worker-cross-app",
        role: "customer",
      }),
    } as unknown as ReturnType<typeof createAuthApi>;
    const { shell, storage } = shellFixture();
    await shell.restore();
    const coordinator = new CustomerAuthCoordinator(api, shell, {
      origin: "https://customer.xlb.test",
      now: () => now,
    });

    coordinator.setPhone("13800138000");
    await coordinator.requestCode();
    coordinator.setCode("123456");
    await coordinator.verifyCode();

    expect(coordinator.snapshot().status).toBe("conflict");
    expect(shell.sessionSnapshot()).toEqual({ status: "anonymous" });
    expect(storage.getItem("xlb.customer.token")).toBeNull();
  });
});
