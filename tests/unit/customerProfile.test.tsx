// @vitest-environment jsdom

import { ApiClientError } from "@xlb/api-client";
import type {
  CustomerProfile,
  KnownCityCode,
} from "@xlb/types";
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CustomerProfileActionController,
} from "../../apps/customer/src/features/account/CustomerProfileActionController.js";
import {
  CustomerProfileCoordinator,
  type CustomerProfileApi,
} from "../../apps/customer/src/features/account/CustomerProfileCoordinator.js";
import {
  CUSTOMER_PROFILE_RETRY_EVENT,
  CustomerProfilePage,
  type CustomerProfileNavigation,
} from "../../apps/customer/src/features/account/CustomerProfileRoute.js";
import {
  CustomerProfileTemplate,
} from "../../apps/customer/src/features/account/CustomerProfileTemplate.js";
import {
  customerProfileRouteModule,
  customerProfileSlice,
  customerProfileTemplateRegistration,
} from "../../apps/customer/src/features/account/customerProfileModule.js";
import {
  CustomerCacheScopeCoordinator,
  clearCustomerScopedBrowserCaches,
} from "../../apps/customer/src/features/shell/cacheScope.js";
import {
  CustomerCityRepository,
} from "../../apps/customer/src/features/shell/citySelection.js";
import {
  CustomerAppShellCoordinator,
} from "../../apps/customer/src/features/shell/CustomerAppShellCoordinator.js";
import {
  CustomerSessionRepository,
  MemoryCustomerStorage,
  createCustomerSessionFromLogin,
} from "../../apps/customer/src/features/shell/sessionLifecycle.js";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";

function profile(
  overrides: Partial<CustomerProfile> = {},
): CustomerProfile {
  return {
    customerId: "customer-profile-1",
    phoneMasked: "138****8000",
    name: "林女士",
    avatarUrl: null,
    defaultCityCode: "hangzhou",
    updatedAt: "2026-07-24T08:00:00.000Z",
    ...overrides,
  };
}

function api(
  overrides: Partial<CustomerProfileApi> = {},
): CustomerProfileApi {
  return {
    getProfile: vi.fn().mockResolvedValue({
      ok: true,
      profile: profile(),
    }),
    updateProfile: vi.fn().mockResolvedValue({
      ok: true,
      profile: profile(),
    }),
    ...overrides,
  };
}

function route() {
  return {
    pathname: "/profile",
    pattern: "/profile" as const,
    params: {},
    query: {},
  };
}

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
    "test-signature",
  ].join(".");
}

async function shellFixture() {
  const storage = new MemoryCustomerStorage();
  const scopes = new CustomerCacheScopeCoordinator(() => {
    clearCustomerScopedBrowserCaches(storage);
  });
  const shell = new CustomerAppShellCoordinator(
    new CustomerSessionRepository(storage),
    new CustomerCityRepository(storage),
    scopes,
  );
  await shell.restore();
  const session = createCustomerSessionFromLogin({
    ok: true,
    token: customerToken("customer-profile-1"),
    userId: "customer-profile-1",
    role: "customer",
  });
  expect(session).not.toBeNull();
  await shell.establishSession(session!);
  await shell.selectCity("hangzhou");
  return { shell, storage };
}

function navigation(): CustomerProfileNavigation {
  return {
    open: vi.fn(),
    login: vi.fn(),
  };
}

