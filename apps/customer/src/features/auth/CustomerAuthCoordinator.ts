import {
  ApiClientError,
  type createAuthApi,
} from "@xlb/api-client";
import { CustomerAppShellCoordinator } from "../shell/CustomerAppShellCoordinator.js";
import { createCustomerSessionFromLogin } from "../shell/sessionLifecycle.js";
import { resolveSafeCustomerReturnUrl } from "../shell/safeReturnUrl.js";

export type CustomerAuthStatus =
  | "idle"
  | "requesting-code"
  | "code-sent"
  | "verifying"
  | "authenticated"
  | "rate-limited"
  | "code-expired"
  | "error"
  | "conflict";

export interface CustomerAuthView {
  readonly status: CustomerAuthStatus;
  readonly phone: string;
  readonly code: string;
  readonly returnUrl: string;
  readonly expiresAtMs: number | null;
  readonly resendAvailableAtMs: number | null;
  readonly attemptsLeft: number | null;
  readonly fieldErrors: Readonly<{
    phone?: string;
    code?: string;
  }>;
  readonly error: Readonly<{
    code: string;
    message: string;
    retryable: boolean;
  }> | null;
  readonly nowMs: number;
}

type CustomerAuthApi = ReturnType<typeof createAuthApi>;
type Listener = (view: CustomerAuthView) => void;

function validPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/u.test(phone);
}

function validOtp(code: string): boolean {
  return /^\d{6}$/u.test(code);
}

function freezeView(view: CustomerAuthView): CustomerAuthView {
  return Object.freeze({
    ...view,
    fieldErrors: Object.freeze({ ...view.fieldErrors }),
    error: view.error === null ? null : Object.freeze({ ...view.error }),
  });
}

function apiFailure(
  error: unknown,
  phase: "request" | "verify",
  nowMs: number,
): Pick<CustomerAuthView, "status" | "error" | "resendAvailableAtMs"> {
  if (error instanceof ApiClientError) {
    if (error.status === 429) {
      return {
        status: "rate-limited",
        resendAvailableAtMs: nowMs + (error.retryAfterMs ?? 60_000),
        error: {
          code: "rate_limited",
          message: "请求过于频繁，请在倒计时结束后重试。",
          retryable: true,
        },
      };
    }
    if (error.status === 401 && phase === "verify") {
      return {
        status: "error",
        resendAvailableAtMs: null,
        error: {
          code: "verification_failed",
          message: "验证码不正确或已失效，请核对后重试。",
          retryable: true,
        },
      };
    }
    if (error.status === 400) {
      return {
        status: "error",
        resendAvailableAtMs: null,
        error: {
          code: "invalid_request",
          message: phase === "request" ? "手机号格式不正确。" : "验证码格式不正确。",
          retryable: true,
        },
      };
    }
    if (error.kind === "network" || error.kind === "timeout") {
      return {
        status: "error",
        resendAvailableAtMs: null,
        error: {
          code: error.kind,
          message: "网络暂时不可用，请检查连接后重试。",
          retryable: true,
        },
      };
    }
  }
  return {
    status: "error",
    resendAvailableAtMs: null,
    error: {
      code: "auth_unavailable",
      message: "登录服务暂时不可用，请稍后重试。",
      retryable: true,
    },
  };
}

export class CustomerAuthCoordinator {
  #view: CustomerAuthView;
  readonly #listeners = new Set<Listener>();
  readonly #now: () => number;

