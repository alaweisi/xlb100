import {
  BrandLogo,
  CustomerButton,
  CustomerComponentRegistry,
} from "@xlb/customer-components";
import type { FormEvent } from "react";
import type { CustomerAuthActionController } from "./CustomerAuthActionController.js";
import type { CustomerAuthView } from "./CustomerAuthCoordinator.js";

export type CustomerAuthComponentType =
  | "auth-brand"
  | "auth-heading"
  | "auth-phone-form"
  | "auth-otp-form"
  | "auth-status"
  | "auth-privacy";

export interface CustomerAuthComponentProps {
  readonly view: CustomerAuthView;
  readonly actions: CustomerAuthActionController;
}

function remainingSeconds(targetMs: number | null, nowMs: number): number {
  return targetMs === null ? 0 : Math.max(0, Math.ceil((targetMs - nowMs) / 1_000));
}

function maskedPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "当前手机号";
}

function AuthBrand(_props: CustomerAuthComponentProps) {
  return (
    <div className="xlb-entry-brand">
      <BrandLogo variant="compact" />
      <span>顾客安全登录</span>
    </div>
  );
}

function AuthHeading({ view }: CustomerAuthComponentProps) {
  const awaitingCode = view.expiresAtMs !== null && view.status !== "code-expired";
  return (
    <header className="xlb-entry-heading">
      <h1>{awaitingCode ? "输入验证码" : "欢迎回来"}</h1>
      <p>
        {awaitingCode
          ? `验证码已发送至 ${maskedPhone(view.phone)}，请在有效期内完成验证。`
          : "使用手机号获取一次性验证码，登录后继续刚才的任务。"}
      </p>
    </header>
  );
}

function AuthPhoneForm({ view, actions }: CustomerAuthComponentProps) {
  if (view.expiresAtMs !== null && view.status !== "code-expired") return null;
  const busy = view.status === "requesting-code";
  return (
    <form
      className="xlb-entry-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void actions.requestCode();
      }}
      noValidate
    >
      <label className="xlb-entry-field">
        手机号
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={view.phone}
          onChange={(event) => actions.updatePhone(event.currentTarget.value)}
          aria-invalid={view.fieldErrors.phone !== undefined || undefined}
          aria-describedby={view.fieldErrors.phone ? "customer-auth-phone-error" : undefined}
          placeholder="请输入 11 位手机号"
          disabled={busy}
        />
      </label>
      {view.fieldErrors.phone ? (
        <p id="customer-auth-phone-error" className="xlb-entry-field-error" role="alert">
          {view.fieldErrors.phone}
        </p>
      ) : null}
      <div className="xlb-entry-actions">
        <CustomerButton type="submit" busy={busy} disabled={view.phone.length !== 11}>
          {busy ? "正在发送" : "获取验证码"}
        </CustomerButton>
      </div>
    </form>
  );
}

function AuthOtpForm({ view, actions }: CustomerAuthComponentProps) {
  if (view.expiresAtMs === null || view.status === "code-expired") return null;
  const busy = view.status === "verifying";
  const resendSeconds = remainingSeconds(view.resendAvailableAtMs, view.nowMs);
  const expirySeconds = remainingSeconds(view.expiresAtMs, view.nowMs);
  return (
    <form
      className="xlb-entry-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void actions.verifyCode();
      }}
      noValidate
    >
      <label className="xlb-entry-field">
        6 位验证码
        <input
          name="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={view.code}
          onChange={(event) => actions.updateCode(event.currentTarget.value)}
          aria-invalid={view.fieldErrors.code !== undefined || undefined}
          aria-describedby={view.fieldErrors.code ? "customer-auth-code-error" : "customer-auth-code-help"}
          placeholder="请输入验证码"
          disabled={busy}
        />
      </label>
      {view.fieldErrors.code ? (
        <p id="customer-auth-code-error" className="xlb-entry-field-error" role="alert">
          {view.fieldErrors.code}
        </p>
      ) : (
        <p id="customer-auth-code-help" className="xlb-entry-help">
          验证码约 {expirySeconds} 秒后失效。
        </p>
      )}
      <div className="xlb-entry-actions">
        <CustomerButton type="submit" busy={busy} disabled={view.code.length !== 6}>
          {busy ? "正在验证" : "登录并继续"}
        </CustomerButton>
      </div>
      <div className="xlb-entry-inline-actions">
        <span className="xlb-entry-muted">
          {view.attemptsLeft === null ? "" : `剩余验证次数：${view.attemptsLeft}`}
        </span>
        <CustomerButton
          type="button"
          variant="quiet"
          disabled={resendSeconds > 0 || busy}
          onClick={() => void actions.resendCode()}
        >
          {resendSeconds > 0 ? `${resendSeconds} 秒后重发` : "重新获取"}
        </CustomerButton>
      </div>
    </form>
  );
}

function AuthStatus({ view, actions }: CustomerAuthComponentProps) {
  if (view.status === "authenticated") {
    return (
      <section className="xlb-entry-status" data-kind="success" role="status" aria-live="polite">
        <h2>登录成功</h2>
        <p>正在返回你之前的任务。</p>
      </section>
    );
  }
  if (view.status === "conflict") {
    return (
      <section className="xlb-entry-status" data-kind="conflict" role="alert">
        <h2>无法使用该会话</h2>
        <p>{view.error?.message}</p>
        <CustomerButton type="button" variant="secondary" onClick={() => actions.returnHome()}>
          返回安全首页
        </CustomerButton>
      </section>
    );
  }
  if (view.status === "code-expired") {
    return (
      <section className="xlb-entry-status" data-kind="error" role="alert">
        <h2>验证码已过期</h2>
        <p>请重新获取验证码后继续。</p>
      </section>
    );
  }
  if (view.error === null) return null;
  return (
    <section className="xlb-entry-status" data-kind="error" role="alert">
      <h2>{view.status === "rate-limited" ? "暂时不能重发" : "登录未完成"}</h2>
      <p>{view.error.message}</p>
    </section>
  );
}

function AuthPrivacy(_props: CustomerAuthComponentProps) {
  return (
    <p className="xlb-entry-help">
      验证码仅用于本次身份验证。我们不会在页面日志或遥测中记录验证码、访问令牌或完整手机号。
    </p>
  );
}

export function createCustomerAuthComponentRegistry() {
  return new CustomerComponentRegistry<CustomerAuthComponentType, CustomerAuthComponentProps>()
    .register("auth-brand", AuthBrand)
    .register("auth-heading", AuthHeading)
    .register("auth-phone-form", AuthPhoneForm)
    .register("auth-otp-form", AuthOtpForm)
    .register("auth-status", AuthStatus)
    .register("auth-privacy", AuthPrivacy);
}

export const CUSTOMER_AUTH_COMPONENT_PLAN: readonly CustomerAuthComponentType[] =
  Object.freeze([
    "auth-brand",
    "auth-heading",
    "auth-phone-form",
    "auth-otp-form",
    "auth-status",
    "auth-privacy",
  ]);
