import type { ComponentType } from "react";
import {
  createCustomerEntryGuardAssembly,
  evaluateCustomerGuardPlan,
} from "../features/shell/customerGuards.js";
import {
  getCustomerBrowserEntryRuntime,
  type CustomerBrowserEntryRuntime,
} from "../features/shell/browserEntryRuntime.js";
import type {
  CustomerAppShellCoordinator,
  CustomerAppShellState,
} from "../features/shell/CustomerAppShellCoordinator.js";
import { resolveSafeCustomerReturnUrl } from "../features/shell/safeReturnUrl.js";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerGuardAssembly,
  CustomerRouteGuardDecision,
} from "../platform/slices/index.js";
import { customerAppRouteAssembly } from "./customerAppRegistry.js";
import { matchCustomerRoute, type CustomerRouteMatch } from "./customerRouteMatcher.js";

export type CustomerAppRouterState =
  | { readonly status: "loading"; readonly match: CustomerRouteMatch | null }
  | { readonly status: "ready"; readonly match: CustomerRouteMatch; readonly RouteComponent: ComponentType<CustomerFeatureRouteComponentProps> }
  | { readonly status: "error"; readonly match: CustomerRouteMatch }
  | { readonly status: "not-found"; readonly pathname: string }
  | { readonly status: "denied"; readonly reason: "wrong_actor" | "forbidden" | "not_found" };

type Listener = (state: CustomerAppRouterState) => void;

export interface CustomerAppRouterRuntimeOptions {
  readonly browser?: Window;
  readonly entry?: CustomerBrowserEntryRuntime;
  readonly guards?: Readonly<CustomerGuardAssembly>;
  readonly matchRoute?: typeof matchCustomerRoute;
}

