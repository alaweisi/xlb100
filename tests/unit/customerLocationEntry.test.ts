import { customerApi } from "@xlb/api-client";
import { describe, expect, it, vi } from "vitest";
import { CustomerLocationCoordinator } from "../../apps/customer/src/features/location/CustomerLocationCoordinator.js";
import { CustomerCacheScopeCoordinator } from "../../apps/customer/src/features/shell/cacheScope.js";
import { CustomerCityRepository } from "../../apps/customer/src/features/shell/citySelection.js";
import { CustomerAppShellCoordinator } from "../../apps/customer/src/features/shell/CustomerAppShellCoordinator.js";
import {
  CustomerSessionRepository,
  MemoryCustomerStorage,
  createCustomerSessionFromLogin,
} from "../../apps/customer/src/features/shell/sessionLifecycle.js";

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function customerToken(userId: string): string {
  return [
    base64Url({ alg: "HS256", typ: "JWT", kid: "test-key" }),
    base64Url({
      appType: "customer",
      role: "customer",
      sub: userId,
      tokenUse: "access",
      exp: Math.floor(Date.now() / 1_000) + 3_600,
    }),
    "signature",
  ].join(".");
}

async function shellWithSession(cityCode?: "hangzhou" | "shanghai" | "beijing") {
  const storage = new MemoryCustomerStorage();
  const shell = new CustomerAppShellCoordinator(
    new CustomerSessionRepository(storage),
    new CustomerCityRepository(storage),
    new CustomerCacheScopeCoordinator(),
  );
  await shell.restore();
  const session = createCustomerSessionFromLogin({
    ok: true,
    token: customerToken("customer-location"),
    userId: "customer-location",
    role: "customer",
  });
  await shell.establishSession(session!);
  if (cityCode) await shell.selectCity(cityCode);
  return { shell, storage };
}

describe("Customer CSL-03 city and location", () => {
  it("uses a scoped profile default when a current city already exists", async () => {
    const { shell } = await shellWithSession("hangzhou");
    const getProfile = vi.fn().mockResolvedValue({
      ok: true,
      profile: {
        customerId: "customer-location",
        phoneMasked: "138****8000",
        name: "顾客",
        avatarUrl: null,
        defaultCityCode: "shanghai",
        updatedAt: "2026-07-24T08:00:00.000Z",
      },
    });
    const api = { getProfile } as unknown as ReturnType<typeof customerApi.forClient>;
    const coordinator = new CustomerLocationCoordinator(api, shell, {
      origin: "https://customer.xlb.test",
      returnUrl: "/service",
    });

    await coordinator.initialize();

    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot()).toMatchObject({
      status: "selecting",
      selectedCityCode: "hangzhou",
      profileDefaultCityCode: "shanghai",
      returnUrl: "/service",
      capability: "unavailable",
    });
  });

  it("does not invent a default city when no city scope exists", async () => {
    const { shell, storage } = await shellWithSession();
    const getProfile = vi.fn();
    const api = { getProfile } as unknown as ReturnType<typeof customerApi.forClient>;
    const coordinator = new CustomerLocationCoordinator(api, shell, {
      origin: "https://customer.xlb.test",
    });

    await coordinator.initialize();
    const unavailable = coordinator.requestSystemLocation();

    expect(getProfile).not.toHaveBeenCalled();
    expect(storage.getItem("xlb.customer.cityCode")).toBeNull();
    expect(unavailable).toMatchObject({
      status: "unavailable",
      selectedCityCode: null,
      capability: "unavailable",
      error: { code: "gap_06_location_unavailable" },
    });
  });

  it("rotates the city scope after explicit manual selection", async () => {
    const { shell, storage } = await shellWithSession();
    const api = { getProfile: vi.fn() } as unknown as ReturnType<typeof customerApi.forClient>;
    const coordinator = new CustomerLocationCoordinator(api, shell, {
      origin: "https://customer.xlb.test",
    });
    await coordinator.initialize();

    const selected = await coordinator.selectCity("beijing");

    expect(selected.status).toBe("manual-selected");
    expect(selected.selectedCityCode).toBe("beijing");
    expect(storage.getItem("xlb.customer.cityCode")).toBe("beijing");
    expect(shell.citySnapshot()).toEqual({ status: "resolved", cityCode: "beijing" });
  });

  it("rejects unsupported city values without mutating the scope", async () => {
    const { shell, storage } = await shellWithSession();
    const api = { getProfile: vi.fn() } as unknown as ReturnType<typeof customerApi.forClient>;
    const coordinator = new CustomerLocationCoordinator(api, shell, {
      origin: "https://customer.xlb.test",
    });

    const result = await coordinator.selectCity("__global__");

    expect(result.status).toBe("out-of-service");
    expect(storage.getItem("xlb.customer.cityCode")).toBeNull();
    expect(shell.citySnapshot()).toEqual({ status: "unresolved" });
  });
});
