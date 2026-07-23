import {
  BrandLogo,
  CustomerButton,
} from "@xlb/customer-components";
import type {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
} from "react";
import {
  useEffect,
  useRef,
} from "react";
import {
  CUSTOMER_SERVICE_CITIES,
} from "../shell/citySelection.js";
import type {
  CustomerAccountDestination,
  CustomerProfileTemplateReadyData,
} from "./profileTypes.js";

export type CustomerProfileComponentProps =
  CustomerProfileTemplateReadyData;

const ACCOUNT_DESTINATIONS = Object.freeze([
  Object.freeze({
    key: "addresses" as const,
    label: "地址簿",
    description: "管理服务地址与默认联系人",
  }),
  Object.freeze({
    key: "coupons" as const,
    label: "券包",
    description: "查看正式优惠券能力",
  }),
  Object.freeze({
    key: "notifications" as const,
    label: "通知",
    description: "查看订单与客服通知",
  }),
  Object.freeze({
    key: "support" as const,
    label: "客服",
    description: "进入客服与工单入口",
  }),
]);

function cityLabel(cityCode: string | null): string {
  return CUSTOMER_SERVICE_CITIES.find((city) => city.cityCode === cityCode)
    ?.label ?? "未设置";
}

function preventMaskedPhoneCopy(event: ClipboardEvent<HTMLElement>): void {
  event.preventDefault();
}

export function ProfileBoundaryHeader() {
  return (
    <header className="xlb-profile-header" data-profile-component="header">
      <BrandLogo variant="compact" />
      <div className="xlb-profile-header__copy">
        <p>账户与服务信息</p>
        <h1>个人中心</h1>
      </div>
    </header>
  );
}

export function ProfileHeader() {
  return (
    <header className="xlb-profile-header" data-profile-component="header">
      <div className="xlb-profile-header__copy">
        <BrandLogo variant="compact" />
        <h1>个人中心</h1>
      </div>
      <span className="xlb-profile-header__level">账户资料</span>
    </header>
  );
}

export function ProfileFeedback({
  viewModel,
  actions,
}: CustomerProfileComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-profile-feedback"
      data-kind={viewModel.notice.kind}
      data-profile-component="feedback"
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
    >
      <span>{viewModel.notice.message}</span>
      <button type="button" onClick={actions.onDismissNotice}>关闭</button>
    </div>
  );
}

export function ProfileSummary({
  viewModel,
}: CustomerProfileComponentProps) {
  const profile = viewModel.profile;
  const initial = profile.name.trim().slice(0, 1) || "喜";
  return (
    <section
      className="xlb-profile-summary"
      data-profile-component="summary"
      aria-labelledby="customer-profile-summary-title"
    >
      <div className="xlb-profile-avatar" aria-hidden="true">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
          />
        ) : <span>{initial}</span>}
      </div>
      <div className="xlb-profile-summary__identity">
        <p id="customer-profile-summary-title">{profile.name}</p>
        <span
          className="xlb-profile-phone"
          aria-label={`已脱敏手机号 ${profile.phoneMasked}`}
          onCopy={preventMaskedPhoneCopy}
          onCut={preventMaskedPhoneCopy}
          draggable={false}
        >
          {profile.phoneMasked}
        </span>
        <small>手机号仅作脱敏展示，不支持复制或还原。</small>
      </div>
      <dl>
        <div>
          <dt>账户默认城市</dt>
          <dd>{cityLabel(profile.defaultCityCode)}</dd>
        </div>
        <div>
          <dt>当前服务城市</dt>
          <dd>{cityLabel(viewModel.currentCityCode)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function ProfileEditor({
  viewModel,
  actions,
}: CustomerProfileComponentProps) {
  const busy = viewModel.status === "saving" ||
    viewModel.status === "logging-out";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.onSave();
  }

  function changeCity(event: ChangeEvent<HTMLSelectElement>) {
    const city = CUSTOMER_SERVICE_CITIES.find(
      (candidate) => candidate.cityCode === event.currentTarget.value,
    );
    if (city !== undefined) actions.onDefaultCityChange(city.cityCode);
  }

  return (
    <form
      className="xlb-profile-editor"
      data-profile-component="editor"
      onSubmit={submit}
      noValidate
    >
      <div className="xlb-profile-section-heading">
        <div>
          <p>资料设置</p>
          <h2>编辑允许字段</h2>
        </div>
        <span data-status={viewModel.status}>
          {viewModel.status === "saving"
            ? "保存中"
            : viewModel.status === "saved"
              ? "已保存"
              : viewModel.status === "dirty"
                ? "待保存"
                : "已同步"}
        </span>
      </div>
      <label className="xlb-profile-field">
        <span>姓名</span>
        <input
          name="name"
          value={viewModel.draft.name}
          onChange={(event) => actions.onNameChange(event.currentTarget.value)}
          autoComplete="name"
          maxLength={64}
          aria-invalid={viewModel.errors.name ? "true" : undefined}
          aria-describedby={viewModel.errors.name
            ? "customer-profile-name-error"
            : undefined}
          disabled={busy}
        />
        {viewModel.errors.name ? (
          <small id="customer-profile-name-error" role="alert">
            {viewModel.errors.name}
          </small>
        ) : null}
      </label>
      <label className="xlb-profile-field">
        <span>账户默认城市</span>
        <select
          name="defaultCityCode"
          value={viewModel.draft.defaultCityCode}
          onChange={changeCity}
          aria-label="账户默认城市"
          aria-invalid={viewModel.errors.defaultCityCode ? "true" : undefined}
          aria-describedby={viewModel.errors.defaultCityCode
            ? "customer-profile-city-error"
            : "customer-profile-city-help"}
          disabled={busy}
        >
          {CUSTOMER_SERVICE_CITIES.map((city) => (
            <option key={city.cityCode} value={city.cityCode}>
              {city.label}
            </option>
          ))}
        </select>
        <small id="customer-profile-city-help">
          保存默认城市不会自动切换当前服务城市；两者不同时会再次确认。
        </small>
        {viewModel.errors.defaultCityCode ? (
          <small id="customer-profile-city-error" role="alert">
            {viewModel.errors.defaultCityCode}
          </small>
        ) : null}
      </label>
      {viewModel.errors.form ? (
        <p className="xlb-profile-editor__error" role="alert">
          {viewModel.errors.form}
        </p>
      ) : null}
      <CustomerButton
        type="submit"
        busy={viewModel.status === "saving"}
        disabled={viewModel.status !== "dirty"}
      >
        {viewModel.status === "saving" ? "正在保存" : "保存资料"}
      </CustomerButton>
      <p className="xlb-profile-editor__avatar-note">
        头像由服务端资料只读展示；当前没有上传 API，因此本页不提供上传或“上传成功”入口。
      </p>
    </form>
  );
}

