import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  Bell,
  CheckCircle,
  HouseLine,
  MapPin,
  PencilSimple,
  Plus,
  ShieldCheck,
  Ticket,
  Trash,
  UserCircle,
} from "@phosphor-icons/react";
import type { CityCode, CustomerAddress, CustomerProfile, SaveCustomerAddressRequest } from "@xlb/types";
import {
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusTag,
} from "@xlb/ui";
import { getOrderAddressOption } from "../adapters/orderAddressOptions";
import { buildCustomerDeepLink } from "../routes/customerDeepLinks";
import { describeCustomerAppError, type CustomerAppFailure } from "./customerPageShell";
import "./customer-profile.css";

type ProfileApi = {
  getProfile(): Promise<{ ok: true; profile: CustomerProfile }>;
  updateProfile(body: { name: string; defaultCityCode: CityCode }): Promise<{ ok: true; profile: CustomerProfile }>;
  listAddresses(): Promise<{ ok: true; addresses: CustomerAddress[] }>;
  createAddress(body: SaveCustomerAddressRequest): Promise<{ ok: true; address: CustomerAddress }>;
  updateAddress(addressId: string, body: SaveCustomerAddressRequest): Promise<{ ok: true; address: CustomerAddress }>;
  deleteAddress(addressId: string): Promise<{ ok: true; addressId: string; deleted: true }>;
};

export interface CustomerProfilePageProps {
  api: ProfileApi;
  cityCode: CityCode;
}

type BusyAction = "load" | "profile" | "address" | "delete";

type ResultMessage = {
  title: string;
  description: string;
};

function requestKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createAddressDraft(cityCode: CityCode): SaveCustomerAddressRequest {
  const city = getOrderAddressOption(cityCode);
  return {
    idempotencyKey: requestKey("address"),
    contactName: "",
    contactPhone: "",
    province: city.province,
    city: city.city,
    district: city.districts[0] ?? "",
    detailAddress: "",
    isDefault: false,
  };
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "资料更新时间待确认";
  return `更新于 ${new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function sortAddresses(addresses: CustomerAddress[]): CustomerAddress[] {
  return [...addresses].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function CustomerProfilePage({ api, cityCode }: CustomerProfilePageProps) {
  const cityOption = useMemo(() => getOrderAddressOption(cityCode), [cityCode]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [name, setName] = useState("");
  const [form, setForm] = useState<SaveCustomerAddressRequest>(() => createAddressDraft(cityCode));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerAddress | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>("load");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [failure, setFailure] = useState<CustomerAppFailure | null>(null);
  const [result, setResult] = useState<ResultMessage | null>(null);
  const [profileAttempted, setProfileAttempted] = useState(false);
  const [addressAttempted, setAddressAttempted] = useState(false);

  const load = useCallback(async () => {
    setBusy("load");
    setFailure(null);
    try {
      const [profileResult, addressResult] = await Promise.all([api.getProfile(), api.listAddresses()]);
      setProfile(profileResult.profile);
      setName(profileResult.profile.name);
      setAddresses(sortAddresses(addressResult.addresses));
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setHasLoaded(true);
      setBusy(null);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const trimmedName = name.trim();
  const profileNameError = profileAttempted
    ? !trimmedName
      ? "请输入称呼。"
      : trimmedName.length > 64
        ? "称呼不能超过 64 个字符。"
        : null
    : null;
  const profileDirty = profile ? trimmedName !== profile.name : false;

  const addressErrors = useMemo(() => ({
    contactName: !form.contactName.trim() ? "请输入联系人姓名。" : form.contactName.trim().length > 64 ? "联系人不能超过 64 个字符。" : null,
    contactPhone: /^\d{11}$/.test(form.contactPhone) ? null : "请输入 11 位手机号。",
    district: form.district.trim() ? null : "请选择服务区域。",
    detailAddress: form.detailAddress.trim().length >= 2
      ? form.detailAddress.trim().length <= 255
        ? null
        : "详细地址不能超过 255 个字符。"
      : "请填写至少 2 个字符的详细地址。",
  }), [form]);
  const addressReady = Object.values(addressErrors).every((error) => error === null);

  const saveProfile = async () => {
    setProfileAttempted(true);
    if (!trimmedName || trimmedName.length > 64 || !profileDirty) return;
    setBusy("profile");
    setFailure(null);
    setResult(null);
    try {
      const response = await api.updateProfile({ name: trimmedName, defaultCityCode: cityCode });
      setProfile(response.profile);
      setName(response.profile.name);
      setProfileAttempted(false);
      setResult({
        title: "个人资料已保存",
        description: "新的称呼已由服务端确认，并会用于后续服务联系。",
      });
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setBusy(null);
    }
  };

  const openNewAddress = () => {
    setEditingId(null);
    setForm(createAddressDraft(cityCode));
    setAddressAttempted(false);
    setFailure(null);
    setAddressSheetOpen(true);
  };

  const openAddressEditor = (address: CustomerAddress) => {
    setEditingId(address.addressId);
    setForm({
      idempotencyKey: requestKey(`address-edit-${address.addressId}`),
      contactName: address.contactName,
      contactPhone: "",
      province: address.province,
      city: address.city,
      district: address.district,
      detailAddress: address.detailAddress,
      isDefault: address.isDefault,
    });
    setAddressAttempted(false);
    setFailure(null);
    setAddressSheetOpen(true);
  };

  const closeAddressEditor = () => {
    if (busy === "address") return;
    setAddressSheetOpen(false);
    setEditingId(null);
    setAddressAttempted(false);
  };

  const saveAddress = async () => {
    setAddressAttempted(true);
    if (!addressReady) return;
    setBusy("address");
    setFailure(null);
    setResult(null);
    try {
      const payload = {
        ...form,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        district: form.district.trim(),
        detailAddress: form.detailAddress.trim(),
      };
      const response = editingId
        ? await api.updateAddress(editingId, payload)
        : await api.createAddress(payload);
      setAddresses((current) => sortAddresses([
        response.address,
        ...current
          .filter((address) => address.addressId !== response.address.addressId)
          .map((address) => response.address.isDefault ? { ...address, isDefault: false } : address),
      ]));
      setAddressSheetOpen(false);
      setAddressAttempted(false);
      setEditingId(null);
      setForm(createAddressDraft(cityCode));
      setResult({
        title: editingId ? "服务地址已更新" : "服务地址已添加",
        description: response.address.isDefault
          ? "服务端已确认该地址为当前城市的默认上门地址。"
          : "服务端已保存地址，可在下次报修时继续使用。",
      });
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setBusy(null);
    }
  };

  const removeAddress = async () => {
    if (!deleteTarget) return;
    setBusy("delete");
    setFailure(null);
    setResult(null);
    try {
      const response = await api.deleteAddress(deleteTarget.addressId);
      setAddresses((current) => current.filter((address) => address.addressId !== response.addressId));
      setResult({
        title: "服务地址已删除",
        description: "服务端已确认删除；已经创建的订单不会因此改变。",
      });
      setDeleteTarget(null);
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setBusy(null);
    }
  };

  const initialLoading = !hasLoaded && busy === "load";
  const initialFailure = hasLoaded && !profile && failure;

  return (
    <main className="customer-profile" data-page-state={initialLoading ? "loading" : initialFailure ? "error" : "ready"}>
      <section className="customer-profile__hero" aria-labelledby="customer-profile-title">
        <div className="customer-profile__avatar" aria-hidden="true">
          <UserCircle weight="duotone" />
        </div>
        <div className="customer-profile__hero-copy">
          <span className="customer-profile__eyebrow"><ShieldCheck weight="fill" /> 喜乐帮顾客账户</span>
          <h1 id="customer-profile-title">我的</h1>
          <p>{profile ? `${profile.name || "顾客"}，安心服务从清晰资料开始。` : "管理个人资料与上门服务地址。"}</p>
          {profile ? (
            <div className="customer-profile__identity">
              <strong>{profile.phoneMasked}</strong>
              <span>{formatUpdatedAt(profile.updatedAt)}</span>
            </div>
          ) : null}
        </div>
      </section>

      <nav className="customer-profile__quick-links" aria-label="我的快捷入口">
        <a href={buildCustomerDeepLink("notifications", { cityCode })}>
          <span><Bell weight="duotone" /></span>
          <strong>消息中心</strong>
          <small>查看服务进展</small>
        </a>
        <a href={buildCustomerDeepLink("coupons", { cityCode })}>
          <span><Ticket weight="duotone" /></span>
          <strong>我的优惠券</strong>
          <small>使用资格以报价为准</small>
        </a>
      </nav>

      {initialLoading ? (
        <LoadingState
          className="customer-profile__state"
          description="正在读取个人资料和当前城市的服务地址。"
          productRole="customer"
          title="正在准备我的账户"
        />
      ) : initialFailure ? (
        <ErrorState
          className="customer-profile__state"
          action={<Button onClick={() => void load()} productRole="customer"><ArrowClockwise />重新加载</Button>}
          description={initialFailure.description}
          productRole="customer"
          title={initialFailure.title}
        />
      ) : profile ? (
        <>
          {result ? (
            <div className="customer-profile__result" role="status">
              <CheckCircle weight="fill" />
              <div><strong>{result.title}</strong><span>{result.description}</span></div>
            </div>
          ) : null}
          {failure && !addressSheetOpen && !deleteTarget ? (
            <ErrorState
              className="customer-profile__state"
              action={<Button onClick={() => setFailure(null)} productRole="customer" variant="ghost">知道了</Button>}
              description={failure.description}
              productRole="customer"
              title={failure.title}
            />
          ) : null}

          <section className="customer-profile__surface" aria-labelledby="profile-details-title">
            <div className="customer-profile__section-heading">
              <span className="customer-profile__section-icon"><UserCircle weight="duotone" /></span>
              <div><h2 id="profile-details-title">个人资料</h2><p>师傅和客服会使用这里的称呼与你联系。</p></div>
            </div>
            <div className="customer-profile__profile-form">
              <FormField label="称呼" error={profileNameError ?? undefined} description="1–64 个字符">
                <Input
                  autoComplete="name"
                  disabled={busy !== null}
                  maxLength={64}
                  onChange={(event) => setName(event.target.value)}
                  productRole="customer"
                  value={name}
                />
              </FormField>
              <div className="customer-profile__readonly-field">
                <span>当前服务城市</span>
                <strong>{cityOption.city}</strong>
                <small>地址仅展示当前城市范围内的数据</small>
              </div>
              <Button
                disabled={busy !== null || !profileDirty || !trimmedName || trimmedName.length > 64}
                onClick={() => void saveProfile()}
                productRole="customer"
                variant="primary"
              >
                {busy === "profile" ? "正在保存…" : "保存个人资料"}
              </Button>
            </div>
          </section>

          <section className="customer-profile__surface" aria-labelledby="address-list-title">
            <div className="customer-profile__section-heading customer-profile__section-heading--actions">
              <span className="customer-profile__section-icon"><HouseLine weight="duotone" /></span>
              <div><h2 id="address-list-title">服务地址</h2><p>共 {addresses.length} 个当前城市地址，默认地址优先用于报修。</p></div>
              <Button onClick={openNewAddress} productRole="customer" variant="primary"><Plus />新增地址</Button>
            </div>

            {addresses.length === 0 ? (
              <EmptyState
                action={<Button onClick={openNewAddress} productRole="customer"><Plus />添加第一个地址</Button>}
                description="保存常用地址后，下次报修可以少填一些信息。"
                productRole="customer"
                title="还没有服务地址"
              />
            ) : (
              <div className="customer-profile__address-list">
                {addresses.map((address) => (
                  <article className="customer-profile__address-card" key={address.addressId}>
                    <div className="customer-profile__address-marker" aria-hidden="true"><MapPin weight="fill" /></div>
                    <div className="customer-profile__address-copy">
                      <div className="customer-profile__address-title">
                        <strong>{address.contactName} · {address.contactPhoneMasked}</strong>
                        {address.isDefault ? <StatusTag tone="success">默认地址</StatusTag> : null}
                      </div>
                      <p>{address.province} {address.city} {address.district} {address.detailAddress}</p>
                    </div>
                    <div className="customer-profile__address-actions">
                      <Button aria-label={`编辑 ${address.contactName} 的地址`} onClick={() => openAddressEditor(address)} productRole="customer" variant="ghost"><PencilSimple />编辑</Button>
                      <Button aria-label={`删除 ${address.contactName} 的地址`} disabled={busy !== null} onClick={() => setDeleteTarget(address)} productRole="customer" variant="ghost"><Trash />删除</Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <BottomSheet
        closeLabel="取消"
        footer={(
          <Button
            disabled={busy === "address" || !addressReady}
            onClick={() => void saveAddress()}
            productRole="customer"
            variant="primary"
          >
            {busy === "address" ? "正在保存…" : editingId ? "保存地址" : "添加地址"}
          </Button>
        )}
        onClose={closeAddressEditor}
        open={addressSheetOpen}
        productRole="customer"
        title={editingId ? "编辑服务地址" : "新增服务地址"}
      >
        <div className="customer-profile__address-form">
          <p className="customer-profile__form-note"><ShieldCheck weight="fill" />地址仅用于当前城市的上门服务，手机号会按平台规则保护展示。</p>
          {failure ? (
            <ErrorState
              action={<Button onClick={() => setFailure(null)} productRole="customer" variant="ghost">继续修改</Button>}
              description={failure.description}
              productRole="customer"
              title={failure.title}
            />
          ) : null}
          <div className="customer-profile__form-grid">
            <FormField label="联系人" error={addressAttempted ? addressErrors.contactName ?? undefined : undefined}>
              <Input autoComplete="name" maxLength={64} onChange={(event) => setForm({ ...form, contactName: event.target.value })} productRole="customer" value={form.contactName} />
            </FormField>
            <FormField label="手机号" error={addressAttempted ? addressErrors.contactPhone ?? undefined : undefined} description={editingId ? "为保护隐私，编辑地址时需重新输入手机号。" : undefined}>
              <Input autoComplete="tel" inputMode="tel" maxLength={11} onChange={(event) => setForm({ ...form, contactPhone: event.target.value.replace(/\D/g, "") })} placeholder="11 位手机号" productRole="customer" value={form.contactPhone} />
            </FormField>
            <div className="customer-profile__city-fields">
              <div><span>省/直辖市</span><strong>{form.province}</strong></div>
              <div><span>城市</span><strong>{form.city}</strong></div>
            </div>
            <FormField label="服务区域" error={addressAttempted ? addressErrors.district ?? undefined : undefined}>
              <Select onChange={(event) => setForm({ ...form, district: event.target.value })} productRole="customer" value={form.district}>
                {!cityOption.districts.includes(form.district) && form.district ? <option value={form.district}>{form.district}</option> : null}
                {cityOption.districts.map((district) => <option key={district} value={district}>{district}</option>)}
              </Select>
            </FormField>
            <FormField label="详细地址" error={addressAttempted ? addressErrors.detailAddress ?? undefined : undefined} description="例如道路、门牌号、小区和楼栋">
              <Input autoComplete="street-address" maxLength={255} onChange={(event) => setForm({ ...form, detailAddress: event.target.value })} placeholder="文三路 1 号 2 幢 301" productRole="customer" value={form.detailAddress} />
            </FormField>
            <label className="customer-profile__default-option">
              <input checked={Boolean(form.isDefault)} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} type="checkbox" />
              <span><strong>设为默认地址</strong><small>下次报修时优先选择</small></span>
            </label>
          </div>
        </div>
      </BottomSheet>

      <Modal
        footer={(
          <>
            <Button disabled={busy === "delete"} onClick={() => setDeleteTarget(null)} productRole="customer">保留地址</Button>
            <Button disabled={busy === "delete"} onClick={() => void removeAddress()} productRole="customer" variant="danger">{busy === "delete" ? "正在删除…" : "确认删除"}</Button>
          </>
        )}
        onClose={() => busy !== "delete" && setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        productRole="customer"
        title="删除这个服务地址？"
      >
        <p className="customer-profile__delete-copy">删除后不能在新报修中选择该地址，但不会影响已经创建的订单。</p>
        {failure ? (
          <ErrorState
            action={<Button onClick={() => setFailure(null)} productRole="customer" variant="ghost">重试删除</Button>}
            description={failure.description}
            productRole="customer"
            title={failure.title}
          />
        ) : null}
      </Modal>
    </main>
  );
}
