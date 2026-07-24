// @vitest-environment jsdom

import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createCustomerBrowserEntryRuntime,
} from "../../apps/customer/src/features/shell/browserEntryRuntime.js";
import {
  customerHomeSlice,
} from "../../apps/customer/src/features/home/customerHomeFeatureRouteModule.js";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerGuardAssembly,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CustomerAppRouterRuntime,
} from "../../apps/customer/src/routes/CustomerAppRouterRuntime.js";
import type { CustomerRouteMatch } from "../../apps/customer/src/routes/customerRouteMatcher.js";

const RouteComponent: ComponentType<CustomerFeatureRouteComponentProps> = () => null;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function publishedMatch(
  pathname: string,
  load: () => Promise<{ RouteComponent: typeof RouteComponent }>,
): CustomerRouteMatch {
  return {
    published: {
      pattern: "/",
      registration: { slice: customerHomeSlice, load },
    },
    route: {
      pathname,
      pattern: "/",
      params: {},
      query: {},
    },
  };
}

describe("Customer App browser router runtime", () => {
  it("maps the deployed Customer base path to internal routes", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/customer/");
    const runtime = new CustomerAppRouterRuntime({
      browser: window,
      entry: createCustomerBrowserEntryRuntime(window.localStorage),
      basePath: "/customer/",
    });
    runtime.start();

    await vi.waitFor(() => {
      expect(runtime.snapshot()).toMatchObject({
        status: "ready",
        match: { route: { pathname: "/" } },
      });
    });
    expect(`${window.location.pathname}${window.location.search}`).toBe("/customer/");
    runtime.stop();
  });

  it("keeps protected-route redirects inside the deployed Customer base path", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/customer/orders/order-safe?view=detail");
    const runtime = new CustomerAppRouterRuntime({
      browser: window,
      entry: createCustomerBrowserEntryRuntime(window.localStorage),
      basePath: "/customer/",
    });
    runtime.start();

    await vi.waitFor(() => {
      expect(runtime.snapshot()).toMatchObject({
        status: "ready",
        match: { route: { pathname: "/auth/login" } },
      });
    });
    expect(`${window.location.pathname}${window.location.search}`)
      .toBe("/customer/auth/login?returnTo=%2Forders%2Forder-safe%3Fview%3Ddetail");
    runtime.stop();
  });

  it("restores the shared shell once and makes ready-state feature restores idempotent", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/auth/login");
    const entry = createCustomerBrowserEntryRuntime(window.localStorage);
    const restore = vi.spyOn(entry.shell, "restore");
    const runtime = new CustomerAppRouterRuntime({ browser: window, entry });
    runtime.start();
    await vi.waitFor(() => {
      expect(entry.shell.snapshot().status).toBe("ready");
    });

    await entry.shell.restore();
    expect(restore).toHaveBeenCalledTimes(1);
    runtime.stop();
  });

  it("uses event detail before history mutation and then follows popstate", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    const runtime = new CustomerAppRouterRuntime({
      browser: window,
      entry: createCustomerBrowserEntryRuntime(window.localStorage),
    });
    runtime.start();
    await flush();

    window.dispatchEvent(new CustomEvent("xlb:customer:navigate", {
      detail: { route: "/auth/login?returnTo=%2Forders" },
    }));
    window.history.pushState(null, "", "/auth/login?returnTo=%2Forders");
    await vi.waitFor(() => {
      expect(runtime.snapshot().status).toBe("ready");
    });
    expect(runtime.snapshot()).toMatchObject({
      status: "ready",
      match: {
        route: {
          pathname: "/auth/login",
          query: { returnTo: "/orders" },
        },
      },
    });

    window.history.pushState(null, "", "/location");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() => {
      expect(runtime.snapshot().status).toBe("ready");
    });
    expect(runtime.snapshot()).toMatchObject({
      status: "ready",
      match: { route: { pathname: "/location" } },
    });
    runtime.stop();
  });

  it("redirects anonymous and cityless protected routes with a safe return target", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/orders/order-safe?view=detail");
    const entry = createCustomerBrowserEntryRuntime(window.localStorage);
    const runtime = new CustomerAppRouterRuntime({ browser: window, entry });
    runtime.start();
    await flush();

    expect(`${window.location.pathname}${window.location.search}`)
      .toBe("/auth/login?returnTo=%2Forders%2Forder-safe%3Fview%3Ddetail");
    await vi.waitFor(() => {
      expect(runtime.snapshot().status).toBe("ready");
    });
    expect(runtime.snapshot()).toMatchObject({
      status: "ready",
      match: { route: { pathname: "/auth/login" } },
    });

    await entry.shell.selectCity("hangzhou");
    window.history.replaceState(null, "", "/orders/order-safe");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flush();
    expect(window.location.pathname).toBe("/auth/login");
    runtime.stop();
  });

  it("renders a homogeneous denial and never loops when a guard denies the actor", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/orders");
    const deny: CustomerGuardAssembly = {
      session: { kind: "session", evaluate: () => ({ outcome: "deny", reason: "wrong_actor" }) },
      city: { kind: "city", evaluate: () => ({ outcome: "allow" }) },
      protectedRoute: { kind: "protected-route", evaluate: () => ({ outcome: "allow" }) },
    };
    const entry = createCustomerBrowserEntryRuntime(window.localStorage);
    const runtime = new CustomerAppRouterRuntime({ browser: window, entry, guards: deny });
    runtime.start();
    await flush();

    expect(runtime.snapshot()).toEqual({ status: "denied", reason: "wrong_actor" });
    expect(window.location.pathname).toBe("/orders");
    runtime.stop();
  });

  it("keeps the latest route when an older module load settles last", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/slow");
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const slowLoad = vi.fn(async () => {
      await slow;
      return { RouteComponent };
    });
    const fastLoad = vi.fn(async () => ({ RouteComponent }));
    const matchRoute = (pathname: string) =>
      pathname === "/slow"
        ? publishedMatch(pathname, slowLoad)
        : pathname === "/fast"
          ? publishedMatch(pathname, fastLoad)
          : null;
    const runtime = new CustomerAppRouterRuntime({
      browser: window,
      entry: createCustomerBrowserEntryRuntime(window.localStorage),
      matchRoute,
    });
    runtime.start();
    await flush();
    expect(slowLoad).toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent("xlb:customer:navigate", {
      detail: { route: "/fast" },
    }));
    window.history.pushState(null, "", "/fast");
    await flush();
    expect(runtime.snapshot()).toMatchObject({
      status: "ready",
      match: { route: { pathname: "/fast" } },
    });

    releaseSlow();
    await flush();
    expect(runtime.snapshot()).toMatchObject({
      status: "ready",
      match: { route: { pathname: "/fast" } },
    });
    runtime.stop();
  });
});