function internalRoute(route: unknown, origin: string): string | null {
  if (typeof route !== "string" || route.length === 0 || route.length > 2_048) return null;
  try {
    const url = new URL(route, origin);
    if (
      url.origin !== origin ||
      url.username !== "" ||
      url.password !== "" ||
      (url.protocol !== "http:" && url.protocol !== "https:")
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

const restoreBoundaries = new WeakSet<CustomerAppShellCoordinator>();

function installCustomerShellRestoreOnceBoundary(
  shell: CustomerAppShellCoordinator,
): void {
  if (restoreBoundaries.has(shell)) return;
  restoreBoundaries.add(shell);
  const restore = shell.restore.bind(shell);
  let activeRestore: Promise<CustomerAppShellState> | null = null;
  Object.defineProperty(shell, "restore", {
    configurable: true,
    value(): Promise<CustomerAppShellState> {
      const snapshot = shell.snapshot();
      if (snapshot.status === "ready") return Promise.resolve(snapshot);
      if (activeRestore !== null) return activeRestore;
      activeRestore = restore().finally(() => {
        activeRestore = null;
      });
      return activeRestore;
    },
  });
}

export class CustomerAppRouterRuntime {
  readonly #browser: Window;
  readonly #entry: CustomerBrowserEntryRuntime;
  readonly #guards: Readonly<CustomerGuardAssembly>;
  readonly #matchRoute: typeof matchCustomerRoute;
  readonly #listeners = new Set<Listener>();
  #state: CustomerAppRouterState = Object.freeze({ status: "loading", match: null });
  #desiredRoute = "/";
  #revision = 0;
  #started = false;
  #restored = false;
  #unsubscribeShell: (() => void) | null = null;

  constructor(options: CustomerAppRouterRuntimeOptions = {}) {
    if (options.browser === undefined && typeof window === "undefined") {
      throw new Error("Customer App router requires a browser");
    }
    this.#browser = options.browser ?? window;
    this.#entry = options.entry ?? getCustomerBrowserEntryRuntime();
    installCustomerShellRestoreOnceBoundary(this.#entry.shell);
    this.#guards = options.guards ?? createCustomerEntryGuardAssembly();
    this.#matchRoute = options.matchRoute ?? matchCustomerRoute;
    this.#desiredRoute = `${this.#browser.location.pathname}${this.#browser.location.search}`;
  }

  get entry(): CustomerBrowserEntryRuntime {
    return this.#entry;
  }

  snapshot(): CustomerAppRouterState {
    return this.#state;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#browser.addEventListener("popstate", this.#onPopState);
    this.#browser.addEventListener("xlb:customer:navigate", this.#onNavigate);
    this.#unsubscribeShell = this.#entry.shell.subscribe(() => {
      void this.#resolveDesiredRoute();
    });
    void this.#resolveDesiredRoute();
    if (!this.#restored) {
      this.#restored = true;
      void this.#entry.shell.restore();
    }
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#browser.removeEventListener("popstate", this.#onPopState);
    this.#browser.removeEventListener("xlb:customer:navigate", this.#onNavigate);
    this.#unsubscribeShell?.();
    this.#unsubscribeShell = null;
  }

  retry(): void {
    void this.#resolveDesiredRoute();
  }

  readonly #onPopState = (): void => {
    this.#desiredRoute = `${this.#browser.location.pathname}${this.#browser.location.search}`;
    void this.#resolveDesiredRoute();
  };

  readonly #onNavigate = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    const route = typeof detail === "object" && detail !== null && "route" in detail
      ? internalRoute((detail as { readonly route?: unknown }).route, this.#browser.location.origin)
      : null;
    if (route !== null) {
      this.#desiredRoute = route;
      void this.#resolveDesiredRoute();
    }
    queueMicrotask(() => {
      const browserRoute = `${this.#browser.location.pathname}${this.#browser.location.search}`;
      if (browserRoute !== this.#desiredRoute) {
        this.#desiredRoute = browserRoute;
        void this.#resolveDesiredRoute();
      }
    });
  };

  async #resolveDesiredRoute(): Promise<void> {
    const revision = ++this.#revision;
    const url = internalRoute(this.#desiredRoute, this.#browser.location.origin);
    if (url === null) {
      this.#set({ status: "not-found", pathname: "/" }, revision);
      return;
    }
    const parsed = new URL(url, this.#browser.location.origin);
    const match = this.#matchRoute(parsed.pathname, parsed.search);
    if (match === null) {
      this.#set({ status: "not-found", pathname: parsed.pathname }, revision);
      return;
    }

    const shell = this.#entry.shell.snapshot();
    if (shell.status !== "ready") {
      this.#set({ status: "loading", match }, revision);
      return;
    }
    this.#set({ status: "loading", match }, revision);

    const safeReturnUrl = resolveSafeCustomerReturnUrl(
      `${parsed.pathname}${parsed.search}`,
      this.#browser.location.origin,
    );
    const decision = await evaluateCustomerGuardPlan(
      match.published.registration.slice.guards,
      {
        sliceId: match.published.registration.slice.id,
        pathname: parsed.pathname,
        safeReturnUrl,
        routeParams: match.route.params,
        session: this.#entry.shell.sessionSnapshot(),
        city: this.#entry.shell.citySnapshot(),
      },
      this.#guards,
    );
    if (revision !== this.#revision) return;
    if (decision.outcome === "redirect") {
      this.#redirect(decision, safeReturnUrl, revision);
      return;
    }
    if (decision.outcome === "deny") {
      this.#set({ status: "denied", reason: decision.reason }, revision);
      return;
    }

    try {
      customerAppRouteAssembly.templateRegistry.resolveForSlice(
        match.published.registration.slice,
      );
      const module = await match.published.registration.load();
      this.#set({ status: "ready", match, RouteComponent: module.RouteComponent }, revision);
    } catch {
      this.#set({ status: "error", match }, revision);
    }
  }

  #redirect(
    decision: Extract<CustomerRouteGuardDecision, { readonly outcome: "redirect" }>,
    safeReturnUrl: string,
    revision: number,
  ): void {
    const target = `${decision.route}?returnTo=${encodeURIComponent(safeReturnUrl)}`;
    if (target === this.#desiredRoute) {
      this.#set({ status: "denied", reason: "forbidden" }, revision);
      return;
    }
    this.#browser.history.replaceState(
      { reason: decision.reason },
      "",
      target,
    );
    this.#desiredRoute = target;
    void this.#resolveDesiredRoute();
  }

  #set(state: CustomerAppRouterState, revision = this.#revision): void {
    if (revision !== this.#revision) return;
    this.#state = Object.freeze(state);
    for (const listener of this.#listeners) listener(this.#state);
  }
}
