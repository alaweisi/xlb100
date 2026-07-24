import { ApiClientError, type customerApi } from "@xlb/api-client";
import type { KnownCityCode } from "@xlb/types";
import { CustomerAppShellCoordinator } from "../shell/CustomerAppShellCoordinator.js";
import {
  CUSTOMER_SERVICE_CITIES,
  isCustomerServiceCity,
} from "../shell/citySelection.js";
import { resolveSafeCustomerReturnUrl } from "../shell/safeReturnUrl.js";

export type CustomerLocationStatus =
  | "resolving-profile"
  | "checking-capability"
  | "selecting"
  | "requesting-permission"
  | "manual-selected"
  | "denied"
  | "restricted"
  | "out-of-service"
  | "error"
  | "conflict"
  | "unavailable";

export interface CustomerLocationView {
  readonly status: CustomerLocationStatus;
  readonly selectedCityCode: KnownCityCode | null;
  readonly profileDefaultCityCode: KnownCityCode | null;
  readonly returnUrl: string;
  readonly capability: "unavailable";
  readonly cities: typeof CUSTOMER_SERVICE_CITIES;
  readonly error: Readonly<{
    code: string;
    message: string;
    retryable: boolean;
  }> | null;
}

type CustomerApi = ReturnType<typeof customerApi.forClient>;
type Listener = (view: CustomerLocationView) => void;

function freezeView(view: CustomerLocationView): CustomerLocationView {
  return Object.freeze({
    ...view,
    error: view.error === null ? null : Object.freeze({ ...view.error }),
  });
}

export class CustomerLocationCoordinator {
  #view: CustomerLocationView;
  readonly #listeners = new Set<Listener>();

  constructor(
    private readonly api: CustomerApi,
    private readonly shell: CustomerAppShellCoordinator,
    options: {
      readonly origin: string;
      readonly returnUrl?: string | null;
    },
  ) {
    const shellState = shell.snapshot();
    this.#view = freezeView({
      status: "checking-capability",
      selectedCityCode: shellState.status === "ready" ? shellState.cityCode : null,
      profileDefaultCityCode: null,
      returnUrl: resolveSafeCustomerReturnUrl(options.returnUrl, options.origin),
      capability: "unavailable",
      cities: CUSTOMER_SERVICE_CITIES,
      error: null,
    });
  }

  snapshot(): CustomerLocationView {
    return this.#view;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#view);
    return () => this.#listeners.delete(listener);
  }

  async initialize(): Promise<CustomerLocationView> {
    let shellState = this.shell.snapshot();
    if (shellState.status !== "ready") shellState = await this.shell.restore();
    if (shellState.status !== "ready") {
      this.#set({
        ...this.#view,
        status: "error",
        selectedCityCode: null,
        error: {
          code: "shell_restore_failed",
          message: "应用入口暂时无法恢复，你仍可稍后重试。",
          retryable: true,
        },
      });
      return this.#view;
    }

    const selectedCityCode = shellState.cityCode;
    if (selectedCityCode === null || shellState.session === null) {
      this.#set({
        ...this.#view,
        status: "selecting",
        selectedCityCode,
        profileDefaultCityCode: null,
        error: null,
      });
      return this.#view;
    }

    this.#set({
      ...this.#view,
      status: "resolving-profile",
      selectedCityCode,
      error: null,
    });
    try {
      const response = await this.api.getProfile();
      if (response.profile.customerId !== shellState.session.actor.userId) {
        this.#set({
          ...this.#view,
          status: "conflict",
          error: {
            code: "profile_actor_mismatch",
            message: "账户资料与当前顾客会话不一致，已停止使用该资料。",
            retryable: false,
          },
        });
        return this.#view;
      }
      this.#set({
        ...this.#view,
        status: "selecting",
        selectedCityCode,
        profileDefaultCityCode: isCustomerServiceCity(response.profile.defaultCityCode)
          ? response.profile.defaultCityCode
          : null,
        error: null,
      });
    } catch (error) {
      await this.#handleProfileError(error);
    }
    return this.#view;
  }

  async selectCity(cityCode: string): Promise<CustomerLocationView> {
    if (!isCustomerServiceCity(cityCode)) {
      this.#set({
        ...this.#view,
        status: "out-of-service",
        error: {
          code: "city_out_of_service",
          message: "该城市暂不在当前正式服务范围内，请选择杭州、上海或北京。",
          retryable: true,
        },
      });
      return this.#view;
    }
    this.#set({
      ...this.#view,
      status: "selecting",
      error: null,
    });
    const shellState = await this.shell.selectCity(cityCode);
    if (shellState.status !== "ready" || shellState.cityCode !== cityCode) {
      this.#set({
        ...this.#view,
        status: "error",
        error: {
          code: "city_scope_rotation_failed",
          message: "服务城市未能安全切换，请重试。",
          retryable: true,
        },
      });
      return this.#view;
    }
    this.#set({
      ...this.#view,
      status: "manual-selected",
      selectedCityCode: cityCode,
      error: null,
    });
    return this.#view;
  }

  requestSystemLocation(): CustomerLocationView {
    this.#set({
      ...this.#view,
      status: "unavailable",
      error: {
        code: "gap_06_location_unavailable",
        message: "系统定位、坐标解析与服务城市映射尚未接通，请手动选择服务城市。",
        retryable: false,
      },
    });
    return this.#view;
  }

  async retry(): Promise<CustomerLocationView> {
    return this.initialize();
  }

  async #handleProfileError(error: unknown): Promise<void> {
    if (error instanceof ApiClientError && error.status === 401) {
      await this.shell.expireSession();
      this.#set({
        ...this.#view,
        status: "error",
        error: {
          code: "session_expired",
          message: "登录已失效，请重新登录后继续。",
          retryable: false,
        },
      });
      return;
    }
    if (error instanceof ApiClientError && (error.status === 403 || error.status === 404)) {
      this.#set({
        ...this.#view,
        status: "error",
        error: {
          code: "profile_unavailable",
          message: "账户资料暂时不可读取，你仍可手动选择服务城市。",
          retryable: true,
        },
      });
      return;
    }
    this.#set({
      ...this.#view,
      status: "error",
      error: {
        code: error instanceof ApiClientError ? error.kind : "profile_unavailable",
        message: "账户资料加载失败，你仍可手动选择服务城市。",
        retryable: true,
      },
    });
  }

  #set(view: CustomerLocationView): void {
    this.#view = freezeView(view);
    for (const listener of this.#listeners) listener(this.#view);
  }
}
