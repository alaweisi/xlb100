// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CustomerAddress, CustomerProfile } from "@xlb/types";
import { CustomerProfilePage } from "../../apps/customer/src/pages/CustomerProfilePage";

const profile: CustomerProfile = {
  customerId: "customer-a",
  phoneMasked: "138****0001",
  name: "林女士",
  avatarUrl: null,
  defaultCityCode: "hangzhou",
  updatedAt: "2026-07-10T08:00:00.000Z",
};

const address: CustomerAddress = {
  addressId: "addr-1",
  customerId: "customer-a",
  cityCode: "hangzhou",
  contactName: "林女士",
  contactPhoneMasked: "138****0001",
  province: "浙江省",
  city: "杭州市",
  district: "西湖区",
  detailAddress: "文三路 1 号",
  isDefault: true,
  createdAt: "2026-07-10T08:00:00.000Z",
  updatedAt: "2026-07-10T08:00:00.000Z",
};

function createApi(addresses: CustomerAddress[] = []) {
  return {
    getProfile: vi.fn().mockResolvedValue({ ok: true, profile }),
    updateProfile: vi.fn().mockResolvedValue({ ok: true, profile: { ...profile, name: "林小姐" } }),
    listAddresses: vi.fn().mockResolvedValue({ ok: true, addresses }),
    createAddress: vi.fn().mockResolvedValue({ ok: true, address }),
    updateAddress: vi.fn().mockResolvedValue({
      ok: true,
      address: { ...address, detailAddress: "文三路 2 号", updatedAt: "2026-07-11T08:00:00.000Z" },
    }),
    deleteAddress: vi.fn().mockResolvedValue({ ok: true, addressId: "addr-1", deleted: true as const }),
  };
}

describe("Customer profile and address page", () => {
  afterEach(cleanup);

  it("loads the authoritative profile and presents an honest empty address state", async () => {
    const api = createApi();
    render(<CustomerProfilePage api={api} cityCode="hangzhou" />);

    expect(screen.getByText("正在准备我的账户")).toBeTruthy();
    expect(await screen.findByText("138****0001")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "个人资料" })).toBeTruthy();
    expect(screen.getByText("还没有服务地址")).toBeTruthy();
    expect(api.getProfile).toHaveBeenCalledTimes(1);
    expect(api.listAddresses).toHaveBeenCalledTimes(1);
  });

  it("persists a changed customer name and only confirms after the server responds", async () => {
    const api = createApi();
    render(<CustomerProfilePage api={api} cityCode="hangzhou" />);
    await screen.findByText("138****0001");

    const nameInput = screen.getByLabelText(/^称呼/) as HTMLInputElement;
    const saveButton = screen.getByRole("button", { name: "保存个人资料" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(nameInput, { target: { value: "林小姐" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({
      name: "林小姐",
      defaultCityCode: "hangzhou",
    }));
    expect(await screen.findByText("个人资料已保存")).toBeTruthy();
    expect(nameInput.value).toBe("林小姐");
  });

  it("validates locally and creates an address only after the form is complete", async () => {
    const api = createApi();
    render(<CustomerProfilePage api={api} cityCode="hangzhou" />);
    await screen.findByText("138****0001");

    fireEvent.click(screen.getByRole("button", { name: "新增地址" }));
    const dialog = screen.getByRole("dialog", { name: "新增服务地址" });
    const saveButton = within(dialog).getByRole("button", { name: "添加地址" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText(/^联系人/), { target: { value: "林女士" } });
    fireEvent.change(within(dialog).getByLabelText(/^手机号/), { target: { value: "13800000001" } });
    fireEvent.change(within(dialog).getByLabelText(/^详细地址/), { target: { value: "文三路 1 号" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.createAddress).toHaveBeenCalledWith(expect.objectContaining({
      contactName: "林女士",
      contactPhone: "13800000001",
      province: "浙江省",
      city: "杭州市",
      district: "西湖区",
      detailAddress: "文三路 1 号",
    })));
    expect(await screen.findByText("服务地址已添加")).toBeTruthy();
    expect(screen.getByText("默认地址")).toBeTruthy();
  });

  it("requires the protected phone field again and persists an address edit", async () => {
    const api = createApi([address]);
    render(<CustomerProfilePage api={api} cityCode="hangzhou" />);
    await screen.findByText(/文三路 1 号/);

    fireEvent.click(screen.getByRole("button", { name: "编辑 林女士 的地址" }));
    const dialog = screen.getByRole("dialog", { name: "编辑服务地址" });
    expect((within(dialog).getByLabelText(/^手机号/) as HTMLInputElement).value).toBe("");
    expect(within(dialog).getByText("为保护隐私，编辑地址时需重新输入手机号。")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/^手机号/), { target: { value: "13800000001" } });
    fireEvent.change(within(dialog).getByLabelText(/^详细地址/), { target: { value: "文三路 2 号" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存地址" }));

    await waitFor(() => expect(api.updateAddress).toHaveBeenCalledWith("addr-1", expect.objectContaining({
      contactPhone: "13800000001",
      detailAddress: "文三路 2 号",
    })));
    expect(await screen.findByText("服务地址已更新")).toBeTruthy();
    expect(screen.getByText(/浙江省 杭州市 西湖区 文三路 2 号/)).toBeTruthy();
  });

  it("requires explicit confirmation before deleting an address", async () => {
    const api = createApi([address]);
    render(<CustomerProfilePage api={api} cityCode="hangzhou" />);
    await screen.findByText(/文三路 1 号/);

    fireEvent.click(screen.getByRole("button", { name: "删除 林女士 的地址" }));
    const dialog = screen.getByRole("dialog", { name: "删除这个服务地址？" });
    expect(api.deleteAddress).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.deleteAddress).toHaveBeenCalledWith("addr-1"));
    expect(await screen.findByText("服务地址已删除")).toBeTruthy();
    expect(screen.queryByText(/文三路 1 号/)).toBeNull();
  });

  it("shows a recoverable load error and retries without inventing profile data", async () => {
    const api = createApi();
    api.getProfile.mockRejectedValueOnce(new Error("network unavailable"));
    render(<CustomerProfilePage api={api} cityCode="hangzhou" />);

    expect(await screen.findByText("暂时无法完成请求")).toBeTruthy();
    expect(screen.queryByText("138****0001")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("138****0001")).toBeTruthy();
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });
});
