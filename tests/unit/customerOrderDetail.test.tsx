// @vitest-environment jsdom
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  ApiClientError,
  type AftersaleComplaintResponse,
} from "@xlb/api-client";
import type {
  FulfillmentEvidenceAggregate,
  Order,
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
  CUSTOMER_ORDER_DETAIL_COMPONENTS,
  CustomerOrderDetailActionController,
  CustomerOrderDetailCoordinator,
  CustomerOrderDetailPage,
  CustomerOrderDetailTemplate,
  createCustomerOrderDetailComponentRegistry,
  customerOrderDetailRouteModule,
  customerOrderDetailSlice,
  customerOrderDetailTemplateRegistration,
  deriveCustomerOrderDetailAvailability,
  latestCustomerOrderDetailAggregate,
  parseCustomerOrderDetailRoute,
  safeAuthorizedEvidenceUrl,
  safeCustomerOrderRelatedRoute,
  safeCustomerPaymentRoute,
  type CustomerOrderDetailAggregate,
  type CustomerOrderDetailApi,
  type CustomerOrderDetailNavigation,
} from "../../apps/customer/src/features/orders/index.js";

const timestamp = "2026-07-24T10:00:00.000Z";
const scope = { actorId: "customer-a", cityCode: "hangzhou" } as const;

