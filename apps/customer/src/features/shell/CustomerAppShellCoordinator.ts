import type { KnownCityCode } from "@xlb/types";
import type { CustomerCitySnapshot, CustomerSessionSnapshot } from "../../platform/slices/index.js";
import {
  CustomerCacheScopeCoordinator,
  type CustomerCacheScope,
} from "./cacheScope.js";
import { CustomerCityRepository, isCustomerServiceCity } from "./citySelection.js";
import {
  CustomerSessionRepository,
  type CustomerAuthenticatedSession,
  type CustomerSessionRestoreResult,
} from "./sessionLifecycle.js";

export type CustomerAppShellState =
  | {
      readonly status: "booting" | "restoring" | "clearing-session";
    }
  | {
      readonly status: "ready";
      readonly sessionStatus: "authenticated" | "guest" | "expired";
      readonly session: CustomerAuthenticatedSession | null;
      readonly cityCode: KnownCityCode | null;
      readonly cacheScope: CustomerCacheScope;
      readonly persistence: CustomerSessionRestoreResult["persistence"];
    }
  | {
      readonly status: "error";
      readonly errorCode: "session_restore_failed" | "scope_rotation_failed";
      readonly retryable: true;
    };

type Listener = (state: CustomerAppShellState) => void;

export class CustomerAppShellCoordinator {
  #state: CustomerAppShellState = Object.freeze({ status: "booting" });
  readonly #listeners = new Set<Listener>();

  constructor(
    private readonly sessions: CustomerSessionRepository,
    private readonly cities: CustomerCityRepository,
    private readonly scopes: CustomerCacheScopeCoordinator,
  ) {}

  snapshot(): CustomerAppShellState {
    return this.#state;
  }

  sessionSnapshot(): CustomerSessionSnapshot {
    const state = this.#state;
    return state.status === "ready" && state.session !== null
      ? Object.freeze({ status: "authenticated", actor: state.session.actor })
      : Object.freeze({ status: "anonymous" });
  }

  citySnapshot(): CustomerCitySnapshot {
    const state = this.#state;
    return state.status === "ready" && state.cityCode !== null
      ? Object.freeze({ status: "resolved", cityCode: state.cityCode })
      : Object.freeze({ status: "unresolved" });
  }

  accessToken(): string | null {
    const state = this.#state;
    return state.status === "ready" ? state.session?.token ?? null : null;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  async restore(): Promise<CustomerAppShellState> {
    this.#set({ status: "restoring" });
    try {
      const restored = this.sessions.restore();
      const cityCode = this.cities.restore();
      const cacheScope = await this.scopes.rotate(
        restored.session?.actor ?? null,
        cityCode,
        restored.discardedInvalidSession,
      );
      this.#set({
        status: "ready",
        sessionStatus: restored.session !== null
          ? "authenticated"
          : restored.discardedInvalidSession
            ? "expired"
            : "guest",
        session: restored.session,
        cityCode,
        cacheScope,
        persistence: restored.persistence,
      });
    } catch {
      this.#set({
        status: "error",
        errorCode: "session_restore_failed",
        retryable: true,
      });
    }
    return this.#state;
  }

  async establishSession(session: CustomerAuthenticatedSession): Promise<CustomerAppShellState> {
    if (this.#state.status !== "ready") await this.restore();
    const currentCity = this.#state.status === "ready"
      ? this.#state.cityCode
      : this.cities.restore();
    const persistence = this.sessions.save(session);
    try {
      const cacheScope = await this.scopes.rotate(session.actor, currentCity);
      this.#set({
        status: "ready",
        sessionStatus: "authenticated",
        session,
        cityCode: currentCity,
        cacheScope,
        persistence,
      });
    } catch {
      this.sessions.clear();
      this.#set({
        status: "error",
        errorCode: "scope_rotation_failed",
        retryable: true,
      });
    }
    return this.#state;
  }

  async selectCity(cityCode: KnownCityCode): Promise<CustomerAppShellState> {
    if (!isCustomerServiceCity(cityCode)) return this.#state;
    const current = this.#state.status === "ready" ? this.#state : null;
    const session = current?.session ?? null;
    const persistence = current?.persistence ?? this.sessions.persistence;
    this.cities.save(cityCode);
    try {
      const cacheScope = await this.scopes.rotate(session?.actor ?? null, cityCode);
      this.#set({
        status: "ready",
        sessionStatus: session === null ? "guest" : "authenticated",
        session,
        cityCode,
        cacheScope,
        persistence,
      });
    } catch {
      this.#set({
        status: "error",
        errorCode: "scope_rotation_failed",
        retryable: true,
      });
    }
    return this.#state;
  }

  async expireSession(): Promise<CustomerAppShellState> {
    return this.#clearSession("expired");
  }

  async logout(): Promise<CustomerAppShellState> {
    return this.#clearSession("guest");
  }

  async #clearSession(
    sessionStatus: "expired" | "guest",
  ): Promise<CustomerAppShellState> {
    const cityCode = this.#state.status === "ready"
      ? this.#state.cityCode
      : this.cities.restore();
    this.#set({ status: "clearing-session" });
    this.sessions.clear();
    try {
      const cacheScope = await this.scopes.rotate(null, cityCode);
      this.#set({
        status: "ready",
        sessionStatus,
        session: null,
        cityCode,
        cacheScope,
        persistence: this.sessions.persistence,
      });
    } catch {
      this.#set({
        status: "error",
        errorCode: "scope_rotation_failed",
        retryable: true,
      });
    }
    return this.#state;
  }

  #set(state: CustomerAppShellState): void {
    this.#state = Object.freeze(state);
    for (const listener of this.#listeners) listener(this.#state);
  }
}
