// @vitest-environment jsdom
import { createAuthApi, customerApi } from "@xlb/api-client";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CustomerAuthActionController } from "../../apps/customer/src/features/auth/CustomerAuthActionController.js";
import { CustomerAuthCoordinator } from "../../apps/customer/src/features/auth/CustomerAuthCoordinator.js";
import { CustomerAuthTemplate } from "../../apps/customer/src/features/auth/CustomerAuthTemplate.js";
import { CustomerLocationActionController } from "../../apps/customer/src/features/location/CustomerLocationActionController.js";
import { CustomerLocationCoordinator } from "../../apps/customer/src/features/location/CustomerLocationCoordinator.js";
import { CustomerLocationTemplate } from "../../apps/customer/src/features/location/CustomerLocationTemplate.js";
import { CustomerCacheScopeCoordinator } from "../../apps/customer/src/features/shell/cacheScope.js";
import { CustomerCityRepository } from "../../apps/customer/src/features/shell/citySelection.js";
import { CustomerAppShellCoordinator } from "../../apps/customer/src/features/shell/CustomerAppShellCoordinator.js";
import {
  customerAuthSlice,
  customerLocationSlice,
} from "../../apps/customer/src/features/shell/customerEntryFeatureRouteModule.js";
import {
  CustomerSessionRepository,
  MemoryCustomerStorage,
} from "../../apps/customer/src/features/shell/sessionLifecycle.js";

function shellFixture() {
  const storage = new MemoryCustomerStorage();
  return new CustomerAppShellCoordinator(
    new CustomerSessionRepository(storage),
    new CustomerCityRepository(storage),
    new CustomerCacheScopeCoordinator(),
  );
}

const authRoute = {
  pathname: "/auth/login",
  pattern: "/auth/login" as const,
  params: {},
  query: {},
};

const locationRoute = {
  pathname: "/location",
  pattern: "/location" as const,
  params: {},
  query: {},
};

describe("Customer entry templates", () => {
  it("renders the fixed OTP component plan with accessible form controls", () => {
    const api = {
      requestCustomerLoginCode: vi.fn(),
      customerLogin: vi.fn(),
    } as unknown as ReturnType<typeof createAuthApi>;
    const coordinator = new CustomerAuthCoordinator(api, shellFixture(), {
      origin: "https://customer.xlb.test",
    });
    const actions = new CustomerAuthActionController(coordinator, vi.fn());

    render(
      <CustomerAuthTemplate
        slice={customerAuthSlice}
        route={authRoute}
        state={{ status: "ready", data: coordinator.snapshot() }}
        runtime={{ view: coordinator.snapshot(), actions }}
      />,
    );

    expect(screen.getByRole("heading", { name: "欢迎回来" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "手机号" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeTruthy();
    expect(document.querySelector("[data-auth-state='idle']")).not.toBeNull();
  });

  it("renders all formal manual cities and an honest unavailable capability", () => {
    const api = { getProfile: vi.fn() } as unknown as ReturnType<typeof customerApi.forClient>;
    const coordinator = new CustomerLocationCoordinator(api, shellFixture(), {
      origin: "https://customer.xlb.test",
    });
    coordinator.requestSystemLocation();
    const actions = new CustomerLocationActionController(coordinator, vi.fn());

    render(
      <CustomerLocationTemplate
        slice={customerLocationSlice}
        route={locationRoute}
        state={{
          status: "unavailable",
          capability: "system-location-resolver",
          reasonCode: "gap_06_location_unavailable",
          recovery: {
            actionKey: "city.select",
            labelKey: "customer.location.select_manually",
          },
        }}
        runtime={{ view: coordinator.snapshot(), actions }}
      />,
    );

    expect(screen.getByRole("button", { name: /杭州/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /上海/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /北京/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "系统定位暂不可用" })).toBeTruthy();
    expect(screen.getByText(/系统定位、坐标解析与服务城市映射尚未接通/)).toBeTruthy();
  });
});
