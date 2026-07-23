import {
  BrandLogo,
  CustomerButton,
} from "@xlb/customer-components";
import type { ChangeEvent, FormEvent } from "react";
import {
  useEffect,
  useRef,
} from "react";
import {
  addressDraftCanSubmit,
} from "./AddressBookActionController.js";
import type {
  CustomerAddressBookTemplateReadyData,
  CustomerAddressFormDraft,
} from "./addressBookTypes.js";

export type CustomerAddressComponentProps = CustomerAddressBookTemplateReadyData;

export function AddressBoundaryHeader() {
  return (
    <header className="xlb-address-header" data-address-component="header">
      <BrandLogo variant="compact" />
      <div className="xlb-address-header__copy">
        <p>账户与服务信息</p>
        <h1>地址簿</h1>
      </div>
    </header>
  );
}

export function AddressHeader({
  viewModel,
  actions,
}: CustomerAddressComponentProps) {
  const isList = viewModel.view === "list";
  const title = viewModel.view === "new" ? "新增地址" : viewModel.view === "edit"
    ? "编辑地址"
    : "地址簿";
  return (
    <header className="xlb-address-header" data-address-component="header">
      <button
        type="button"
        className="xlb-address-header__back"
        onClick={isList ? actions.onBack : actions.onOpenList}
        aria-label={isList ? "返回个人中心" : "返回地址簿"}
      >
        返回
      </button>
      <div className="xlb-address-header__copy">
        <BrandLogo variant="compact" />
        <h1>{title}</h1>
      </div>
      {isList ? (
        <CustomerButton
          className="xlb-address-header__add"
          onClick={actions.onOpenNew}
        >
          新增
        </CustomerButton>
      ) : <span className="xlb-address-header__spacer" aria-hidden="true" />}
    </header>
  );
}

export function AddressCityScope({
  viewModel,
}: CustomerAddressComponentProps) {
  return (
    <aside className="xlb-address-scope" data-address-component="city-scope">
      <strong>当前服务城市范围</strong>
      <span>{viewModel.cityCode}</span>
      <p>地址归属由登录身份与当前服务城市在服务端确认；本页不会更改所属顾客或城市范围。</p>
    </aside>
  );
}

export function AddressFeedback({
  viewModel,
  actions,
}: CustomerAddressComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-address-feedback"
      data-kind={viewModel.notice.kind}
      data-address-component="feedback"
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
    >
      <span>{viewModel.notice.message}</span>
      <button type="button" onClick={actions.onDismissNotice}>关闭</button>
    </div>
  );
}

