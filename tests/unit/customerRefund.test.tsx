// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";
import type {
  Order,
  RefundRequest,
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
  CUSTOMER_REFUND_COMPONENTS,
  CUSTOMER_REFUND_RETRY_EVENT,
  CustomerRefundActionController,
  CustomerRefundCoordinator,
  CustomerRefundPage,
  CustomerRefundTemplate,
  createCustomerRefundComponentRegistry,
  customerRefundFeatureRouteModule,
  customerRefundSlice,
  customerRefundTemplateRegistration,
  parseCustomerRefundRoute,
  refundEligibility,
  type CustomerRefundNavigation,
  type CustomerRefundScope,
  type CustomerRefundTemplateState,
} from "../../apps/customer/src/features/refund/index.js";

const timestamp = "2026-07-24T08:00:00.000Z";
const scope: CustomerRefundScope = Object.freeze({
  actorId: "customer-private-1",
  cityCode: "hangzhou",
});

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
    basePrice: 188,
    currency: "CNY",
    totalAmount: 188,
    quoteSnapshot: null,
    status: "paid",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function refund(
  overrides: Partial<RefundRequest> = {},
): RefundRequest {
  return {
    refundId: "refund-safe-1",
    cityCode: "hangzhou",
    orderId: "order-safe-1",
    customerId: "customer-private-1",
    fulfillmentId: "fulfillment-safe-1",
    paymentOrderId: "payment-safe-1",
    amount: 188,
    currency: "CNY",
    reason: "服务未达到预期",
    status: "requested",
    requestedAt: timestamp,
    approvedAt: null,
    approvedByAdminId: null,
    ...overrides,
  };
}

function route(orderId = "order-safe-1", query: Record<string, string> = {}) {
  return {
    pathname: `/orders/${orderId}/refund`,
    pattern: "/orders/:orderId/refund" as const,
    params: { orderId },
    query,
  };
}

function navigation(): CustomerRefundNavigation {
  return { backToOrder: vi.fn() };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    getOrder: vi.fn().mockResolvedValue({ ok: true, order: order() }),
    createRefundRequest: vi.fn().mockResolvedValue({
      ok: true,
      refund: refund(),
      idempotent: false,
    }),
    ...overrides,
  };
}

function httpError(status: number, method = "GET") {
  return new ApiClientError({
    kind: "http",
    message: `refund ${status}`,
    method,
    path: method === "GET"
      ? "/api/orders/order-safe-1"
      : "/api/aftersale/refunds",
    status,
  });
}

