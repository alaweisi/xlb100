import { useCallback, useEffect, useMemo, useState } from "react";
import type { CityCode, CustomerAddress, CustomerProfile, SaveCustomerAddressRequest } from "@xlb/types";
import { Button, Card, CustomerProfileTemplate, EmptyState, FormField, Input, LoadingState, StatusTag } from "@xlb/ui";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { toCustomerError } from "../adapters/customerError";
import { getOrderAddressOption } from "../adapters/orderAddressOptions";
import "./customer-orders.css";
import "./customer-coupons.css";

type ProfileApi = {
  getProfile(): Promise<{ ok: true; profile: CustomerProfile }>;
  updateProfile(body: { name: string; defaultCityCode: CityCode }): Promise<{ ok: true; profile: CustomerProfile }>;
  listAddresses(): Promise<{ ok: true; addresses: CustomerAddress[] }>;
  createAddress(body: SaveCustomerAddressRequest): Promise<{ ok: true; address: CustomerAddress }>;
  updateAddress(addressId: string, body: SaveCustomerAddressRequest): Promise<{ ok: true; address: CustomerAddress }>;
  deleteAddress(addressId: string): Promise<{ ok: true; addressId: string; deleted: true }>;
};

export interface CustomerProfilePageProps { api: ProfileApi; cityCode: CityCode; }

function commandKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function emptyAddress(cityCode: CityCode): SaveCustomerAddressRequest {
  const city = getOrderAddressOption(cityCode);
  return {
    idempotencyKey: commandKey("customer-address"),
    contactName: "",
    contactPhone: "",
    province: city.province,
    city: city.city,
    district: "",
    detailAddress: "",
    isDefault: false,
  };
}