export function ProfileAccountActions({
  viewModel,
  actions,
}: CustomerProfileComponentProps) {
  const disabled = viewModel.status === "saving" ||
    viewModel.status === "logging-out";
  return (
    <section
      className="xlb-profile-actions"
      data-profile-component="account-actions"
      aria-labelledby="customer-profile-actions-title"
    >
      <div className="xlb-profile-section-heading">
        <div>
          <p>账户服务</p>
          <h2 id="customer-profile-actions-title">继续管理</h2>
        </div>
      </div>
      <ul>
        {ACCOUNT_DESTINATIONS.map((item) => (
          <li key={item.key}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </div>
            <CustomerButton
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() => actions.onNavigate(
                item.key as CustomerAccountDestination,
              )}
            >
              进入
            </CustomerButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProfileLogout({
  viewModel,
  actions,
}: CustomerProfileComponentProps) {
  const busy = viewModel.status === "logging-out";
  return (
    <section
      className="xlb-profile-logout"
      data-profile-component="logout"
      aria-labelledby="customer-profile-logout-title"
    >
      <div>
        <h2 id="customer-profile-logout-title">退出当前账户</h2>
        <p>退出会清理当前顾客作用域缓存，同时保留安全的服务城市偏好。</p>
      </div>
      <CustomerButton
        type="button"
        variant="quiet"
        busy={busy}
        disabled={viewModel.status === "saving"}
        onClick={actions.onLogout}
      >
        {busy ? "正在退出" : "退出登录"}
      </CustomerButton>
    </section>
  );
}

export function ProfileCitySwitchConfirmation({
  viewModel,
  actions,
}: CustomerProfileComponentProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const targetCity = viewModel.citySwitchConfirmation;

  useEffect(() => {
    if (targetCity === null) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        actionsRef.current.onDeclineCitySwitch();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = [
        ...(dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? []),
      ];
      if (buttons.length === 0) {
        event.preventDefault();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus);
    return () => {
      window.removeEventListener("keydown", containFocus);
      previouslyFocused?.focus();
    };
  }, [targetCity]);

  if (targetCity === null) return null;
  return (
    <div
      className="xlb-profile-dialog-backdrop"
      data-profile-component="city-switch-confirmation"
    >
      <section
        ref={dialogRef}
        className="xlb-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-profile-city-switch-title"
        aria-describedby="customer-profile-city-switch-description"
      >
        <p className="xlb-profile-dialog__eyebrow">资料已保存</p>
        <h2 id="customer-profile-city-switch-title">
          是否切换当前服务城市？
        </h2>
        <p id="customer-profile-city-switch-description">
          账户默认城市已由服务端保存为{cityLabel(targetCity)}，当前服务城市仍是
          {cityLabel(viewModel.currentCityCode)}。
        </p>
        <p>拒绝切换会保留当前服务城市，不会静默改写城市作用域。</p>
        <div className="xlb-profile-dialog__actions">
          <CustomerButton
            type="button"
            variant="secondary"
            onClick={actions.onDeclineCitySwitch}
          >
            暂不切换
          </CustomerButton>
          <CustomerButton
            type="button"
            onClick={actions.onConfirmCitySwitch}
          >
            切换到{cityLabel(targetCity)}
          </CustomerButton>
        </div>
      </section>
    </div>
  );
}