function templateData(
  overrides: Record<string, unknown> = {},
) {
  return {
    viewModel: {
      routeInput: { orderId: "order-safe-1" },
      scope,
      order: order(),
      reason: "",
      errors: {},
      eligibility: refundEligibility(order()),
      result: null,
      idempotent: null,
      notice: null,
      ...overrides,
    },
    actions: {
      onBack: vi.fn(),
      onRetry: vi.fn(),
      onReasonChange: vi.fn(),
      onSubmit: vi.fn(),
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Customer CSL-12 Refund", () => {
  it("registers the guarded L1 route, forbidden Manifest and fixed component plan", async () => {
    const templates = new CustomerTemplateRegistry()
      .register(customerRefundTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerRefundFeatureRouteModule)
      .seal();

    expect(createCustomerRefundComponentRegistry().list())
      .toEqual(CUSTOMER_REFUND_COMPONENTS);
    expect(templates.resolveForSlice(customerRefundSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(customerRefundSlice.guards)
      .toEqual(["session", "city", "protected-route"]);
    expect(routes.resolve("/orders/:orderId/refund")?.slice.id).toBe("CSL-12");
    await expect(routes.resolve("/orders/:orderId/refund")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerRefundPage);
  });

  it("strictly rejects malicious IDs, extra params, query input and path mismatches", () => {
    expect(parseCustomerRefundRoute(route())).toEqual({
      orderId: "order-safe-1",
    });
    for (const malicious of [
      "../foreign",
      "order%2Fforeign",
      "order<script>",
      "order.safe",
      `o${"x".repeat(64)}`,
    ]) {
      expect(parseCustomerRefundRoute(route(malicious))).toBeNull();
    }
    expect(parseCustomerRefundRoute(route("order-safe-1", {
      amount: "0",
    }))).toBeNull();
    expect(parseCustomerRefundRoute({
      ...route(),
      params: { orderId: "order-safe-1", customerId: "foreign" },
    })).toBeNull();
    expect(parseCustomerRefundRoute({
      ...route(),
      pathname: "/orders/order-safe-2/refund",
    })).toBeNull();
  });

  it("loads only the formal order and enforces order, city and actor scope", async () => {
    const customerApi = api();
    const coordinator = new CustomerRefundCoordinator(customerApi);
    await expect(coordinator.loadOrder(scope, "order-safe-1")).resolves
      .toMatchObject({
        status: "ready",
        order: { orderId: "order-safe-1", status: "paid" },
      });
    expect(customerApi.getOrder).toHaveBeenCalledWith("order-safe-1");

    for (const foreign of [
      order({ orderId: "order-foreign-1" }),
      order({ cityCode: "shanghai" }),
      order({ customerId: "customer-foreign-1" }),
    ]) {
      await expect(new CustomerRefundCoordinator(api({
        getOrder: vi.fn().mockResolvedValue({ ok: true, order: foreign }),
      })).loadOrder(scope, "order-safe-1")).resolves.toEqual({
        status: "error",
        errorCode: "refund_order_response_invalid",
        retryable: false,
      });
    }
  });

  it("treats paid as a UX hint and leaves completed fulfillment, ledger and full amount to the backend", async () => {
    expect(refundEligibility(order())).toEqual({
      enabled: true,
      reasonCode: "paid_order_hint",
    });
    expect(refundEligibility(order({ status: "service_completed" }))).toEqual({
      enabled: false,
      reasonCode: "order_not_paid",
    });

    const customerApi = api();
    const controller = new CustomerRefundActionController(
      new CustomerRefundCoordinator(customerApi),
      navigation(),
    );
    await expect(controller.submit(
      scope,
      order({ status: "service_completed" }),
      "仍由后端裁决",
    )).resolves.toEqual({
      status: "unavailable",
      reasonCode: "order_status_not_paid",
    });
    expect(customerApi.createRefundRequest).not.toHaveBeenCalled();
  });

  it("submits only orderId and a 255-character reason, with amount omitted", async () => {
    const customerApi = api();
    const controller = new CustomerRefundActionController(
      new CustomerRefundCoordinator(customerApi),
      navigation(),
    );
    await expect(controller.submit(
      scope,
      order(),
      "  正式退款原因  ",
    )).resolves.toMatchObject({ status: "success" });
    expect(customerApi.createRefundRequest).toHaveBeenCalledWith({
      orderId: "order-safe-1",
      reason: "正式退款原因",
    });
    const body = customerApi.createRefundRequest.mock.calls[0]?.[0];
    expect(Object.prototype.hasOwnProperty.call(body, "amount")).toBe(false);

    await expect(controller.submit(
      scope,
      order(),
      "理".repeat(256),
    )).resolves.toMatchObject({
      status: "validation_error",
      errors: { reason: expect.stringContaining("255") },
    });
    expect(customerApi.createRefundRequest).toHaveBeenCalledTimes(1);
  });

  it("locks duplicate in-flight submissions while preserving backend idempotent replay", async () => {
    let resolveRequest!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const customerApi = api({
      createRefundRequest: vi.fn(() => pending),
    });
    const controller = new CustomerRefundActionController(
      new CustomerRefundCoordinator(customerApi),
      navigation(),
    );
    const first = controller.submit(scope, order(), "同一原因");
    await expect(controller.submit(scope, order(), "同一原因")).resolves
      .toEqual({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    resolveRequest({
      ok: true,
      refund: refund(),
      idempotent: true,
    });
    await expect(first).resolves.toMatchObject({
      status: "success",
      idempotent: true,
      refund: { status: "requested" },
    });
    expect(customerApi.createRefundRequest).toHaveBeenCalledTimes(1);
  });

  it("validates the refund response and cross-checks order, city and customer", async () => {
    for (const foreign of [
      refund({ orderId: "order-foreign-1" }),
      refund({ cityCode: "beijing" }),
      refund({ customerId: "customer-foreign-1" }),
    ]) {
      const coordinator = new CustomerRefundCoordinator(api({
        createRefundRequest: vi.fn().mockResolvedValue({
          ok: true,
          refund: foreign,
          idempotent: false,
        }),
      }));
      await expect(coordinator.createRequest(
        scope,
        "order-safe-1",
        "reason",
      )).resolves.toEqual({
        status: "error",
        errorCode: "refund_response_invalid",
        retryable: false,
      });
    }

    await expect(new CustomerRefundCoordinator(api({
      createRefundRequest: vi.fn().mockResolvedValue({
        ok: true,
        refund: { ...refund(), amount: "188" },
        idempotent: false,
      }),
    })).createRequest(scope, "order-safe-1", "reason")).resolves.toEqual({
      status: "error",
      errorCode: "refund_response_invalid",
      retryable: false,
    });
  });

  it("projects requested or approved exactly and never exposes the approving admin", async () => {
    const approved = refund({
      status: "approved",
      amount: 176.43,
      approvedAt: timestamp,
      approvedByAdminId: "admin-private-1",
    });
    const response = await new CustomerRefundCoordinator(api({
      createRefundRequest: vi.fn().mockResolvedValue({
        ok: true,
        refund: approved,
        idempotent: true,
      }),
    })).createRequest(scope, "order-safe-1", "reason");
    expect(response).toMatchObject({
      status: "success",
      idempotent: true,
      refund: {
        amount: 176.43,
        currency: "CNY",
        status: "approved",
      },
    });
    if (response.status === "success") {
      expect(response.refund).not.toHaveProperty("approvedByAdminId");
      expect(response.refund).not.toHaveProperty("customerId");
    }
  });

  it("renders response amount, currency and status as read-only server facts", () => {
    render(
      <CustomerRefundTemplate
        slice={customerRefundSlice}
        route={route()}
        state={{
          status: "limited-result",
          data: templateData({
            result: {
              refundId: "refund-safe-1",
              orderId: "order-safe-1",
              amount: 176.43,
              currency: "CNY",
              reason: null,
              status: "requested",
              requestedAt: timestamp,
              approvedAt: null,
            },
            idempotent: true,
          }),
        } as unknown as CustomerSliceState}
      />,
    );
    expect(screen.getByText("176.43")).toBeTruthy();
    expect(screen.getByText("CNY")).toBeTruthy();
    expect(screen.getByText("requested")).toBeTruthy();
    expect(screen.getByText("幂等重放")).toBeTruthy();
    expect(screen.getByText(/不代表款项到账或退款已经完成/)).toBeTruthy();
    expect(screen.queryByLabelText("请说明申请原因")).toBeNull();
    expect(screen.getByRole("button", { name: "返回订单" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("admin-private-1");
  });

  it("submits once through the page and keeps only the limited in-memory result", async () => {
    const customerApi = api();
    render(
      <CustomerRefundPage
        slice={customerRefundSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerRefundCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("paid 订单可尝试提交");
    fireEvent.change(screen.getByLabelText("请说明申请原因"), {
      target: { value: "需要申请正式全额退款" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: "提交全额退款申请",
    }));
    expect(await screen.findByRole("button", {
      name: "正在请求服务端",
    })).toBeTruthy();
    expect(await screen.findByText("服务端已返回退款申请事实"))
      .toBeTruthy();
    expect(screen.getByText(/Customer 当前没有退款 GET/)).toBeTruthy();
    expect(customerApi.createRefundRequest).toHaveBeenCalledTimes(1);
    expect(customerApi.getOrder).toHaveBeenCalledTimes(1);
  });

  it("re-reads only the order after 409 and never fabricates a refund result", async () => {
    const customerApi = api({
      getOrder: vi.fn()
        .mockResolvedValueOnce({ ok: true, order: order() })
        .mockResolvedValueOnce({
          ok: true,
          order: order({ status: "service_completed" }),
        }),
      createRefundRequest: vi.fn().mockRejectedValue(httpError(409, "POST")),
    });
    render(
      <CustomerRefundPage
        slice={customerRefundSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerRefundCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("paid 订单可尝试提交");
    fireEvent.click(screen.getByRole("button", {
      name: "提交全额退款申请",
    }));
    expect(await screen.findByText(/Customer 没有退款查询 API/)).toBeTruthy();
    expect(screen.getByText(/当前订单不是 paid/)).toBeTruthy();
    expect(screen.queryByText("服务端已返回退款申请事实")).toBeNull();
    expect(customerApi.getOrder).toHaveBeenCalledTimes(2);
  });

  it("clears the session seam on 401 and converges 403/404 without disclosure", async () => {
    const expired = vi.fn();
    render(
      <CustomerRefundPage
        slice={customerRefundSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerRefundCoordinator(api({
          getOrder: vi.fn().mockRejectedValue(httpError(401)),
        }))}
        navigation={navigation()}
        onSessionExpired={expired}
      />,
    );
    await waitFor(() => expect(expired).toHaveBeenCalledTimes(1));
    expect(screen.getByText("无法查看此订单")).toBeTruthy();
    cleanup();

    for (const status of [403, 404]) {
      render(
        <CustomerRefundPage
          slice={customerRefundSlice}
          route={route()}
          scope={scope}
          coordinator={new CustomerRefundCoordinator(api({
            getOrder: vi.fn().mockRejectedValue(httpError(status)),
          }))}
          navigation={navigation()}
        />,
      );
      expect(await screen.findByText("无法查看此订单")).toBeTruthy();
      expect(screen.getByText(/不会透露资源是否属于他人/)).toBeTruthy();
      cleanup();
    }
  });

  it("maps 501 to unavailable and other 5xx failures to retryable error", async () => {
    render(
      <CustomerRefundPage
        slice={customerRefundSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerRefundCoordinator(api({
          getOrder: vi.fn().mockRejectedValue(httpError(501)),
        }))}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("退款能力暂不可用")).toBeTruthy();
    cleanup();

    render(
      <CustomerRefundPage
        slice={customerRefundSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerRefundCoordinator(api({
          getOrder: vi.fn().mockRejectedValue(httpError(503)),
        }))}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("退款页面加载失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy();
  });

  it("maps mutation 401/403/404/409/501 and 5xx without inventing state", async () => {
    const expected = new Map<number, string>([
      [401, "unauthenticated"],
      [403, "forbidden_or_not_found"],
      [404, "forbidden_or_not_found"],
      [409, "conflict"],
      [501, "unavailable"],
      [503, "error"],
    ]);
    for (const [status, resultStatus] of expected) {
      const coordinator = new CustomerRefundCoordinator(api({
        createRefundRequest: vi.fn().mockRejectedValue(
          httpError(status, "POST"),
        ),
      }));
      await expect(coordinator.createRequest(
        scope,
        "order-safe-1",
        "reason",
      )).resolves.toMatchObject({ status: resultStatus });
    }
  });

  it("keeps the latest order load when an older request resolves last", async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const customerApi = api({
      getOrder: vi.fn()
        .mockImplementationOnce(() => first)
        .mockResolvedValueOnce({ ok: true, order: order() }),
    });
    render(
      <CustomerRefundPage
        slice={customerRefundSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerRefundCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await waitFor(() => {
      expect(customerApi.getOrder).toHaveBeenCalledTimes(1);
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(CUSTOMER_REFUND_RETRY_EVENT));
    });
    await screen.findByText("paid 订单可尝试提交");
    await act(async () => {
      resolveFirst({
        ok: true,
        order: order({ status: "service_completed" }),
      });
      await first;
    });
    await waitFor(() => {
      expect(screen.getByText("paid 订单可尝试提交")).toBeTruthy();
    });
    expect(screen.getByRole("button", {
      name: "提交全额退款申请",
    }).hasAttribute("disabled")).toBe(false);
  });

  it("covers all specified operational and boundary states", () => {
    const renderState = (state: CustomerRefundTemplateState) => (
      <CustomerRefundTemplate
        slice={customerRefundSlice}
        route={route()}
        state={state as unknown as CustomerSliceState}
      />
    );
    const { rerender } = render(renderState({ status: "order-loading" }));
    expect(screen.getByText("正在读取订单")).toBeTruthy();

    rerender(renderState({
      status: "eligibility-checking",
      data: templateData(),
    }));
    expect(screen.getByText("前端提示不等于资格证明")).toBeTruthy();

    rerender(renderState({
      status: "requesting",
      data: templateData(),
    }));
    expect(screen.getByRole("button", { name: "正在请求服务端" })
      .hasAttribute("disabled")).toBe(true);

    rerender(renderState({
      status: "validation_error",
      data: templateData({ errors: { reason: "原因有误" } }),
    }));
    expect(screen.getByText("请修正退款原因后再提交。")).toBeTruthy();

    rerender(renderState({
      status: "conflict",
      data: templateData({ notice: "冲突已安全收敛。" }),
    }));
    expect(screen.getByText("冲突已安全收敛。")).toBeTruthy();

    rerender(renderState({
      status: "error",
      errorCode: "refund_failed",
      retryable: true,
    }));
    expect(screen.getByText("退款页面加载失败")).toBeTruthy();

    rerender(renderState({ status: "forbidden_or_not_found" }));
    expect(screen.getByText("无法查看此订单")).toBeTruthy();

    rerender(renderState({
      status: "unavailable",
      reasonCode: "refund_unavailable",
      retryable: true,
    }));
    expect(screen.getByText("退款能力暂不可用")).toBeTruthy();

    rerender(renderState({
      status: "limited-result",
      data: templateData({
        result: {
          refundId: "refund-safe-1",
          orderId: "order-safe-1",
          amount: 188,
          currency: "CNY",
          reason: null,
          status: "approved",
          requestedAt: timestamp,
          approvedAt: timestamp,
        },
        idempotent: false,
      }),
    }));
    expect(screen.getByText("approved")).toBeTruthy();
    expect(screen.getByText(/不会据此推断款项已经到账/)).toBeTruthy();
  });
});
