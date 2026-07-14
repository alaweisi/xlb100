import { useCallback, useEffect, useState } from "react";
import type { CityCode, CustomerAddress, CustomerProfile, SaveCustomerAddressRequest } from "@xlb/types";
import { Button, Card, CustomerProfileTemplate, EmptyState, FormField, Input, StatusTag } from "@xlb/ui";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";

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
      setError(caught instanceof Error ? caught.message : "Unable to load customer profile");
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
      setNotice("Profile saved");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save profile"); }
    finally { setBusy(false); }
  };

  const saveAddress = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const payload={...form,idempotencyKey:addressIdempotencyKey};
      if (editingId) await api.updateAddress(editingId, payload);
      else await api.createAddress(payload);
      setForm(emptyAddress); setEditingId(null); setAddressIdempotencyKey(`address-${Date.now()}-${Math.random().toString(36).slice(2)}`); setNotice(editingId ? "Address updated" : "Address added");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save address"); }
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
    setBusy(true); setError(null); setNotice(null);
    try { await api.deleteAddress(addressId); setNotice("Address deleted"); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to delete address"); }
    finally { setBusy(false); }
  };

  const addressReady = form.contactName.trim() && /^\d{11}$/.test(form.contactPhone) &&
    form.district.trim() && form.detailAddress.trim().length >= 2;

  return (
    <CustomerProfileTemplate route="/customer/profile" cityCode={cityCode} binding={binding}>
      <Card title="Account" actions={<StatusTag tone="success">Real API</StatusTag>}>
        <div style={{ display: "grid", gap: 10 }}>
          <a href="/customer/notifications" className="notification-entry-link">消息中心</a>
          <a href="/customer/coupons" className="notification-entry-link">我的优惠券</a>
          <div style={{ color: "#64748b", fontSize: 13 }}>{profile?.phoneMasked ?? "Loading account"}</div>
          <FormField label="Display name"><Input value={name} onChange={(event) => setName(event.target.value)} /></FormField>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void saveProfile()}>Save profile</Button>
        </div>
      </Card>

      <Card title="Service addresses" actions={<StatusTag tone="primary">{addresses.length}</StatusTag>}>
        <div style={{ display: "grid", gap: 10 }}>
          {addresses.length === 0 ? <EmptyState title="No saved address" description="Add the first service address below." /> : addresses.map((address) => (
            <div key={address.addressId} style={{ border: "1px solid #dbe3ea", borderRadius: 8, display: "grid", gap: 6, padding: 12 }}>
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                <strong>{address.contactName} · {address.contactPhoneMasked}</strong>
                {address.isDefault && <StatusTag tone="success">Default</StatusTag>}
              </div>
              <span style={{ color: "#475569", fontSize: 13 }}>{address.province} {address.city} {address.district} {address.detailAddress}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={() => editAddress(address)}>Edit</Button>
                <Button disabled={busy} onClick={() => void removeAddress(address.addressId)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={editingId ? "Edit address" : "Add address"}>
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="Contact"><Input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></FormField>
          <FormField label="Mobile"><Input value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} placeholder="11-digit mobile" /></FormField>
          <FormField label="Province"><Input value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></FormField>
          <FormField label="City"><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></FormField>
          <FormField label="District"><Input value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} /></FormField>
          <FormField label="Detail address"><Input value={form.detailAddress} onChange={(event) => setForm({ ...form, detailAddress: event.target.value })} /></FormField>
          <label style={{ alignItems: "center", display: "flex", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={Boolean(form.isDefault)} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} /> Default address
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" disabled={busy || !addressReady} onClick={() => void saveAddress()}>{editingId ? "Update address" : "Add address"}</Button>
            {editingId && <Button onClick={() => { setEditingId(null); setForm(emptyAddress); }}>Cancel</Button>}
          </div>
        </div>
      </Card>
      {notice && <div role="status" style={{ color: "#047857", fontSize: 13 }}>{notice}</div>}
      {error && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
    </CustomerProfileTemplate>
  );
}
