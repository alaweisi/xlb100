import { useCallback, useEffect, useState } from "react";
import type { CityCode, CustomerAddress, CustomerProfile, SaveCustomerAddressRequest } from "@xlb/types";
import { Button, Card, CustomerProfileTemplate, EmptyState, ErrorState, FormField, Input, LoadingState, StatusTag } from "@xlb/ui";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { CustomerRouteShell } from "./customerPageShell";

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

const emptyAddress: SaveCustomerAddressRequest = {
  idempotencyKey: "address-initial",
  contactName: "",
  contactPhone: "",
  province: "浙江省",
  city: "杭州市",
  district: "",
  detailAddress: "",
  isDefault: false,
};

export function CustomerProfilePage({ api, cityCode }: CustomerProfilePageProps) {
  const binding = createCustomerUiBinding({ route: "profile", cityCode });
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [name, setName] = useState("");
  const [form, setForm] = useState<SaveCustomerAddressRequest>(emptyAddress);
  const [addressIdempotencyKey, setAddressIdempotencyKey] = useState(() => `address-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [profileResult, addressResult] = await Promise.all([api.getProfile(), api.listAddresses()]);
      setProfile(profileResult.profile);
      setName(profileResult.profile.name);
      setAddresses(addressResult.addresses);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "个人资料暂时无法加载");
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const saveProfile = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.updateProfile({ name: name.trim(), defaultCityCode: cityCode });
      setProfile(result.profile);
      setNotice("个人资料已保存。" );
    } catch (caught) { setError(caught instanceof Error ? caught.message : "暂时无法保存个人资料"); }
    finally { setBusy(false); }
  };

  const saveAddress = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const payload={...form,idempotencyKey:addressIdempotencyKey};
      if (editingId) await api.updateAddress(editingId, payload);
      else await api.createAddress(payload);
      setForm(emptyAddress); setEditingId(null); setAddressIdempotencyKey(`address-${Date.now()}-${Math.random().toString(36).slice(2)}`); setNotice(editingId ? "服务地址已更新。" : "服务地址已添加。" );
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "服务地址暂时无法保存"); }
    finally { setBusy(false); }
  };

  const editAddress = (address: CustomerAddress) => {
    setEditingId(address.addressId);
    setForm({
      idempotencyKey: `address-edit-${address.addressId}`,
      contactName: address.contactName,
      contactPhone: "",
      province: address.province,
      city: address.city,
      district: address.district,
      detailAddress: address.detailAddress,
      isDefault: address.isDefault,
    });
  };

  const removeAddress = async (addressId: string) => {
    if (!window.confirm("确定删除这个服务地址吗？删除后无法撤销。")) return;
    setBusy(true); setError(null); setNotice(null);
    try { await api.deleteAddress(addressId); setNotice("服务地址已删除。" ); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "暂时无法删除服务地址"); }
    finally { setBusy(false); }
  };

  const addressReady = form.contactName.trim() && /^\d{11}$/.test(form.contactPhone) &&
    form.district.trim() && form.detailAddress.trim().length >= 2;

  return (
    <CustomerRouteShell currentRoute="profile">
      <CustomerProfileTemplate route="/customer/profile" cityCode={cityCode} binding={binding}>
      {busy && !profile ? <LoadingState title="资料加载中" description="正在读取你的账号和服务地址" /> : null}
      {error && <ErrorState title="操作没有完成" description="暂时无法读取或保存资料，请检查网络后重试。" action={<Button onClick={() => void load()}>重新加载</Button>} />}
      <Card title="账号资料" actions={<StatusTag tone="success">实时同步</StatusTag>}>
        <div style={{ display: "grid", gap: 10 }}>
          <a href="/customer/notifications" className="notification-entry-link">消息中心</a>
          <a href="/customer/coupons" className="notification-entry-link">我的优惠券</a>
          <div style={{ color: "#64748b", fontSize: 13 }}>{profile?.phoneMasked ?? "账号读取中"}</div>
          <FormField label="称呼"><Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></FormField>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void saveProfile()}>{busy ? "保存中…" : "保存资料"}</Button>
        </div>
      </Card>

      <Card title="服务地址" actions={<StatusTag tone="primary">{addresses.length}</StatusTag>}>
        <div style={{ display: "grid", gap: 10 }}>
          {addresses.length === 0 ? <EmptyState title="还没有服务地址" description="添加地址后，下次预约会更快。" /> : addresses.map((address) => (
            <div key={address.addressId} style={{ border: "1px solid #dbe3ea", borderRadius: 8, display: "grid", gap: 6, padding: 12 }}>
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                <strong>{address.contactName} · {address.contactPhoneMasked}</strong>
                {address.isDefault && <StatusTag tone="success">默认地址</StatusTag>}
              </div>
              <span style={{ color: "#475569", fontSize: 13 }}>{address.province} {address.city} {address.district} {address.detailAddress}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={() => editAddress(address)}>编辑</Button>
                <Button variant="danger" disabled={busy} onClick={() => void removeAddress(address.addressId)}>删除</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={editingId ? "编辑服务地址" : "添加服务地址"}>
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="联系人"><Input autoComplete="name" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></FormField>
          <FormField label="手机号"><Input autoComplete="tel" inputMode="numeric" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} placeholder="请输入 11 位手机号" /></FormField>
          <FormField label="省份"><Input value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></FormField>
          <FormField label="城市"><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></FormField>
          <FormField label="区县"><Input value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} /></FormField>
          <FormField label="详细地址"><Input autoComplete="street-address" value={form.detailAddress} onChange={(event) => setForm({ ...form, detailAddress: event.target.value })} /></FormField>
          <label style={{ alignItems: "center", display: "flex", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={Boolean(form.isDefault)} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} /> 设为默认地址
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" disabled={busy || !addressReady} onClick={() => void saveAddress()}>{busy ? "保存中…" : editingId ? "更新地址" : "添加地址"}</Button>
            {editingId && <Button onClick={() => { setEditingId(null); setForm(emptyAddress); }}>取消</Button>}
          </div>
        </div>
      </Card>
      {notice && <div role="status" style={{ color: "#047857", fontSize: 13 }}>{notice}</div>}
      </CustomerProfileTemplate>
    </CustomerRouteShell>
  );
}