export function CustomerProfilePage({ api, cityCode }: CustomerProfilePageProps) {
  const binding = createCustomerUiBinding({ route: "profile", cityCode });
  const initialAddress = useMemo(() => emptyAddress(cityCode), [cityCode]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [name, setName] = useState("");
  const [form, setForm] = useState<SaveCustomerAddressRequest>(initialAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "profile" | "address" | "delete" | null>("load");
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load"); setError(null);
    try {
      const [profileResult, addressResult] = await Promise.all([api.getProfile(), api.listAddresses()]);
      setProfile(profileResult.profile);
      setName(profileResult.profile.name);
      setAddresses(addressResult.addresses);
    } catch (caught) {
      const mapped = toCustomerError(caught, "个人资料加载失败");
      setError({ title: mapped.title, description: mapped.description });
    } finally { setBusy(null); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function saveProfile() {
    setBusy("profile"); setError(null); setNotice(null);
    try {
      const result = await api.updateProfile({ name: name.trim(), defaultCityCode: cityCode });
      setProfile(result.profile); setNotice("个人资料已保存");
    } catch (caught) {
      const mapped = toCustomerError(caught, "个人资料保存失败");
      setError({ title: mapped.title, description: mapped.description });
    } finally { setBusy(null); }
  }

  async function saveAddress() {
    setBusy("address"); setError(null); setNotice(null);
    try {
      if (editingId) await api.updateAddress(editingId, form);
      else await api.createAddress(form);
      setNotice(editingId ? "地址已更新" : "地址已添加");
      setEditingId(null); setForm(emptyAddress(cityCode));
      await load();
    } catch (caught) {
      const mapped = toCustomerError(caught, "地址保存失败");
      setError({ title: mapped.title, description: mapped.description });
    } finally { setBusy(null); }
  }

  function editAddress(address: CustomerAddress) {
    setEditingId(address.addressId);
    setForm({
      idempotencyKey: commandKey(`customer-address-edit-${address.addressId}`),
      contactName: address.contactName,
      contactPhone: "",
      province: address.province,
      city: address.city,
      district: address.district,
      detailAddress: address.detailAddress,
      isDefault: address.isDefault,
    });
  }

  async function removeAddress(addressId: string) {
    setBusy("delete"); setError(null); setNotice(null);
    try {
      await api.deleteAddress(addressId); setNotice("地址已删除"); await load();
    } catch (caught) {
      const mapped = toCustomerError(caught, "地址删除失败");
      setError({ title: mapped.title, description: mapped.description });
    } finally { setBusy(null); }
  }

  const addressReady = Boolean(form.contactName.trim()) && /^1[3-9]\d{9}$/.test(form.contactPhone)
    && Boolean(form.province.trim()) && Boolean(form.city.trim()) && Boolean(form.district.trim())
    && form.detailAddress.trim().length >= 2;
  const initialLoading = busy === "load";
  const savingProfile = busy === "profile";
  const savingAddress = busy === "address";

  return (
    <div className="customer-transaction-page">
      <CustomerProfileTemplate route="/customer/profile" cityCode={cityCode} binding={binding}>
        {initialLoading && !profile ? <LoadingState title="正在加载个人资料" description="读取账号与常用地址" /> : null}
        {error ? <div className="customer-review-error" role="alert"><strong>{error.title}</strong><span>{error.description}</span><Button onClick={() => void load()}>重新加载</Button></div> : null}
        {notice ? <div className="customer-order-notice" role="status">{notice}</div> : null}

        <Card title="账号资料" actions={<StatusTag tone="success">服务端数据</StatusTag>}>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="customer-order-actions"><a href="/customer/notifications" className="notification-entry-link">消息中心</a><a href="/customer/coupons" className="notification-entry-link">我的优惠券</a></div>
            <div style={{ color: "#64748b", fontSize: 13 }}>{profile?.phoneMasked ?? "手机号待加载"}</div>
            <FormField label="显示名称"><Input value={name} onChange={(event) => setName(event.target.value)} /></FormField>
            <Button variant="primary" disabled={busy !== null || !name.trim()} onClick={() => void saveProfile()}>{savingProfile ? "正在保存" : "保存个人资料"}</Button>
          </div>
        </Card>

        <Card title="常用服务地址" actions={<StatusTag tone="primary">{addresses.length} 个</StatusTag>}>
          <div style={{ display: "grid", gap: 10 }}>
            {!initialLoading && addresses.length === 0 ? <EmptyState title="还没有常用地址" description="可在下方添加第一个服务地址。" /> : addresses.map((address) => (
              <div className="customer-order-section" key={address.addressId}>
                <div className="customer-order-actions"><strong>{address.contactName} · {address.contactPhoneMasked}</strong>{address.isDefault && <StatusTag tone="success">默认地址</StatusTag>}</div>
                <span>{address.province} {address.city} {address.district} {address.detailAddress}</span>
                <div className="customer-order-actions"><Button onClick={() => editAddress(address)}>编辑</Button><Button disabled={busy !== null} onClick={() => void removeAddress(address.addressId)}>删除</Button></div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={editingId ? "编辑地址" : "添加地址"}>
          <div style={{ display: "grid", gap: 10 }}>
            {editingId ? <p className="customer-coupons__muted">服务端仅返回脱敏号码，编辑地址时请重新填写完整手机号。</p> : null}
            <FormField label="联系人"><Input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></FormField>
            <FormField label="手机号" error={form.contactPhone && !/^1[3-9]\d{9}$/.test(form.contactPhone) ? "请输入 11 位中国大陆手机号" : undefined}><Input value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} inputMode="tel" placeholder="请输入完整手机号" /></FormField>
            <FormField label="省份"><Input value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></FormField>
            <FormField label="城市"><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></FormField>
            <FormField label="区县"><Input value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} /></FormField>
            <FormField label="详细地址"><Input value={form.detailAddress} onChange={(event) => setForm({ ...form, detailAddress: event.target.value })} /></FormField>
            <label style={{ alignItems: "center", display: "flex", gap: 8, fontSize: 14 }}><input type="checkbox" checked={Boolean(form.isDefault)} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />设为默认地址</label>
            <div className="customer-order-actions"><Button variant="primary" disabled={busy !== null || !addressReady} onClick={() => void saveAddress()}>{savingAddress ? "正在保存" : editingId ? "更新地址" : "添加地址"}</Button>{editingId && <Button onClick={() => { setEditingId(null); setForm(emptyAddress(cityCode)); }}>取消编辑</Button>}</div>
          </div>
        </Card>
      </CustomerProfileTemplate>
    </div>
  );
}
