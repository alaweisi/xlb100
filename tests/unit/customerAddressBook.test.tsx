// @vitest-environment jsdom
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";
import type {
  CustomerAddress,
  CityCode,
} from "@xlb/types";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  ADDRESS_BOOK_OPEN_NEW_EVENT,
  AddressBookActionController,
  AddressBookCoordinator,
  AddressBookPage,
  CUSTOMER_ADDRESS_COMPONENTS,
  CustomerAddressBookTemplate,
  addressDraftCanSubmit,
  createCustomerAddressComponentRegistry,
  customerAddressBookRouteModule,
  customerAddressBookSlice,
  customerAddressBookTemplateRegistration,
  parseCustomerAddressBookRoute,
  type CustomerAddressNavigation,
} from "../../apps/customer/src/features/address/index.js";

function address(
  overrides: Partial<CustomerAddress> = {},
): CustomerAddress {
  return {
    addressId: "addr-hz-1",
    customerId: "customer-current",
    cityCode: "hangzhou",
    contactName: "林女士",
    contactPhoneMasked: "138****0001",
    province: "浙江省",
    city: "杭州市",
    district: "西湖区",
    detailAddress: "文三路 1 号",
    isDefault: true,
    createdAt: "2026-07-24T08:00:00.000Z",
    updatedAt: "2026-07-24T08:00:00.000Z",
    ...overrides,
  };
}

function route(
  pattern:
    | "/profile/addresses"
    | "/profile/addresses/new"
    | "/profile/addresses/:addressId/edit" = "/profile/addresses",
  params: Readonly<Record<string, string>> = {},
  query: Readonly<Record<string, string>> = {},
) {
  const pathname = pattern === "/profile/addresses/:addressId/edit"
    ? `/profile/addresses/${params.addressId ?? ""}/edit`
    : pattern;
  return { pathname, pattern, params, query };
}

function navigation(): CustomerAddressNavigation {
  return {
    back: vi.fn(),
    openList: vi.fn(),
    openNew: vi.fn(),
    openEdit: vi.fn(),
    selectAddress: vi.fn(),
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    listAddresses: vi.fn().mockResolvedValue({
      ok: true,
      addresses: [address()],
    }),
    createAddress: vi.fn().mockResolvedValue({
      ok: true,
      address: address(),
    }),
    updateAddress: vi.fn().mockResolvedValue({
      ok: true,
      address: address(),
    }),
    deleteAddress: vi.fn().mockResolvedValue({
      ok: true,
      addressId: "addr-hz-1",
      deleted: true,
    }),
    ...overrides,
  };
}