function order(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "order-detail-1",
    cityCode: "hangzhou",
    addressProvince: "浙江省",
    addressCity: "杭州市",
    addressDistrict: "西湖区",
    detailAddress: "服务地址",
    contactName: "顾客",
    contactPhone: "13800001111",
    scheduledAt: timestamp,
    scheduledTimeSlot: "morning",
    customerId: "customer-a",
    skuId: "sku-home",
    skuName: "正式服务",
    quantity: 1,
    unit: "次",
    priceRuleId: "price-1",
    priceText: "¥89",
    priceType: "fixed",
    basePrice: 89,
    currency: "CNY",
    totalAmount: 89,
    quoteSnapshot: null,
    status: "pending_dispatch",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function evidence(
  overrides: Partial<FulfillmentEvidenceAggregate> = {},
): FulfillmentEvidenceAggregate {
  return {
    fulfillmentId: "fulfillment-1",
    orderId: "order-detail-1",
    cityCode: "hangzhou",
    fulfillmentStatus: "completed",
    evidence: [{
      evidenceId: "evidence-1",
      cityCode: "hangzhou",
      fulfillmentId: "fulfillment-1",
      orderId: "order-detail-1",
      complaintId: null,
      mediaAssetId: "media-1",
      evidenceType: "completion",
      note: "服务端完工证据",
      capturedAt: timestamp,
      createdByWorkerId: "worker-a",
      createdAt: timestamp,
      mediaAsset: {
        mediaAssetId: "media-1",
        cityCode: "hangzhou",
        orderId: "order-detail-1",
        fulfillmentId: "fulfillment-1",
        complaintId: null,
        uploadedByType: "worker",
        uploadedById: "worker-a",
        originalFileName: "completion.png",
        contentType: "image/png",
        sizeBytes: 128,
        checksumSha256: "a".repeat(64),
        signatureValidated: true,
        securityScanStatus: "not_malware_scanned_local",
        storage: {
          provider: "local",
          providerName: "xlb-local-filesystem",
          providerStatus: "stored_local",
          externalProviderExecuted: false,
          objectKey: "private-object-key",
          storageUri: "file:///private/not-for-ui",
          publicUrl: null,
          checksumSha256: "a".repeat(64),
          sizeBytes: 128,
          contentType: "image/png",
          storedAt: timestamp,
        },
        createdAt: timestamp,
      },
    }],
    confirmation: {
      confirmationId: "confirmation-1",
      cityCode: "hangzhou",
      fulfillmentId: "fulfillment-1",
      orderId: "order-detail-1",
      customerId: "customer-a",
      status: "pending",
      complaintId: null,
      customerNote: null,
      evidenceSnapshot: [],
      confirmedAt: null,
      disputedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    ...overrides,
  };
}

function complaint(
  overrides: Partial<AftersaleComplaintResponse> = {},
): AftersaleComplaintResponse {
  return {
    complaintId: "complaint-1",
    cityCode: "hangzhou",
    orderId: "order-detail-1",
    customerId: "customer-a",
    category: "service_quality",
    priority: "normal",
    description: "正式投诉内容",
    status: "submitted",
    idempotencyKey: "complaint-key-1",
    assignedAdminId: null,
    resolutionType: null,
    resolutionNote: null,
    submittedAt: timestamp,
    resolvedAt: null,
    closedAt: null,
    updatedAt: timestamp,
    ...overrides,
  };
}

function api(
  overrides: Partial<CustomerOrderDetailApi> = {},
): CustomerOrderDetailApi {
  return {
    getOrder: vi.fn(async () => ({ ok: true as const, order: order() })),
    getOrderFulfillmentEvidence: vi.fn(async () => ({
      ok: true as const,
      aggregates: [evidence()],
    })),
    listOrderReverseRequests: vi.fn(async () => ({
      ok: true as const,
      reverseRequests: [],
    })),
    listAftersaleComplaints: vi.fn(async () => ({
      ok: true as const,
      complaints: [complaint()],
    })),
    getOrderReview: vi.fn(async () => ({
      ok: true as const,
      review: null,
    })),
    decideFulfillmentConfirmation: vi.fn(async () => ({
      ok: true as const,
      confirmation: {
        ...evidence().confirmation!,
        status: "confirmed" as const,
        confirmedAt: timestamp,
      },
      idempotent: false,
    })),
    confirmService: vi.fn(async () => ({
      ok: true as const,
      order: order({ status: "service_completed" }),
    })),
    ...overrides,
  } as CustomerOrderDetailApi;
}

function route(orderId = "order-detail-1") {
  return {
    pathname: `/orders/${orderId}`,
    pattern: "/orders/:orderId" as const,
    params: { orderId },
    query: {},
  };
}

function navigation(): CustomerOrderDetailNavigation {
  return {
    backToOrders: vi.fn(),
    openRoute: vi.fn(),
    focusEvidence: vi.fn(),
  };
}

function aggregate(
  overrides: Partial<CustomerOrderDetailAggregate> = {},
): CustomerOrderDetailAggregate {
  return {
    order: order(),
    evidence: { status: "ready", data: [evidence()] },
    confirmations: {
      status: "ready",
      data: [evidence().confirmation!],
    },
    reverses: { status: "empty" },
    complaints: { status: "ready", data: [complaint()] },
    review: { status: "empty" },
    partial: false,
    refreshedAt: timestamp,
    ...overrides,
  };
}

function httpError(status: number, path = "/api/orders/order-detail-1") {
  return new ApiClientError({
    kind: "http",
    message: `HTTP ${status}`,
    method: "GET",
    path,
    status,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Customer CSL-10 Order & Fulfillment Detail", () => {
  it("registers the protected fixed L1 route without breaking CSL-09", async () => {
    const components = createCustomerOrderDetailComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerOrderDetailTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerOrderDetailRouteModule)
      .seal();

    expect(components.list()).toEqual(CUSTOMER_ORDER_DETAIL_COMPONENTS);
    expect(customerOrderDetailSlice.guards).toEqual([
      "session",
      "city",
      "protected-route",
    ]);
    expect(templates.resolveForSlice(customerOrderDetailSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(routes.resolve("/orders")?.slice.id).toBe("CSL-09");
    expect(routes.resolve("/orders/:orderId")?.slice.id).toBe("CSL-10");
    await expect(routes.resolve("/orders/:orderId")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerOrderDetailPage);
  });

  it("accepts only an exact safe order detail path", () => {
    expect(parseCustomerOrderDetailRoute(route())).toEqual({
      orderId: "order-detail-1",
    });
    for (const malicious of [
      "../other",
      "order/../../profile",
      "order%2Fother",
      "order?next=https://evil.example",
      "订单-1",
    ]) {
      expect(parseCustomerOrderDetailRoute(route(malicious))).toBeNull();
    }
    expect(parseCustomerOrderDetailRoute({
      ...route(),
      query: { customerId: "other" },
    })).toBeNull();
  });

  it("aggregates formal server facts and keeps optional failures partial", async () => {
    const coordinator = new CustomerOrderDetailCoordinator(api({
      getOrderFulfillmentEvidence: vi.fn()
        .mockRejectedValue(httpError(500, "/fulfillment-evidence")),
    }));
    const result = await coordinator.loadAggregate(scope, "order-detail-1");
    expect(result).toMatchObject({
      status: "ready",
      aggregate: {
        partial: true,
        evidence: {
          status: "error",
          errorCode: "dependency_load_failed",
          retryable: true,
        },
        complaints: { status: "ready" },
        reverses: { status: "empty" },
        review: { status: "empty" },
      },
    });
  });

  it("rejects actor, city and order scope pollution in every aggregate", async () => {
    const foreignComplaint = new CustomerOrderDetailCoordinator(api({
      listAftersaleComplaints: vi.fn(async () => ({
        ok: true as const,
        complaints: [complaint({ customerId: "other-customer" })],
      })),
    }));
    await expect(foreignComplaint.loadAggregate(scope, "order-detail-1"))
      .resolves.toMatchObject({
        status: "ready",
        aggregate: {
          partial: true,
          complaints: {
            status: "error",
            errorCode: "dependency_response_invalid",
          },
        },
      });

    const foreignOrder = new CustomerOrderDetailCoordinator(api({
      getOrder: vi.fn(async () => ({
        ok: true as const,
        order: order({ customerId: "other-customer" }),
      })),
    }));
    await expect(foreignOrder.loadAggregate(scope, "order-detail-1"))
      .resolves.toEqual({
        status: "error",
        errorCode: "order_response_invalid",
        retryable: false,
      });
  });

  it.each([403, 404])(
    "collapses order HTTP %i to the same safe unavailable result",
    async (status) => {
      const coordinator = new CustomerOrderDetailCoordinator(api({
        getOrder: vi.fn().mockRejectedValue(httpError(status)),
      }));
      await expect(coordinator.loadAggregate(scope, "order-detail-1"))
        .resolves.toEqual({
          status: "unavailable",
          capability: "customer.order-detail",
          reasonCode: "order_scope_unavailable",
        });
    },
  );

  it.each([
    [401, "unauthenticated"],
    [409, "conflict"],
    [503, "unavailable"],
    [500, "error"],
  ] as const)("maps order HTTP %i to %s", async (status, expected) => {
    const coordinator = new CustomerOrderDetailCoordinator(api({
      getOrder: vi.fn().mockRejectedValue(httpError(status)),
    }));
    await expect(coordinator.loadAggregate(scope, "order-detail-1"))
      .resolves.toMatchObject({ status: expected });
  });

  it("uses latest-wins and never lets an older order overwrite newer truth", () => {
    const newer = aggregate({
      order: order({ updatedAt: "2026-07-24T12:00:00.000Z" }),
    });
    const older = aggregate({
      order: order({ updatedAt: "2026-07-24T11:00:00.000Z" }),
    });
    expect(latestCustomerOrderDetailAggregate(newer, older)).toBe(newer);
    expect(latestCustomerOrderDetailAggregate(older, newer)).toBe(newer);
  });

  it("derives actions from server facts and keeps GAP-10 payment unreachable", () => {
    const available = deriveCustomerOrderDetailAvailability(aggregate());
    expect(available["view-evidence"].available).toBe(true);
    expect(available["confirm-fulfillment"].available).toBe(true);
    expect(available["dispute-fulfillment"].available).toBe(true);
    expect(available["confirm-service"].available).toBe(true);
    expect(available.payment).toEqual({
      action: "payment",
      available: false,
      reasonCode: "order_not_service_completed",
    });

    const impossible = deriveCustomerOrderDetailAvailability(aggregate({
      order: order({ status: "pending_payment" }),
    }));
    expect(impossible.payment.available).toBe(false);
    expect(impossible.review.available).toBe(false);
    expect(impossible.refund.available).toBe(false);
  });

  it("allowlists only explicit HTTPS evidence origins", () => {
    expect(safeAuthorizedEvidenceUrl(
      "https://media.xlb.example/private/asset",
      ["https://media.xlb.example"],
    )).toBe("https://media.xlb.example/private/asset");
    for (const unsafe of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "file:///private/evidence.png",
      "https://evil.example/asset",
      "/api/media-assets/media-1/content",
    ]) {
      expect(safeAuthorizedEvidenceUrl(
        unsafe,
        ["https://media.xlb.example"],
      )).toBeNull();
    }
  });

  it("builds only allowlisted internal routes and requires paymentOrderId", () => {
    expect(safeCustomerOrderRelatedRoute("order-detail-1", "change"))
      .toBe("/orders/order-detail-1/change");
    expect(safeCustomerOrderRelatedRoute("../other", "refund")).toBeNull();
    expect(safeCustomerPaymentRoute("payment-order-1"))
      .toBe("/payment/payment-order-1");
    expect(safeCustomerPaymentRoute("payment/other")).toBeNull();
  });

  it("re-reads all facts before CTA navigation", async () => {
    const getOrder = vi.fn(async () => ({
      ok: true as const,
      order: order(),
    }));
    const coordinator = new CustomerOrderDetailCoordinator(api({ getOrder }));
    const nav = navigation();
    const controller = new CustomerOrderDetailActionController(nav);

    await expect(controller.execute(
      "aftersale",
      scope,
      "order-detail-1",
      coordinator,
      { complaintId: null, note: "" },
    )).resolves.toMatchObject({ status: "navigated" });
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(nav.openRoute).toHaveBeenCalledWith(
      "/orders/order-detail-1/aftersale",
    );
  });

  it("locks duplicate submissions while the first authoritative refresh is pending", async () => {
    const pending = deferred<{ ok: true; order: Order }>();
    const coordinator = new CustomerOrderDetailCoordinator(api({
      getOrder: vi.fn(() => pending.promise),
    }));
    const controller = new CustomerOrderDetailActionController(navigation());
    const first = controller.execute(
      "confirm-fulfillment",
      scope,
      "order-detail-1",
      coordinator,
      { complaintId: null, note: "" },
    );
    await expect(controller.execute(
      "confirm-fulfillment",
      scope,
      "order-detail-1",
      coordinator,
      { complaintId: null, note: "" },
    )).resolves.toEqual({ status: "duplicate" });
    pending.resolve({ ok: true, order: order() });
    await expect(first).resolves.toMatchObject({ status: "mutated" });
  });

  it("binds dispute only to a freshly read owned same-order complaint", async () => {
    const decide = vi.fn(async () => ({
      ok: true as const,
      confirmation: {
        ...evidence().confirmation!,
        status: "disputed" as const,
        complaintId: "complaint-1",
        disputedAt: timestamp,
      },
      idempotent: false,
    }));
    const coordinator = new CustomerOrderDetailCoordinator(api({
      decideFulfillmentConfirmation: decide,
    }));
    const controller = new CustomerOrderDetailActionController(navigation());

    await expect(controller.execute(
      "dispute-fulfillment",
      scope,
      "order-detail-1",
      coordinator,
      { complaintId: "foreign-complaint", note: "证据不符" },
    )).resolves.toMatchObject({
      status: "rejected",
      reasonCode: "invalid_complaint",
    });
    expect(decide).not.toHaveBeenCalled();

    await controller.execute(
      "dispute-fulfillment",
      scope,
      "order-detail-1",
      coordinator,
      { complaintId: "complaint-1", note: "证据不符" },
    );
    expect(decide).toHaveBeenCalledWith("fulfillment-1", {
      decision: "disputed",
      complaintId: "complaint-1",
      note: "证据不符",
    });
    expect(decide.mock.calls[0]?.[1]).not.toHaveProperty("idempotencyKey");
  });

  it("refreshes authoritative aggregate after a 409 without local status mutation", async () => {
    const decide = vi.fn()
      .mockRejectedValue(httpError(409, "/customer-confirmation"));
    const getOrder = vi.fn(async () => ({
      ok: true as const,
      order: order(),
    }));
    const coordinator = new CustomerOrderDetailCoordinator(api({
      decideFulfillmentConfirmation: decide,
      getOrder,
    }));
    const result = await coordinator.decideConfirmation(
      scope,
      "order-detail-1",
      "fulfillment-1",
      { decision: "confirmed" },
    );
    expect(result).toMatchObject({
      status: "conflict",
      load: { status: "ready" },
    });
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(
      result.status === "conflict" &&
      result.load.status === "ready" &&
      result.load.aggregate.order.status,
    ).toBe("pending_dispatch");
  });

  it.each([
    [401, "unauthenticated"],
    [403, "unavailable"],
    [404, "unavailable"],
    [500, "error"],
  ] as const)(
    "maps confirmation mutation HTTP %i to %s without local success",
    async (status, expected) => {
      const coordinator = new CustomerOrderDetailCoordinator(api({
        decideFulfillmentConfirmation: vi.fn().mockRejectedValue(
          httpError(status, "/customer-confirmation"),
        ),
      }));
      await expect(coordinator.decideConfirmation(
        scope,
        "order-detail-1",
        "fulfillment-1",
        { decision: "confirmed" },
      )).resolves.toMatchObject({ status: expected });
    },
  );

  it("renders partial, GAP-11, submission actions and independent empty states", () => {
    const data = {
      viewModel: {
        aggregate: aggregate({
          partial: true,
          reverses: { status: "empty" as const },
          review: { status: "empty" as const },
        }),
        availability: deriveCustomerOrderDetailAvailability(aggregate()),
        selectedComplaintId: null,
        confirmationNote: "",
        submission: null,
        notice: null,
      },
      actions: {
        onBack: vi.fn(),
        onRefresh: vi.fn(),
        onAction: vi.fn(),
        onSelectComplaint: vi.fn(),
        onChangeConfirmationNote: vi.fn(),
        onDismissNotice: vi.fn(),
      },
    };
    render(
      <CustomerOrderDetailTemplate
        slice={customerOrderDetailSlice}
        route={route()}
        state={{ status: "ready", data }}
      />,
    );
    expect(screen.getByText(/GAP-11/u)).toBeTruthy();
    expect(screen.getByText("暂无逆向申请。")).toBeTruthy();
    expect(screen.getByText("尚未评价。")).toBeTruthy();
    expect(screen.getByText(/部分关联事实暂未读取成功/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认服务完成" })
      .hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "前往支付" })
      .hasAttribute("disabled")).toBe(true);
  });

  it("expires the session seam on a 401", async () => {
    const onSessionExpired = vi.fn();
    render(
      <CustomerOrderDetailPage
        slice={customerOrderDetailSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerOrderDetailCoordinator(api({
          getOrder: vi.fn().mockRejectedValue(httpError(401)),
        }))}
        navigation={navigation()}
        onSessionExpired={onSessionExpired}
      />,
    );
    expect(await screen.findByText("登录状态已失效")).toBeTruthy();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("re-reads before a rendered confirmation click", async () => {
    const getOrder = vi.fn(async () => ({
      ok: true as const,
      order: order(),
    }));
    const decide = vi.fn(async () => ({
      ok: true as const,
      confirmation: {
        ...evidence().confirmation!,
        status: "confirmed" as const,
        confirmedAt: timestamp,
      },
      idempotent: false,
    }));
    render(
      <CustomerOrderDetailPage
        slice={customerOrderDetailSlice}
        route={route()}
        scope={scope}
        coordinator={new CustomerOrderDetailCoordinator(api({
          getOrder,
          decideFulfillmentConfirmation: decide,
        }))}
        navigation={navigation()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", {
      name: "确认履约",
    }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(getOrder.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(await screen.findByText(/服务端已确认操作/u)).toBeTruthy();
  });
});