describe("Customer CSL-19 Profile", () => {
  it("publishes a fixed L1 route module and registered template", async () => {
    expect(customerProfileSlice).toMatchObject({
      id: "CSL-19",
      routePatterns: ["/profile"],
      templateId: "CustomerProfileTemplate",
      orchestration: {
        level: "L1",
        operationalManifest: "forbidden",
      },
      guards: ["session", "city", "protected-route"],
    });
    expect(customerProfileTemplateRegistration).toMatchObject({
      templateId: "CustomerProfileTemplate",
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });

    const routes = new CustomerFeatureRouteRegistry()
      .register(customerProfileRouteModule)
      .seal();
    const templates = new CustomerTemplateRegistry()
      .register(customerProfileTemplateRegistration)
      .seal();

    expect(routes.resolve("/profile")?.slice.id).toBe("CSL-19");
    expect(templates.resolveForSlice(customerProfileSlice)?.templateId)
      .toBe("CustomerProfileTemplate");
    await expect(customerProfileRouteModule.routes[0]?.load())
      .resolves.toHaveProperty("RouteComponent");
  });

  it("reads by current city, writes by target default city, and trusts the server response", async () => {
    const calls: KnownCityCode[] = [];
    const officialApi = api({
      updateProfile: vi.fn().mockResolvedValue({
        ok: true,
        profile: profile({
          name: "服务端规范姓名",
          defaultCityCode: "shanghai",
          updatedAt: "2026-07-24T09:00:00.000Z",
        }),
      }),
    });
    const coordinator = new CustomerProfileCoordinator((cityCode) => {
      calls.push(cityCode);
      return officialApi;
    });

    await expect(coordinator.load("customer-profile-1", "hangzhou"))
      .resolves.toMatchObject({
        status: "ready",
        profile: { name: "林女士" },
      });
    await expect(coordinator.save("customer-profile-1", {
      name: "  客户输入  ",
      defaultCityCode: "shanghai",
    })).resolves.toMatchObject({
      status: "success",
      profile: {
        name: "服务端规范姓名",
        defaultCityCode: "shanghai",
      },
    });

    expect(calls).toEqual(["hangzhou", "shanghai"]);
    expect(officialApi.updateProfile).toHaveBeenCalledWith({
      name: "  客户输入  ",
      defaultCityCode: "shanghai",
    });
  });

  it("validates with the shared Profile schema and blocks concurrent writes", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const coordinator = {
      save: vi.fn(async () => {
        await pending;
        return { status: "success" as const, profile: profile() };
      }),
    } as unknown as CustomerProfileCoordinator;
    const controller = new CustomerProfileActionController(coordinator);

    await expect(controller.save("customer-profile-1", {
      name: "",
      defaultCityCode: "hangzhou",
    })).resolves.toMatchObject({
      status: "validation_error",
      errors: { name: expect.any(String) },
    });

    const first = controller.save("customer-profile-1", {
      name: "林女士",
      defaultCityCode: "hangzhou",
    });
    await expect(controller.save("customer-profile-1", {
      name: "林女士",
      defaultCityCode: "hangzhou",
    })).resolves.toEqual({
      status: "conflict",
      reasonCode: "request_in_flight",
    });
    release();
    await expect(first).resolves.toMatchObject({ status: "success" });
  });

  it("renders profile-loading, error, conflict and unavailable without fake profile data", () => {
    const base = {
      slice: customerProfileSlice,
      route: route(),
    };
    const { rerender } = render(
      <CustomerProfileTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在读取个人资料")).toBeTruthy();

    rerender(
      <CustomerProfileTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "profile_load_failed",
          retryable: true,
          recovery: {
            actionKey: CUSTOMER_PROFILE_RETRY_EVENT,
            labelKey: "重新读取",
          },
        }}
      />,
    );
    expect(screen.getByText("个人资料加载失败")).toBeTruthy();

    rerender(
      <CustomerProfileTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "profile_actor_mismatch",
          refreshRequired: true,
          recovery: {
            actionKey: CUSTOMER_PROFILE_RETRY_EVENT,
            labelKey: "重新读取",
          },
        }}
      />,
    );
    expect(screen.getByText("个人资料已变化")).toBeTruthy();

    rerender(
      <CustomerProfileTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.profile",
          reasonCode: "profile_api_unavailable",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会用本地或演示资料替代/u)).toBeTruthy();
  });

  it("renders ready, dirty, saving, saved and logging-out runtime states", () => {
    const actions = {
      onNameChange: vi.fn(),
      onDefaultCityChange: vi.fn(),
      onSave: vi.fn(),
      onNavigate: vi.fn(),
      onLogout: vi.fn(),
      onConfirmCitySwitch: vi.fn(),
      onDeclineCitySwitch: vi.fn(),
      onDismissNotice: vi.fn(),
    };
    const base = {
      slice: customerProfileSlice,
      route: route(),
    };
    const readyState = (status: "ready" | "dirty" | "saving" | "saved" | "logging-out") => ({
      status: "ready" as const,
      data: {
        viewModel: {
          profile: profile(),
          draft: {
            name: status === "dirty" ? "新姓名" : "林女士",
            defaultCityCode: "hangzhou" as const,
          },
          currentCityCode: "hangzhou" as const,
          status,
          errors: {},
          notice: null,
          citySwitchConfirmation: null,
        },
        actions,
      },
    });
    const { rerender } = render(
      <CustomerProfileTemplate {...base} state={readyState("ready")} />,
    );
    expect(screen.getByText("已同步")).toBeTruthy();

    rerender(
      <CustomerProfileTemplate {...base} state={readyState("dirty")} />,
    );
    expect(screen.getByText("待保存")).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存资料" }))
      .toHaveProperty("disabled", false);

    rerender(
      <CustomerProfileTemplate {...base} state={readyState("saving")} />,
    );
    expect(screen.getByText("保存中")).toBeTruthy();
    expect(screen.getByRole("button", { name: "正在保存" }))
      .toHaveProperty("disabled", true);

    rerender(
      <CustomerProfileTemplate {...base} state={readyState("saved")} />,
    );
    expect(screen.getByText("已保存")).toBeTruthy();

    rerender(
      <CustomerProfileTemplate {...base} state={readyState("logging-out")} />,
    );
    expect(screen.getByRole("button", { name: "正在退出" }))
      .toHaveProperty("disabled", true);
  });

  it("saves the authoritative response and requires explicit city-switch confirmation", async () => {
    const { shell } = await shellFixture();
    const officialApi = api({
      updateProfile: vi.fn().mockResolvedValue({
        ok: true,
        profile: profile({
          name: "服务端姓名",
          defaultCityCode: "shanghai",
          updatedAt: "2026-07-24T09:00:00.000Z",
        }),
      }),
    });
    const nav = navigation();
    render(
      <CustomerProfilePage
        slice={customerProfileSlice}
        route={route()}
        shell={shell}
        coordinator={new CustomerProfileCoordinator(() => officialApi)}
        navigation={nav}
      />,
    );

    await screen.findByDisplayValue("林女士");
    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "客户端姓名" },
    });
    fireEvent.change(screen.getByLabelText("账户默认城市"), {
      target: { value: "shanghai" },
    });
    expect(screen.getByText("待保存")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));

    await screen.findByRole("dialog", { name: "是否切换当前服务城市？" });
    expect(screen.getByDisplayValue("服务端姓名")).toBeTruthy();
    expect(shell.snapshot()).toMatchObject({
      status: "ready",
      cityCode: "hangzhou",
    });
    fireEvent.click(screen.getByRole("button", { name: "暂不切换" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(shell.snapshot()).toMatchObject({
      status: "ready",
      cityCode: "hangzhou",
    });
    expect(screen.getByText(/已保留当前服务城市/u)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "再次保存" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await screen.findByRole("dialog", { name: "是否切换当前服务城市？" });
    fireEvent.click(screen.getByRole("button", { name: "切换到上海" }));
    await waitFor(() => {
      expect(shell.snapshot()).toMatchObject({
        status: "ready",
        cityCode: "shanghai",
      });
    });
  });

  it("uses only safe internal seams and makes the masked phone non-copyable", async () => {
    const { shell } = await shellFixture();
    const nav = navigation();
    render(
      <CustomerProfilePage
        slice={customerProfileSlice}
        route={route()}
        shell={shell}
        coordinator={new CustomerProfileCoordinator(() => api())}
        navigation={nav}
      />,
    );

    const phone = await screen.findByText("138****8000");
    expect(fireEvent.copy(phone)).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "进入" })[0]!);
    expect(nav.open).toHaveBeenCalledWith("addresses");
    fireEvent.click(screen.getAllByRole("button", { name: "进入" })[1]!);
    expect(nav.open).toHaveBeenCalledWith("coupons");
    fireEvent.click(screen.getAllByRole("button", { name: "进入" })[2]!);
    expect(nav.open).toHaveBeenCalledWith("notifications");
    fireEvent.click(screen.getAllByRole("button", { name: "进入" })[3]!);
    expect(nav.open).toHaveBeenCalledWith("support");
  });

  it("calls the B1A logout scope cleanup, retains city preference, and navigates to login", async () => {
    const { shell, storage } = await shellFixture();
    storage.setItem("xlb.customer.feature.profile:customer-profile-1", "private");
    storage.setItem("xlb.customer.sdui.profile:customer-profile-1", "private");
    const nav = navigation();

    render(
      <CustomerProfilePage
        slice={customerProfileSlice}
        route={route()}
        shell={shell}
        coordinator={new CustomerProfileCoordinator(() => api())}
        navigation={nav}
      />,
    );
    await screen.findByText("138****8000");
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(nav.login).toHaveBeenCalledTimes(1));
    expect(shell.snapshot()).toMatchObject({
      status: "ready",
      session: null,
      cityCode: "hangzhou",
    });
    expect(storage.getItem("xlb.customer.feature.profile:customer-profile-1"))
      .toBeNull();
    expect(storage.getItem("xlb.customer.sdui.profile:customer-profile-1"))
      .toBeNull();
    expect(storage.getItem("xlb.customer.cityCode")).toBe("hangzhou");
  });

  it("routes a Profile 401 through B1A expiry cleanup instead of deleting one token key", async () => {
    const { shell, storage } = await shellFixture();
    storage.setItem("xlb.customer.data.profile:customer-profile-1", "private");
    const nav = navigation();
    const unauthorized = api({
      getProfile: vi.fn().mockRejectedValue(new ApiClientError({
        kind: "http",
        message: "unauthorized",
        method: "GET",
        path: "/api/customer/profile",
        status: 401,
      })),
    });

    render(
      <CustomerProfilePage
        slice={customerProfileSlice}
        route={route()}
        shell={shell}
        coordinator={new CustomerProfileCoordinator(() => unauthorized)}
        navigation={nav}
      />,
    );

    await waitFor(() => expect(nav.login).toHaveBeenCalledTimes(1));
    expect(shell.snapshot()).toMatchObject({
      status: "ready",
      sessionStatus: "expired",
      session: null,
      cityCode: "hangzhou",
    });
    expect(storage.getItem("xlb.customer.data.profile:customer-profile-1"))
      .toBeNull();
    expect(storage.getItem("xlb.customer.cityCode")).toBe("hangzhou");
  });
});