describe("Customer CSL-20 Address Book", () => {
  it("registers one fixed L1 slice across list, new and edit seams", async () => {
    const componentRegistry = createCustomerAddressComponentRegistry();
    const templateRegistry = new CustomerTemplateRegistry()
      .register(customerAddressBookTemplateRegistration)
      .seal();
    const routeRegistry = new CustomerFeatureRouteRegistry()
      .register(customerAddressBookRouteModule)
      .seal();

    expect(componentRegistry.list()).toEqual(CUSTOMER_ADDRESS_COMPONENTS);
    expect(templateRegistry.resolveForSlice(customerAddressBookSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(routeRegistry.resolve("/profile/addresses")?.slice.id).toBe("CSL-20");
    expect(routeRegistry.resolve("/profile/addresses/new")?.slice.id).toBe("CSL-20");
    expect(routeRegistry.resolve("/profile/addresses/:addressId/edit")?.slice.id)
      .toBe("CSL-20");
    await expect(routeRegistry.resolve("/profile/addresses")?.load()).resolves
      .toHaveProperty("RouteComponent", AddressBookPage);
  });

  it("accepts only the published route inputs and keeps picker mode explicit", () => {
    expect(parseCustomerAddressBookRoute(route())).toEqual({
      view: "list",
      addressId: null,
      pickerMode: false,
    });
    expect(parseCustomerAddressBookRoute(route(
      "/profile/addresses/:addressId/edit",
      { addressId: "addr-safe_1" },
      { mode: "picker" },
    ))).toEqual({
      view: "edit",
      addressId: "addr-safe_1",
      pickerMode: true,
    });
    expect(parseCustomerAddressBookRoute(route(
      "/profile/addresses/:addressId/edit",
      { addressId: "../other-customer" },
    ))).toBeNull();
  });

  it("loads only the current city response and exposes real unavailable and empty states", async () => {
    const emptyCoordinator = new AddressBookCoordinator(api({
      listAddresses: vi.fn().mockResolvedValue({ ok: true, addresses: [] }),
    }));
    await expect(emptyCoordinator.load("hangzhou")).resolves.toEqual({
      status: "empty",
      reasonCode: "no_addresses",
    });

    const crossCity = new AddressBookCoordinator(api({
      listAddresses: vi.fn().mockResolvedValue({
        ok: true,
        addresses: [address({ cityCode: "shanghai" })],
      }),
    }));
    await expect(crossCity.load("hangzhou")).resolves.toMatchObject({
      status: "unavailable",
      reasonCode: "address_city_mismatch",
    });

    const unavailable = new AddressBookCoordinator(api({
      listAddresses: vi.fn().mockRejectedValue(new ApiClientError({
        kind: "http",
        message: "not implemented",
        method: "GET",
        path: "/api/customer/addresses",
        status: 501,
      })),
    }));
    await expect(unavailable.load("hangzhou")).resolves.toEqual({
      status: "unavailable",
      capability: "customer.addresses",
      reasonCode: "addresses_api_unavailable",
    });
  });

  it("validates through the shared address schema and blocks concurrent mutations", async () => {
    let resolveSave!: () => void;
    const savePending = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const coordinator = {
      save: vi.fn(async () => {
        await savePending;
        return { status: "success" as const };
      }),
      delete: vi.fn(),
    } as unknown as AddressBookCoordinator;
    const controller = new AddressBookActionController(coordinator);
    const draft = {
      contactName: "林女士",
      contactPhone: "13800000001",
      province: "浙江省",
      city: "杭州市",
      district: "西湖区",
      detailAddress: "文三路 1 号",
      isDefault: true,
    };
    const scope = { addressIds: new Set<string>() };

    expect(addressDraftCanSubmit(draft)).toBe(true);
    await expect(controller.save(
      "hangzhou",
      { ...draft, contactName: "x".repeat(65) },
      "customer-address-validation",
      null,
      scope,
    )).resolves.toMatchObject({
      status: "validation_error",
      errors: { contactName: expect.any(String) },
    });

    const first = controller.save(
      "hangzhou",
      draft,
      "customer-address-first",
      null,
      scope,
    );
    await expect(controller.save(
      "hangzhou",
      draft,
      "customer-address-second",
      null,
      scope,
    )).resolves.toEqual({
      status: "conflict",
      reasonCode: "request_in_flight",
    });
    resolveSave();
    await expect(first).resolves.toEqual({ status: "success" });
  });

  it("renders loading, empty, error, conflict and unavailable boundaries without fake data", () => {
    const base = {
      slice: customerAddressBookSlice,
      route: route(),
    };
    const { rerender } = render(
      <CustomerAddressBookTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在读取地址簿")).toBeTruthy();

    rerender(
      <CustomerAddressBookTemplate
        {...base}
        state={{
          status: "empty",
          reasonCode: "no_addresses",
          recovery: {
            actionKey: ADDRESS_BOOK_OPEN_NEW_EVENT,
            labelKey: "新增地址",
          },
        }}
      />,
    );
    expect(screen.getByText("还没有服务地址")).toBeTruthy();

    rerender(
      <CustomerAddressBookTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "addresses_load_failed",
          retryable: true,
          recovery: { actionKey: "retry", labelKey: "重试" },
        }}
      />,
    );
    expect(screen.getByText("地址簿加载失败")).toBeTruthy();

    rerender(
      <CustomerAddressBookTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "address_changed",
          refreshRequired: true,
          recovery: { actionKey: "refresh", labelKey: "刷新" },
        }}
      />,
    );
    expect(screen.getByText("地址信息已变化")).toBeTruthy();

    rerender(
      <CustomerAddressBookTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.addresses",
          reasonCode: "addresses_api_unavailable",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会用本地或演示数据替代/)).toBeTruthy();
  });

  it("creates through the official API, refreshes, and shows success only after confirmation", async () => {
    const created = address({ isDefault: false });
    const customerApi = api({
      listAddresses: vi.fn()
        .mockResolvedValueOnce({ ok: true, addresses: [] })
        .mockResolvedValueOnce({ ok: true, addresses: [created] }),
      createAddress: vi.fn().mockResolvedValue({ ok: true, address: created }),
    });
    const nav = navigation();

    render(
      <AddressBookPage
        slice={customerAddressBookSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new AddressBookCoordinator(customerApi)}
        navigation={nav}
      />,
    );

    await screen.findByText("还没有服务地址");
    fireEvent.click(screen.getByRole("button", { name: "新增地址" }));
    await screen.findByRole("heading", { name: "填写联系与地址信息" });

    fireEvent.change(screen.getByLabelText("联系人"), {
      target: { value: "林女士" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /手机号码/u }), {
      target: { value: "13800000001" },
    });
    fireEvent.change(screen.getByLabelText("省份 / 直辖市"), {
      target: { value: "浙江省" },
    });
    fireEvent.change(screen.getByLabelText("城市"), {
      target: { value: "杭州市" },
    });
    fireEvent.change(screen.getByLabelText("区县"), {
      target: { value: "西湖区" },
    });
    fireEvent.change(screen.getByLabelText("详细地址"), {
      target: { value: "文三路 1 号" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存地址" }));

    await screen.findByText("地址已由服务端确认保存。");
    expect(customerApi.createAddress).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^customer-address-/u),
      contactName: "林女士",
      contactPhone: "13800000001",
      city: "杭州市",
    }));
    expect(customerApi.listAddresses).toHaveBeenCalledTimes(2);
    expect(nav.openList).toHaveBeenCalledWith(false);
    expect(screen.getByText("138****0001")).toBeTruthy();
  });

  it("requires a fresh full phone on edit and deletes only after an explicit confirmation", async () => {
    const updated = address({ detailAddress: "文三路 2 号" });
    const customerApi = api({
      listAddresses: vi.fn()
        .mockResolvedValueOnce({ ok: true, addresses: [address()] })
        .mockResolvedValueOnce({ ok: true, addresses: [updated] })
        .mockResolvedValueOnce({ ok: true, addresses: [] }),
      updateAddress: vi.fn().mockResolvedValue({ ok: true, address: updated }),
    });
    const nav = navigation();

    render(
      <AddressBookPage
        slice={customerAddressBookSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new AddressBookCoordinator(customerApi)}
        navigation={nav}
      />,
    );

    await screen.findByText("文三路 1 号");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByText(/保存编辑时需重新输入完整手机号码/)).toBeTruthy();
    expect((screen.getByLabelText("手机号码") as HTMLInputElement).value).toBe("");
    expect(
      (screen.getByRole("button", { name: "保存地址" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("手机号码"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存地址" }));
    expect(await screen.findByText("请输入 11 位手机号码")).toBeTruthy();
    expect(customerApi.updateAddress).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: /手机号码/u }), {
      target: { value: "13800000001" },
    });
    fireEvent.change(screen.getByLabelText("详细地址"), {
      target: { value: "文三路 2 号" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存地址" }));
    await screen.findByText("地址已由服务端确认更新。");
    expect(customerApi.updateAddress).toHaveBeenCalledWith(
      "addr-hz-1",
      expect.objectContaining({
        contactPhone: "13800000001",
        detailAddress: "文三路 2 号",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("dialog", { name: "删除这个地址？" })).toBeTruthy();
    expect(customerApi.deleteAddress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await screen.findByText("地址已由服务端确认删除。");
    expect(customerApi.deleteAddress).toHaveBeenCalledWith("addr-hz-1");
    expect(customerApi.listAddresses).toHaveBeenCalledTimes(3);
    expect(screen.getByText("当前城市已没有地址")).toBeTruthy();
  });

  it("selects only an address admitted by the current-city API boundary", async () => {
    const nav = navigation();
    const customerApi = api();
    const coordinator = new AddressBookCoordinator(customerApi);
    const originalLoad = coordinator.load.bind(coordinator);
    vi.spyOn(coordinator, "load").mockImplementation(async (cityCode: CityCode) => {
      const result = await originalLoad(cityCode);
      return result;
    });

    render(
      <AddressBookPage
        slice={customerAddressBookSlice}
        route={route("/profile/addresses", {}, { mode: "picker" })}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={nav}
      />,
    );
    await screen.findByText("文三路 1 号");
    fireEvent.click(screen.getByRole("button", { name: "选择" }));
    await waitFor(() => expect(nav.selectAddress).toHaveBeenCalledWith("addr-hz-1"));
  });
});
