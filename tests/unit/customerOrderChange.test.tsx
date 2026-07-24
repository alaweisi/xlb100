// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";
import type {
  Order,
  OrderReverseRequest,
  OrderReverseStatus,
} from "@xlb/types";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
  type CustomerSliceState,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CUSTOMER_ORDER_CHANGE_COMPONENTS,
  CustomerOrderChangeActionController,
  CustomerOrderChangeCoordinator,
  CustomerOrderChangePage,
  CustomerOrderChangeTemplate,
  createCustomerOrderChangeComponentRegistry,
  customerOrderChangeFeatureRouteModule,
  customerOrderChangeSlice,
  customerOrderChangeTemplateRegistration,
  orderChangeEligibility,
  parseCustomerOrderChangeRoute,
  type CustomerOrderChangeNavigation,
  type CustomerOrderChangeTemplateState,
} from "../../apps/customer/src/features/order-change/index.js";

const timestamp = "2026-07-24T08:00:00.000Z";

function order(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "order-safe-1",
    cityCode: "hangzhou",
    addressProvince: "浙江省",
    addressCity: "杭州市",
    addressDistrict: "西湖区",
    detailAddress: "受保护地址",
    contactName: "受保护姓名",
    contactPhone: "13800000000",
    scheduledAt: "2026-07-26T02:00:00.000Z",
    scheduledTimeSlot: "morning",
    customerId: "customer-private-1",
    skuId: "sku-safe-1",
    skuName: "正式服务",
    quantity: 1,
    unit: "次",
    priceRuleId: "price-safe-1",
    priceText: "服务端报价",
    priceType: "fixed",
    basePrice: 100,
    currency: "CNY",
    totalAmount: 100,
    quoteSnapshot: null,
    status: "pending_dispatch",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function reverseRequest(
  status: OrderReverseStatus = "requested",
  overrides: Partial<OrderReverseRequest> = {},
): OrderReverseRequest {
  return {
    reverseRequestId: `reverse-${status}-1`,
    cityCode: "hangzhou",
    orderId: "order-safe-1",
    customerId: "customer-private-1",
    reverseType: "cancel",
    status,
    reason: `${status} 正式原因`,
    requestedScheduledAt: null,
    requestedTimeSlot: null,
    idempotencyKey: `private-${status}-key`,
    reviewNote: status === "rejected" ? "服务端审核说明" : null,
    reviewedByAdminId: null,
    reviewedAt: status === "requested" ? null : timestamp,
    appliedAt: status === "applied" ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function route(
  orderId = "order-safe-1",
  reverseType?: string,
) {
  return {
    pathname: `/orders/${orderId}/change`,
    pattern: "/orders/:orderId/change" as const,
    params: { orderId },
    query: reverseType === undefined ? {} : { reverseType },
  };
}

function navigation(): CustomerOrderChangeNavigation {
  return {
    back: vi.fn(),
    login: vi.fn(),
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    getOrder: vi.fn().mockResolvedValue({ ok: true, order: order() }),
    listOrderReverseRequests: vi.fn().mockResolvedValue({
      ok: true,
      reverseRequests: [],
    }),
    createOrderReverseRequest: vi.fn().mockResolvedValue({
      ok: true,
      reverseRequest: reverseRequest(),
      idempotent: false,
    }),
    ...overrides,
  };
}

function httpError(status: number, method = "GET") {
  return new ApiClientError({
    kind: "http",
    message: `order change ${status}`,
    method,
    path: "/api/orders/order-safe-1/reverse-requests",
    status,
  });
}

function templateData(
  reverseRequests: readonly OrderReverseRequest[] = [],
) {
  const aggregate = {
    order: order(),
    reverseRequests,
  };
  return {
    viewModel: {
      routeInput: {
        orderId: "order-safe-1",
        reverseType: null,
      },
      aggregate,
      draft: {
        reverseType: "cancel" as const,
        reason: "",
        requestedScheduledAt: "",
        requestedTimeSlot: "morning" as const,
      },
      errors: {},
      eligibility: orderChangeEligibility(aggregate.order),
      refreshing: false,
      notice: null,
    },
    actions: {
      onBack: vi.fn(),
      onRefresh: vi.fn(),
      onSelectType: vi.fn(),
      onReasonChange: vi.fn(),
      onScheduledAtChange: vi.fn(),
      onTimeSlotChange: vi.fn(),
      onSubmit: vi.fn(),
    },
  };
}

afterEach(() => cleanup());

describe("Customer CSL-11 Order Change", () => {
  it("registers one guarded route, an L1 closed template and fixed components", async () => {
    const templates = new CustomerTemplateRegistry()
      .register(customerOrderChangeTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerOrderChangeFeatureRouteModule)
      .seal();

    expect(createCustomerOrderChangeComponentRegistry().list())
      .toEqual(CUSTOMER_ORDER_CHANGE_COMPONENTS);
    expect(templates.resolveForSlice(customerOrderChangeSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(customerOrderChangeSlice.guards)
      .toEqual(["session", "city", "protected-route"]);
    expect(routes.resolve("/orders/:orderId/change")?.slice.id).toBe("CSL-11");
    await expect(routes.resolve("/orders/:orderId/change")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerOrderChangePage);
  });

  it("accepts only a safe orderId and the three formal reverse types", () => {
    expect(parseCustomerOrderChangeRoute(route())).toEqual({
      orderId: "order-safe-1",
      reverseType: null,
    });
    for (const reverseType of ["cancel", "reschedule", "reassign"]) {
      expect(parseCustomerOrderChangeRoute(route(
        "order-safe-1",
        reverseType,
      ))).toEqual({
        orderId: "order-safe-1",
        reverseType,
      });
    }
    expect(parseCustomerOrderChangeRoute(route("../foreign"))).toBeNull();
    expect(parseCustomerOrderChangeRoute(route("order%2Fforeign"))).toBeNull();
    expect(parseCustomerOrderChangeRoute(route(
      "order-safe-1",
      "approve",
    ))).toBeNull();
  });

  it("loads order and reverse history together and rejects mismatched authority", async () => {
    const customerApi = api({
      listOrderReverseRequests: vi.fn().mockResolvedValue({
        ok: true,
        reverseRequests: [reverseRequest()],
      }),
    });
    const coordinator = new CustomerOrderChangeCoordinator(customerApi);
    await expect(coordinator.load("order-safe-1")).resolves.toMatchObject({
      status: "ready",
      aggregate: {
        order: { orderId: "order-safe-1" },
        reverseRequests: [{ status: "requested" }],
      },
    });
    expect(customerApi.getOrder).toHaveBeenCalledWith("order-safe-1");
    expect(customerApi.listOrderReverseRequests)
      .toHaveBeenCalledWith("order-safe-1");

    const foreign = new CustomerOrderChangeCoordinator(api({
      listOrderReverseRequests: vi.fn().mockResolvedValue({
        ok: true,
        reverseRequests: [reverseRequest("requested", {
          orderId: "order-foreign-1",
        })],
      }),
    }));
    await expect(foreign.load("order-safe-1")).resolves.toEqual({
      status: "error",
      errorCode: "order_change_response_invalid",
      retryable: false,
    });
  });

  it("validates cancel input, locks duplicates and creates a fresh idempotency key per submission", async () => {
    const customerApi = api();
    const controller = new CustomerOrderChangeActionController(
      new CustomerOrderChangeCoordinator(customerApi),
      navigation(),
    );
    await expect(controller.submit(order(), {
      reverseType: "cancel",
      reason: " ",
      requestedScheduledAt: "",
      requestedTimeSlot: "morning",
    })).resolves.toMatchObject({
      status: "validation_error",
      errors: { reason: expect.any(String) },
    });
    expect(customerApi.createOrderReverseRequest).not.toHaveBeenCalled();

    const draft = {
      reverseType: "cancel" as const,
      reason: "  顾客正式取消原因  ",
      requestedScheduledAt: "",
      requestedTimeSlot: "morning" as const,
    };
    await expect(controller.submit(order(), draft)).resolves
      .toMatchObject({ status: "success" });
    await expect(controller.submit(order(), draft)).resolves
      .toMatchObject({ status: "success" });
    const first = customerApi.createOrderReverseRequest.mock.calls[0]?.[1];
    const second = customerApi.createOrderReverseRequest.mock.calls[1]?.[1];
    expect(first).toMatchObject({
      reverseType: "cancel",
      reason: "顾客正式取消原因",
      idempotencyKey: expect.stringMatching(/^customer-order-change-/u),
    });
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("keeps reschedule and reassign unavailable when the order response cannot prove not-started", async () => {
    const eligibility = orderChangeEligibility(order());
    expect(eligibility.cancel).toEqual({
      enabled: true,
      reasonCode: "server_will_decide",
    });
    expect(eligibility.reschedule).toEqual({
      enabled: false,
      reasonCode: "fulfillment_start_fact_missing",
    });
    expect(eligibility.reassign).toEqual({
      enabled: false,
      reasonCode: "fulfillment_start_fact_missing",
    });

    const customerApi = api();
    const controller = new CustomerOrderChangeActionController(
      new CustomerOrderChangeCoordinator(customerApi),
      navigation(),
    );
    await expect(controller.submit(order(), {
      reverseType: "reschedule",
      reason: "希望调整时间",
      requestedScheduledAt: "2026-07-28T10:00",
      requestedTimeSlot: "morning",
    })).resolves.toEqual({
      status: "unavailable",
      reasonCode: "fulfillment_start_fact_missing",
    });
    await expect(controller.submit(order(), {
      reverseType: "reassign",
      reason: "希望改派",
      requestedScheduledAt: "",
      requestedTimeSlot: "morning",
    })).resolves.toEqual({
      status: "unavailable",
      reasonCode: "fulfillment_start_fact_missing",
    });
    expect(customerApi.createOrderReverseRequest).not.toHaveBeenCalled();
  });

  it("renders requested, approved, rejected and applied exactly as returned", () => {
    render(
      <CustomerOrderChangeTemplate
        slice={customerOrderChangeSlice}
        route={route()}
        state={{
          status: "ready",
          data: templateData([
            reverseRequest("requested"),
            reverseRequest("approved"),
            reverseRequest("rejected"),
            reverseRequest("applied"),
          ]),
        } as unknown as CustomerSliceState}
      />,
    );
    expect(screen.getByText("已申请")).toBeTruthy();
    expect(screen.getByText("已批准")).toBeTruthy();
    expect(screen.getByText("未批准")).toBeTruthy();
    expect(screen.getByText("已应用")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /申请改期/ })
      .hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("radio", { name: /申请改派/ })
      .hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText(/缺少“未开工”权威事实/)).toHaveLength(2);
  });

  it("submits cancel once and refreshes both authoritative reads after success", async () => {
    const customerApi = api({
      getOrder: vi.fn()
        .mockResolvedValueOnce({ ok: true, order: order() })
        .mockResolvedValueOnce({ ok: true, order: order() }),
      listOrderReverseRequests: vi.fn()
        .mockResolvedValueOnce({ ok: true, reverseRequests: [] })
        .mockResolvedValueOnce({
          ok: true,
          reverseRequests: [reverseRequest()],
        }),
    });
    render(
      <CustomerOrderChangePage
        slice={customerOrderChangeSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new CustomerOrderChangeCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("暂无变更记录");
    fireEvent.change(screen.getByLabelText("申请原因"), {
      target: { value: "需要取消本次服务" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交变更申请" }));
    expect(await screen.findByRole("button", {
      name: "正在提交申请",
    })).toBeTruthy();
    expect(await screen.findByText(/申请已由服务端接收/)).toBeTruthy();
    expect(screen.getByText("已申请")).toBeTruthy();
    expect(customerApi.createOrderReverseRequest).toHaveBeenCalledTimes(1);
    expect(customerApi.getOrder).toHaveBeenCalledTimes(2);
    expect(customerApi.listOrderReverseRequests).toHaveBeenCalledTimes(2);
  });

  it("refreshes order and history after a 409 without advancing local status", async () => {
    const customerApi = api({
      getOrder: vi.fn()
        .mockResolvedValueOnce({ ok: true, order: order() })
        .mockResolvedValueOnce({
          ok: true,
          order: order({ status: "service_completed" }),
        }),
      listOrderReverseRequests: vi.fn()
        .mockResolvedValueOnce({ ok: true, reverseRequests: [] })
        .mockResolvedValueOnce({
          ok: true,
          reverseRequests: [reverseRequest("rejected")],
        }),
      createOrderReverseRequest: vi.fn()
        .mockRejectedValue(httpError(409, "POST")),
    });
    render(
      <CustomerOrderChangePage
        slice={customerOrderChangeSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new CustomerOrderChangeCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("暂无变更记录");
    fireEvent.change(screen.getByLabelText("申请原因"), {
      target: { value: "请求取消服务" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交变更申请" }));
    expect(await screen.findByText(/已刷新服务端最新事实/)).toBeTruthy();
    expect(screen.getByText("服务已完成")).toBeTruthy();
    expect(screen.getByText("未批准")).toBeTruthy();
    expect(customerApi.getOrder).toHaveBeenCalledTimes(2);
    expect(customerApi.listOrderReverseRequests).toHaveBeenCalledTimes(2);
  });

  it("converges 403/404 safely, expires on 401 and offers retry for 5xx", async () => {
    for (const code of [403, 404]) {
      const { unmount } = render(
        <CustomerOrderChangePage
          slice={customerOrderChangeSlice}
          route={route()}
          cityCode="hangzhou"
          coordinator={new CustomerOrderChangeCoordinator(api({
            getOrder: vi.fn().mockRejectedValue(httpError(code)),
          }))}
          navigation={navigation()}
        />,
      );
      expect(await screen.findByText("无法查看此订单")).toBeTruthy();
      expect(screen.getByText(/不会透露资源归属/)).toBeTruthy();
      unmount();
    }

    const expired = vi.fn();
    render(
      <CustomerOrderChangePage
        slice={customerOrderChangeSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new CustomerOrderChangeCoordinator(api({
          getOrder: vi.fn().mockRejectedValue(httpError(401)),
        }))}
        navigation={navigation()}
        onSessionExpired={expired}
      />,
    );
    await waitFor(() => expect(expired).toHaveBeenCalledTimes(1));
    cleanup();

    render(
      <CustomerOrderChangePage
        slice={customerOrderChangeSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new CustomerOrderChangeCoordinator(api({
          getOrder: vi.fn().mockRejectedValue(httpError(503)),
        }))}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("订单变更加载失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy();
  });

  it("covers loading, empty, submitting, validation, conflict, error, forbidden and unavailable states", () => {
    const renderState = (state: CustomerOrderChangeTemplateState) => (
      <CustomerOrderChangeTemplate
        slice={customerOrderChangeSlice}
        route={route()}
        state={state as unknown as CustomerSliceState}
      />
    );
    const { rerender } = render(renderState({ status: "loading" }));
    expect(screen.getByText("正在读取订单变更")).toBeTruthy();

    rerender(renderState({ status: "empty", data: templateData() }));
    expect(screen.getByText("暂无变更记录")).toBeTruthy();

    rerender(renderState({
      status: "submitting",
      data: templateData(),
    }));
    expect(screen.getByRole("button", { name: "正在提交申请" })
      .hasAttribute("disabled")).toBe(true);

    rerender(renderState({
      status: "validation_error",
      data: templateData(),
    }));
    expect(screen.getByText(/请修正表单/)).toBeTruthy();

    rerender(renderState({
      status: "conflict",
      data: {
        ...templateData([reverseRequest("rejected")]),
        viewModel: {
          ...templateData([reverseRequest("rejected")]).viewModel,
          notice: {
            kind: "conflict",
            message: "已刷新冲突事实。",
          },
        },
      },
    }));
    expect(screen.getByText("已刷新冲突事实。")).toBeTruthy();

    rerender(renderState({
      status: "error",
      errorCode: "load_failed",
      retryable: true,
    }));
    expect(screen.getByText("订单变更加载失败")).toBeTruthy();

    rerender(renderState({ status: "forbidden_or_not_found" }));
    expect(screen.getByText("无法查看此订单")).toBeTruthy();

    rerender(renderState({
      status: "unavailable",
      reasonCode: "api_unavailable",
      retryable: false,
    }));
    expect(screen.getByText("订单变更暂不可用")).toBeTruthy();
    expect(screen.getByText(/不会使用本地、Mock 或演示数据替代/))
      .toBeTruthy();
  });
});