  constructor(
    private readonly api: CustomerAuthApi,
    private readonly shell: CustomerAppShellCoordinator,
    options: {
      readonly origin: string;
      readonly returnUrl?: string | null;
      readonly now?: () => number;
    },
  ) {
    this.#now = options.now ?? Date.now;
    this.#view = freezeView({
      status: "idle",
      phone: "",
      code: "",
      returnUrl: resolveSafeCustomerReturnUrl(options.returnUrl, options.origin),
      expiresAtMs: null,
      resendAvailableAtMs: null,
      attemptsLeft: null,
      fieldErrors: {},
      error: null,
      nowMs: this.#now(),
    });
  }

  snapshot(): CustomerAuthView {
    return this.#view;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#view);
    return () => this.#listeners.delete(listener);
  }

  setPhone(phone: string): void {
    const normalized = phone.replace(/\D/gu, "").slice(0, 11);
    this.#set({
      ...this.#view,
      phone: normalized,
      fieldErrors: {
        ...this.#view.fieldErrors,
        phone: undefined,
      },
      error: null,
      status: this.#view.status === "authenticated" ? "authenticated" : "idle",
    });
  }

  setCode(code: string): void {
    const normalized = code.replace(/\D/gu, "").slice(0, 6);
    this.#set({
      ...this.#view,
      code: normalized,
      fieldErrors: {
        ...this.#view.fieldErrors,
        code: undefined,
      },
      error: null,
      status: this.#view.status === "code-expired" ? "code-expired" : "code-sent",
    });
  }

  setReturnUrl(candidate: string | null | undefined, origin: string): void {
    this.#set({
      ...this.#view,
      returnUrl: resolveSafeCustomerReturnUrl(candidate, origin),
    });
  }

  tick(): void {
    const nowMs = this.#now();
    const expired = this.#view.expiresAtMs !== null &&
      nowMs >= this.#view.expiresAtMs &&
      ["code-sent", "error"].includes(this.#view.status);
    this.#set({
      ...this.#view,
      nowMs,
      status: expired ? "code-expired" : this.#view.status,
      error: expired
        ? {
            code: "code_expired",
            message: "验证码已过期，请重新获取。",
            retryable: true,
          }
        : this.#view.error,
    });
  }

  async requestCode(): Promise<CustomerAuthView> {
    const nowMs = this.#now();
    if (!validPhone(this.#view.phone)) {
      this.#set({
        ...this.#view,
        status: "idle",
        fieldErrors: { phone: "请输入有效的 11 位手机号。" },
        error: null,
        nowMs,
      });
      return this.#view;
    }
    if (
      this.#view.resendAvailableAtMs !== null &&
      nowMs < this.#view.resendAvailableAtMs
    ) {
      this.#set({
        ...this.#view,
        status: "rate-limited",
        error: {
          code: "countdown_active",
          message: "请在倒计时结束后重新获取验证码。",
          retryable: true,
        },
        nowMs,
      });
      return this.#view;
    }

    this.#set({
      ...this.#view,
      status: "requesting-code",
      code: "",
      fieldErrors: {},
      error: null,
      nowMs,
    });
    try {
      const response = await this.api.requestCustomerLoginCode(this.#view.phone);
      if (!response.ok) {
        const failure = apiFailure(
          new ApiClientError({
            kind: "http",
            message: "OTP request rejected",
            method: "POST",
            path: "/api/auth/customer/code",
            status: response.statusCode,
          }),
          "request",
          nowMs,
        );
        this.#set({ ...this.#view, ...failure, nowMs });
        return this.#view;
      }
      const expiresAtMs = Date.parse(response.expiresAt);
      const safeExpiry = Number.isFinite(expiresAtMs)
        ? expiresAtMs
        : nowMs + response.ttlSeconds * 1_000;
      this.#set({
        ...this.#view,
        status: "code-sent",
        code: "",
        expiresAtMs: safeExpiry,
        resendAvailableAtMs: nowMs + Math.min(60, response.ttlSeconds) * 1_000,
        attemptsLeft: response.attemptsLeft,
        fieldErrors: {},
        error: null,
        nowMs,
      });
    } catch (error) {
      const failure = apiFailure(error, "request", nowMs);
      this.#set({ ...this.#view, ...failure, nowMs });
    }
    return this.#view;
  }

  async verifyCode(): Promise<CustomerAuthView> {
    const nowMs = this.#now();
    if (this.#view.expiresAtMs !== null && nowMs >= this.#view.expiresAtMs) {
      this.#set({
        ...this.#view,
        status: "code-expired",
        fieldErrors: { code: "验证码已过期，请重新获取。" },
        error: {
          code: "code_expired",
          message: "验证码已过期，请重新获取。",
          retryable: true,
        },
        nowMs,
      });
      return this.#view;
    }
    if (!validPhone(this.#view.phone) || !validOtp(this.#view.code)) {
      this.#set({
        ...this.#view,
        status: "code-sent",
        fieldErrors: {
          ...(!validPhone(this.#view.phone) ? { phone: "手机号格式不正确。" } : {}),
          ...(!validOtp(this.#view.code) ? { code: "请输入 6 位验证码。" } : {}),
        },
        error: null,
        nowMs,
      });
      return this.#view;
    }

    this.#set({
      ...this.#view,
      status: "verifying",
      fieldErrors: {},
      error: null,
      nowMs,
    });
    try {
      const response = await this.api.customerLogin(this.#view.phone, this.#view.code);
      if (!response.ok) {
        const failure = apiFailure(
          new ApiClientError({
            kind: "http",
            message: "OTP verification rejected",
            method: "POST",
            path: "/api/auth/customer/login",
            status: response.statusCode,
          }),
          "verify",
          nowMs,
        );
        this.#set({ ...this.#view, ...failure, nowMs });
        return this.#view;
      }
      const session = createCustomerSessionFromLogin(response, nowMs);
      if (session === null) {
        this.#set({
          ...this.#view,
          status: "conflict",
          code: "",
          error: {
            code: "wrong_actor",
            message: "该会话不属于顾客端，已拒绝进入。",
            retryable: false,
          },
          nowMs,
        });
        return this.#view;
      }
      const shellState = await this.shell.establishSession(session);
      if (shellState.status !== "ready" || shellState.sessionStatus !== "authenticated") {
        this.#set({
          ...this.#view,
          status: "error",
          code: "",
          error: {
            code: "session_storage_failed",
            message: "会话未能安全建立，请重新登录。",
            retryable: true,
          },
          nowMs,
        });
        return this.#view;
      }
      this.#set({
        ...this.#view,
        status: "authenticated",
        code: "",
        error: null,
        fieldErrors: {},
        nowMs,
      });
    } catch (error) {
      const failure = apiFailure(error, "verify", nowMs);
      this.#set({ ...this.#view, ...failure, code: "", nowMs });
    }
    return this.#view;
  }

  #set(view: CustomerAuthView): void {
    this.#view = freezeView(view);
    for (const listener of this.#listeners) listener(this.#view);
  }
}