export function AddressList({
  viewModel,
  actions,
}: CustomerAddressComponentProps) {
  if (viewModel.addresses.length === 0) {
    return (
      <section
        className="xlb-address-list xlb-address-list--empty"
        data-address-component="address-list"
        role="status"
      >
        <h2>当前城市已没有地址</h2>
        <p>可以新增一个服务地址，后续在下单时选择。</p>
        <CustomerButton onClick={actions.onOpenNew}>新增地址</CustomerButton>
      </section>
    );
  }
  return (
    <section
      className="xlb-address-list"
      data-address-component="address-list"
      aria-label="当前城市地址"
    >
      <div className="xlb-address-list__heading">
        <div>
          <h2>服务地址</h2>
          <p>共 {viewModel.addresses.length} 个地址</p>
        </div>
        {viewModel.pickerMode ? <span>请选择同城地址</span> : null}
      </div>
      <ul>
        {viewModel.addresses.map((address) => {
          const selectable = address.cityCode === viewModel.cityCode;
          return (
            <li
              key={address.addressId}
              data-default={address.isDefault || undefined}
              data-city-mismatch={!selectable || undefined}
            >
              <div className="xlb-address-card__summary">
                <div className="xlb-address-card__identity">
                  <strong>{address.contactName}</strong>
                  <span>{address.contactPhoneMasked}</span>
                  {address.isDefault ? <em>默认</em> : null}
                </div>
                <address>
                  {address.province}{address.city}{address.district}
                  <span>{address.detailAddress}</span>
                </address>
                {!selectable ? (
                  <p className="xlb-address-card__mismatch" role="status">
                    该地址不属于当前服务城市，不能选择。
                  </p>
                ) : null}
              </div>
              <div className="xlb-address-card__actions">
                {viewModel.pickerMode ? (
                  <CustomerButton
                    onClick={() => actions.onSelect(address.addressId)}
                    disabled={!selectable || viewModel.submitting}
                  >
                    选择
                  </CustomerButton>
                ) : null}
                <CustomerButton
                  variant="secondary"
                  onClick={() => actions.onOpenEdit(address.addressId)}
                  disabled={viewModel.submitting}
                >
                  编辑
                </CustomerButton>
                <CustomerButton
                  variant="quiet"
                  onClick={() => actions.onRequestDelete(address.addressId)}
                  disabled={viewModel.submitting}
                >
                  删除
                </CustomerButton>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface AddressFieldProps {
  readonly field: keyof CustomerAddressFormDraft;
  readonly label: string;
  readonly value: string;
  readonly error?: string;
  readonly autoComplete: string;
  readonly inputMode?: "text" | "tel";
  readonly maxLength: number;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function AddressField({
  field,
  label,
  value,
  error,
  autoComplete,
  inputMode = "text",
  maxLength,
  onChange,
}: AddressFieldProps) {
  const errorId = `customer-address-${field}-error`;
  return (
    <label className="xlb-address-field">
      <span>{label}</span>
      <input
        name={field}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <small id={errorId} role="alert">{error}</small> : null}
    </label>
  );
}

export function AddressForm({
  viewModel,
  actions,
}: CustomerAddressComponentProps) {
  const editing = viewModel.editingAddress !== null;

  function changeText(event: ChangeEvent<HTMLInputElement>) {
    actions.onDraftChange(
      event.currentTarget.name as keyof CustomerAddressFormDraft,
      event.currentTarget.value,
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.onSubmit();
  }

  return (
    <form
      className="xlb-address-form"
      data-address-component="address-form"
      onSubmit={submit}
      noValidate
    >
      <div className="xlb-address-form__intro">
        <h2>{editing ? "更新联系与地址信息" : "填写联系与地址信息"}</h2>
        <p>所有字段会交由正式地址 API 校验并保存。</p>
      </div>
      <AddressField
        field="contactName"
        label="联系人"
        value={viewModel.draft.contactName}
        error={viewModel.errors.contactName}
        autoComplete="name"
        maxLength={64}
        onChange={changeText}
      />
      <AddressField
        field="contactPhone"
        label="手机号码"
        value={viewModel.draft.contactPhone}
        error={viewModel.errors.contactPhone}
        autoComplete="tel"
        inputMode="tel"
        maxLength={11}
        onChange={changeText}
      />
      {editing ? (
        <p className="xlb-address-form__phone-note">
          当前号码：{viewModel.editingAddress?.contactPhoneMasked}。为保护隐私，保存编辑时需重新输入完整手机号码。
        </p>
      ) : null}
      <div className="xlb-address-form__region">
        <AddressField
          field="province"
          label="省份 / 直辖市"
          value={viewModel.draft.province}
          error={viewModel.errors.province}
          autoComplete="address-level1"
          maxLength={64}
          onChange={changeText}
        />
        <AddressField
          field="city"
          label="城市"
          value={viewModel.draft.city}
          error={viewModel.errors.city}
          autoComplete="address-level2"
          maxLength={64}
          onChange={changeText}
        />
        <AddressField
          field="district"
          label="区县"
          value={viewModel.draft.district}
          error={viewModel.errors.district}
          autoComplete="address-level3"
          maxLength={64}
          onChange={changeText}
        />
      </div>
      <label className="xlb-address-field">
        <span>详细地址</span>
        <textarea
          name="detailAddress"
          value={viewModel.draft.detailAddress}
          onChange={(event) => actions.onDraftChange(
            "detailAddress",
            event.currentTarget.value,
          )}
          autoComplete="street-address"
          maxLength={255}
          rows={4}
          aria-invalid={viewModel.errors.detailAddress ? "true" : undefined}
          aria-describedby={viewModel.errors.detailAddress
            ? "customer-address-detailAddress-error"
            : undefined}
        />
        {viewModel.errors.detailAddress ? (
          <small id="customer-address-detailAddress-error" role="alert">
            {viewModel.errors.detailAddress}
          </small>
        ) : null}
      </label>
      <label className="xlb-address-default">
        <input
          type="checkbox"
          checked={viewModel.draft.isDefault}
          onChange={(event) => actions.onDraftChange(
            "isDefault",
            event.currentTarget.checked,
          )}
        />
        <span>设为当前城市的默认服务地址</span>
      </label>
      {viewModel.errors.form ? (
        <p className="xlb-address-form__error" role="alert">
          {viewModel.errors.form}
        </p>
      ) : null}
      <div className="xlb-address-form__actions">
        <CustomerButton
          type="submit"
          busy={viewModel.submitting}
          disabled={!addressDraftCanSubmit(viewModel.draft)}
        >
          {viewModel.submitting ? "正在提交" : "保存地址"}
        </CustomerButton>
        <CustomerButton
          type="button"
          variant="secondary"
          onClick={actions.onOpenList}
          disabled={viewModel.submitting}
        >
          取消
        </CustomerButton>
      </div>
    </form>
  );
}

export function AddressDeleteConfirmation({
  viewModel,
  actions,
}: CustomerAddressComponentProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const actionsRef = useRef(actions);
  const submittingRef = useRef(viewModel.submitting);
  actionsRef.current = actions;
  submittingRef.current = viewModel.submitting;
  const deletingAddress = viewModel.addresses.find(
    (address) => address.addressId === viewModel.deletingAddressId,
  );

  useEffect(() => {
    if (deletingAddress === undefined) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) {
        actionsRef.current.onCancelDelete();
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
  }, [deletingAddress]);

  if (deletingAddress === undefined) return null;
  return (
    <div
      className="xlb-address-dialog-backdrop"
      data-address-component="delete-confirmation"
    >
      <section
        ref={dialogRef}
        className="xlb-address-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-delete-address-title"
        aria-describedby="customer-delete-address-description"
      >
        <p className="xlb-address-dialog__eyebrow">删除确认</p>
        <h2 id="customer-delete-address-title">删除这个地址？</h2>
        <p id="customer-delete-address-description">
          {deletingAddress.contactName} · {deletingAddress.detailAddress}
        </p>
        <p>删除结果以服务端回执为准，完成后会重新读取地址簿。</p>
        <div className="xlb-address-dialog__actions">
          <CustomerButton
            type="button"
            variant="secondary"
            onClick={actions.onCancelDelete}
            disabled={viewModel.submitting}
          >
            保留地址
          </CustomerButton>
          <CustomerButton
            type="button"
            onClick={actions.onConfirmDelete}
            busy={viewModel.submitting}
          >
            {viewModel.submitting ? "正在删除" : "确认删除"}
          </CustomerButton>
        </div>
      </section>
    </div>
  );
}
