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
  AftersaleComplaint,
  AftersaleComplaintDetail,
} from "@xlb/types";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CUSTOMER_AFTERSALE_COMPONENTS,
  CustomerAftersaleActionController,
  CustomerAftersaleCaseTemplate,
  CustomerAftersaleCoordinator,
  CustomerAftersalePage,
  createCustomerAftersaleComponentRegistry,
  customerAftersaleFeatureRouteModule,
  customerAftersaleSlice,
  customerAftersaleTemplateRegistration,
  customerComplaintReference,
  parseCustomerAftersaleRoute,
  requesterVisibleAftersaleTimeline,
  type CustomerAftersaleNavigation,
} from "../../apps/customer/src/features/aftersale/index.js";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";

const timestamp = "2026-07-24T08:00:00.000Z";

function complaint(
  overrides: Partial<AftersaleComplaint> = {},
): AftersaleComplaint {
  return {
    complaintId: "complaint-safe-1",
    cityCode: "hangzhou",
    orderId: "order-safe-1",
    customerId: "customer-private-1",
    category: "service_quality",
    priority: "normal",
    description: "服务质量与约定不一致，需要协助处理。",
    status: "submitted",
    idempotencyKey: "customer-complaint-safe-1",
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

function detail(
  complaintOverrides: Partial<AftersaleComplaint> = {},
): AftersaleComplaintDetail {
  const current = complaint(complaintOverrides);
  return {
    complaint: current,
    repairOrders: [{
      repairOrderId: "repair-safe-1",
      cityCode: "hangzhou",
      complaintId: current.complaintId,
      orderId: current.orderId,
      workerId: "worker-private-1",
      reason: "重新检查服务结果",
      status: "requested",
      serviceNote: null,
      createdByAdminId: "admin-private-1",
      startedAt: null,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    liabilityDecision: {
      liabilityDecisionId: "liability-safe-1",
      cityCode: "hangzhou",
      complaintId: current.complaintId,
      orderId: current.orderId,
      liableParty: "platform",
      workerLiabilityPercent: 0,
      platformLiabilityPercent: 100,
      customerLiabilityPercent: 0,
      reason: "服务承诺未满足",
      decidedByAdminId: "admin-private-1",
      decidedAt: timestamp,
    },
    compensationIntents: [{
      compensationIntentId: "compensation-safe-1",
      cityCode: "hangzhou",
      complaintId: current.complaintId,
      orderId: current.orderId,
      intentType: "service_credit",
      requestedAmount: 20,
      approvedAmount: 10,
      currency: "CNY",
      reason: "服务体验补偿意向",
      status: "approved",
      providerExecutionStatus: "not_executed",
      proposedByAdminId: "admin-private-1",
      decidedByAdminId: "admin-private-2",
      decisionNote: "审核同意该意向",
      proposedAt: timestamp,
      decidedAt: timestamp,
    }],
    timeline: [{
      timelineEventId: "timeline-customer-1",
      cityCode: "hangzhou",
      orderId: current.orderId,
      complaintId: current.complaintId,
      reverseRequestId: null,
      repairOrderId: null,
      eventType: "customer_service.note",
      actorType: "customer",
      actorId: "customer-private-1",
      content: "这是顾客补充说明。",
      payload: {},
      createdAt: timestamp,
    }, {
      timelineEventId: "timeline-admin-note-1",
      cityCode: "hangzhou",
      orderId: current.orderId,
      complaintId: current.complaintId,
      reverseRequestId: null,
      repairOrderId: null,
      eventType: "customer_service.note",
      actorType: "admin",
      actorId: "admin-private-1",
      content: "后台内部研判内容",
      payload: { internal: true },
      createdAt: timestamp,
    }, {
      timelineEventId: "timeline-repair-1",
      cityCode: "hangzhou",
      orderId: current.orderId,
      complaintId: current.complaintId,
      reverseRequestId: null,
      repairOrderId: "repair-safe-1",
      eventType: "repair.created",
      actorType: "admin",
      actorId: "admin-private-1",
      content: "后台分派信息",
      payload: { workerId: "worker-private-1" },
      createdAt: timestamp,
    }],
  };
}

function orderRoute(orderId = "order-safe-1") {
  return {
    pathname: `/orders/${orderId}/aftersale`,
    pattern: "/orders/:orderId/aftersale" as const,
    params: { orderId },
    query: {},
  };
}

function detailRoute(complaintId = "complaint-safe-1") {
  return {
    pathname: `/aftersale/${complaintId}`,
    pattern: "/aftersale/:complaintId" as const,
    params: { complaintId },
    query: {},
  };
}

function navigation(): CustomerAftersaleNavigation {
  return {
    back: vi.fn(),
    openComplaint: vi.fn(),
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    createAftersaleComplaint: vi.fn().mockResolvedValue({
      ok: true,
      complaint: complaint(),
      idempotent: false,
    }),
    listAftersaleComplaints: vi.fn().mockResolvedValue({
      ok: true,
      complaints: [complaint()],
    }),
    getAftersaleComplaint: vi.fn().mockResolvedValue({
      ok: true,
      detail: detail(),
    }),
    addAftersaleComplaintNote: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

function httpError(status: number, method = "GET") {
  return new ApiClientError({
    kind: "http",
    message: `aftersale ${status}`,
    method,
    path: "/api/aftersale/complaints",
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

function readyState(
  currentDetail: AftersaleComplaintDetail = detail(),
) {
  return {
    status: "ready" as const,
    data: {
      viewModel: {
        route: {
          view: "detail" as const,
          orderId: null,
          complaintId: currentDetail.complaint.complaintId,
        },
        complaints: [],
        detail: {
          ...currentDetail,
          timeline: requesterVisibleAftersaleTimeline(currentDetail.timeline),
        },
        draft: {
          category: "service_quality" as const,
          priority: "normal" as const,
          description: "",
        },
        draftErrors: {},
        note: "",
        operation: null,
        refreshing: false,
        notice: null,
      },
      actions: {
        onBack: vi.fn(),
        onRefresh: vi.fn(),
        onOpenComplaint: vi.fn(),
        onDraftChange: vi.fn(),
        onCreateComplaint: vi.fn(),
        onNoteChange: vi.fn(),
        onAddNote: vi.fn(),
        onDismissNotice: vi.fn(),
      },
    },
  };
}

afterEach(() => cleanup());

describe("Customer CSL-13 Aftersale Complaint", () => {
  it("registers the closed L1 component plan and both guarded routes", async () => {
    const templates = new CustomerTemplateRegistry()
      .register(customerAftersaleTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerAftersaleFeatureRouteModule)
      .seal();
    expect(createCustomerAftersaleComponentRegistry().list())
      .toEqual(CUSTOMER_AFTERSALE_COMPONENTS);
    expect(templates.resolveForSlice(customerAftersaleSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(customerAftersaleSlice.guards)
      .toEqual(["session", "city", "protected-route"]);
    expect(routes.resolve("/orders/:orderId/aftersale")?.slice.id)
      .toBe("CSL-13");
    expect(routes.resolve("/aftersale/:complaintId")?.slice.id)
      .toBe("CSL-13");
    await expect(routes.resolve("/aftersale/:complaintId")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerAftersalePage);
  });

  it("rejects malicious order and complaint identifiers", () => {
    expect(parseCustomerAftersaleRoute(orderRoute())).toEqual({
      view: "order",
      orderId: "order-safe-1",
      complaintId: null,
    });
    expect(parseCustomerAftersaleRoute(detailRoute())).toEqual({
      view: "detail",
      orderId: null,
      complaintId: "complaint-safe-1",
    });
    expect(parseCustomerAftersaleRoute(orderRoute("../other"))).toBeNull();
    expect(parseCustomerAftersaleRoute(detailRoute("bad%2Fid"))).toBeNull();
  });

  it("uses formal category/priority validation and creates an idempotency key", async () => {
    const customerApi = api();
    const controller = new CustomerAftersaleActionController(
      new CustomerAftersaleCoordinator(customerApi),
      navigation(),
    );
    await expect(controller.create("order-safe-1", {
      category: "service_quality",
      priority: "normal",
      description: "短",
    }, {
      cityCode: "hangzhou",
      actorId: "customer-private-1",
    })).resolves.toMatchObject({
      status: "validation_error",
      errors: { description: expect.any(String) },
    });
    expect(customerApi.createAftersaleComplaint).not.toHaveBeenCalled();

    await expect(controller.create("order-safe-1", {
      category: "safety",
      priority: "critical",
      description: "  服务现场存在安全隐患，请协助核查。  ",
    }, {
      cityCode: "hangzhou",
      actorId: "customer-private-1",
    })).resolves.toMatchObject({ status: "success" });
    expect(customerApi.createAftersaleComplaint).toHaveBeenCalledWith({
      orderId: "order-safe-1",
      category: "safety",
      priority: "critical",
      description: "服务现场存在安全隐患，请协助核查。",
      idempotencyKey: expect.stringMatching(/^customer-complaint-/u),
    });
  });

  it("cross-checks actor, city, order and complaint scope on every response", async () => {
    const scope = {
      cityCode: "hangzhou",
      actorId: "customer-private-1",
    };
    for (const wrong of [
      complaint({ customerId: "other-customer" }),
      complaint({ cityCode: "shanghai" }),
      complaint({ orderId: "other-order" }),
    ]) {
      const coordinator = new CustomerAftersaleCoordinator(api({
        listAftersaleComplaints: vi.fn().mockResolvedValue({
          ok: true,
          complaints: [wrong],
        }),
      }));
      await expect(coordinator.loadList("order-safe-1", scope)).resolves
        .toMatchObject({
          status: "error",
          errorCode: "aftersale_response_invalid",
          retryable: false,
        });
    }

    const wrongDetail = detail();
    wrongDetail.repairOrders[0]!.orderId = "other-order";
    await expect(new CustomerAftersaleCoordinator(api({
      getAftersaleComplaint: vi.fn().mockResolvedValue({
        ok: true,
        detail: wrongDetail,
      }),
    })).loadDetail("complaint-safe-1", scope)).resolves.toMatchObject({
      status: "error",
      errorCode: "aftersale_response_invalid",
    });
  });

  it("filters internal notes, raw actors and payloads while keeping formal case events", async () => {
    const result = await new CustomerAftersaleCoordinator(api()).loadDetail(
      "complaint-safe-1",
      { cityCode: "hangzhou", actorId: "customer-private-1" },
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.detail.timeline).toEqual([
      expect.objectContaining({
        timelineEventId: "timeline-customer-1",
        content: "这是顾客补充说明。",
      }),
      expect.objectContaining({
        timelineEventId: "timeline-repair-1",
        content: null,
      }),
    ]);
    expect(JSON.stringify(result.detail.timeline))
      .not.toContain("后台内部研判内容");
    expect(JSON.stringify(result.detail.timeline))
      .not.toContain("worker-private-1");
    expect(JSON.stringify(result.detail.timeline))
      .not.toContain("admin-private-1");
  });

  it("renders Complaint, Repair, Responsibility, compensation intent and safe GAP-12 copy", () => {
    render(
      <CustomerAftersaleCaseTemplate
        slice={customerAftersaleSlice}
        route={detailRoute()}
        state={readyState()}
      />,
    );
    expect(screen.getByText("投诉处理进展")).toBeTruthy();
    expect(screen.getByText("重新检查服务结果")).toBeTruthy();
    expect(screen.getByText("服务承诺未满足")).toBeTruthy();
    expect(screen.getByText("补偿意向 · 尚未执行")).toBeTruthy();
    expect(screen.getByText("20 CNY")).toBeTruthy();
    expect(screen.getByText("10 CNY")).toBeTruthy();
    expect(screen.getByText("这是顾客补充说明。")).toBeTruthy();
    expect(screen.queryByText("后台内部研判内容")).toBeNull();
  });

  it("highlights waiting_customer and covers no-repair/no-compensation", () => {
    const waiting = detail({ status: "waiting_customer" });
    waiting.repairOrders = [];
    waiting.liabilityDecision = null;
    waiting.compensationIntents = [];
    render(
      <CustomerAftersaleCaseTemplate
        slice={customerAftersaleSlice}
        route={detailRoute()}
        state={readyState(waiting)}
      />,
    );
    expect(screen.getAllByText("等待你的响应").length).toBeGreaterThan(0);
    expect(screen.getByText("暂无返修安排")).toBeTruthy();
    expect(screen.getByText("暂无责任判定")).toBeTruthy();
    expect(screen.getByText("暂无补偿意向")).toBeTruthy();
  });

  it("locks creating-complaint and adding-note submission states", () => {
    const baseDetailState = readyState();
    const detailState = {
      ...baseDetailState,
      data: {
        ...baseDetailState.data,
        viewModel: {
          ...baseDetailState.data.viewModel,
          operation: "adding-note" as const,
        },
      },
    };
    render(
      <CustomerAftersaleCaseTemplate
        slice={customerAftersaleSlice}
        route={detailRoute()}
        state={detailState}
      />,
    );
    expect(screen.getByRole("button", { name: "正在添加备注" })
      .hasAttribute("disabled")).toBe(true);
    cleanup();

    render(
      <CustomerAftersaleCaseTemplate
        slice={customerAftersaleSlice}
        route={orderRoute()}
        state={{
          status: "ready",
          data: {
            viewModel: {
              ...readyState().data.viewModel,
              route: {
                view: "order",
                orderId: "order-safe-1",
                complaintId: null,
              },
              complaints: [],
              detail: null,
              draft: {
                category: "service_quality",
                priority: "normal",
                description: "现场服务结果与约定不一致。",
              },
              operation: "creating-complaint",
            },
            actions: readyState().data.actions,
          },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "正在创建投诉" })
      .hasAttribute("disabled")).toBe(true);
  });

  it("refreshes authoritatively after note success and complaint idempotent replay", async () => {
    const customerApi = api({
      getAftersaleComplaint: vi.fn()
        .mockResolvedValueOnce({ ok: true, detail: detail() })
        .mockResolvedValueOnce({ ok: true, detail: detail({
          status: "waiting_customer",
        }) }),
    });
    render(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={detailRoute()}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={new CustomerAftersaleCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("投诉处理进展");
    fireEvent.change(screen.getByLabelText("说明内容"), {
      target: { value: "请查看我补充的现场说明。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交备注" }));
    expect(await screen.findByText(/详情已重新读取/)).toBeTruthy();
    expect(customerApi.addAftersaleComplaintNote).toHaveBeenCalledWith(
      "complaint-safe-1",
      "请查看我补充的现场说明。",
    );
    expect(customerApi.getAftersaleComplaint).toHaveBeenCalledTimes(2);
    cleanup();

    const listApi = api({
      listAftersaleComplaints: vi.fn()
        .mockResolvedValueOnce({ ok: true, complaints: [] })
        .mockResolvedValueOnce({ ok: true, complaints: [complaint()] }),
      createAftersaleComplaint: vi.fn().mockResolvedValue({
        ok: true,
        complaint: complaint(),
        idempotent: true,
      }),
    });
    render(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={orderRoute()}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={new CustomerAftersaleCoordinator(listApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("暂无投诉记录");
    fireEvent.change(screen.getByPlaceholderText("请说明发生经过和希望获得的处理"), {
      target: { value: "服务质量与约定不一致，请协助处理。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交投诉" }));
    expect(await screen.findByText(/幂等重放回执/)).toBeTruthy();
    expect(listApi.listAftersaleComplaints).toHaveBeenCalledTimes(2);
  });

  it("refreshes on 409 without advancing local complaint state", async () => {
    const changed = complaint({ status: "triaged" });
    const customerApi = api({
      listAftersaleComplaints: vi.fn()
        .mockResolvedValueOnce({ ok: true, complaints: [] })
        .mockResolvedValueOnce({ ok: true, complaints: [changed] }),
      createAftersaleComplaint: vi.fn().mockRejectedValue(httpError(409, "POST")),
    });
    render(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={orderRoute()}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={new CustomerAftersaleCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("暂无投诉记录");
    fireEvent.change(screen.getByPlaceholderText("请说明发生经过和希望获得的处理"), {
      target: { value: "现场服务结果与约定不一致。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交投诉" }));
    expect(await screen.findByText(/已权威刷新/)).toBeTruthy();
    expect(screen.getByText("已受理")).toBeTruthy();
    expect(customerApi.listAftersaleComplaints).toHaveBeenCalledTimes(2);
  });

  it("converges 403/404, expires on 401 and exposes retry for 5xx", async () => {
    for (const status of [403, 404]) {
      const { unmount } = render(
        <CustomerAftersalePage
          slice={customerAftersaleSlice}
          route={detailRoute()}
          cityCode="hangzhou"
          actorId="customer-private-1"
          coordinator={new CustomerAftersaleCoordinator(api({
            getAftersaleComplaint: vi.fn().mockRejectedValue(httpError(status)),
          }))}
          navigation={navigation()}
        />,
      );
      expect(await screen.findByText("无法查看此售后事项")).toBeTruthy();
      expect(screen.getByText(/不会透露资源归属/)).toBeTruthy();
      unmount();
    }

    const expired = vi.fn();
    render(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={detailRoute()}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={new CustomerAftersaleCoordinator(api({
          getAftersaleComplaint: vi.fn().mockRejectedValue(httpError(401)),
        }))}
        navigation={navigation()}
        onSessionExpired={expired}
      />,
    );
    await waitFor(() => expect(expired).toHaveBeenCalledTimes(1));
    cleanup();

    render(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={detailRoute()}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={new CustomerAftersaleCoordinator(api({
          getAftersaleComplaint: vi.fn().mockRejectedValue(httpError(503)),
        }))}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("售后记录加载失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy();
  });

  it("keeps latest-wins across order, complaint and scope changes", async () => {
    const first = deferred<{ ok: true; complaints: AftersaleComplaint[] }>();
    const secondComplaint = complaint({
      complaintId: "complaint-safe-2",
      orderId: "order-safe-2",
      description: "第二个订单的正式投诉。",
    });
    const customerApi = api({
      listAftersaleComplaints: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValueOnce({ ok: true, complaints: [secondComplaint] }),
    });
    const coordinator = new CustomerAftersaleCoordinator(customerApi);
    const { rerender } = render(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={orderRoute("order-safe-1")}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={coordinator}
        navigation={navigation()}
      />,
    );
    rerender(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={orderRoute("order-safe-2")}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={coordinator}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("第二个订单的正式投诉。")).toBeTruthy();
    first.resolve({ ok: true, complaints: [complaint()] });
    await waitFor(() => {
      expect(screen.queryByText("服务质量与约定不一致，需要协助处理。"))
        .toBeNull();
    });
    cleanup();

    const firstDetail = deferred<{
      ok: true;
      detail: AftersaleComplaintDetail;
    }>();
    const secondDetail: AftersaleComplaintDetail = {
      complaint: complaint({
        complaintId: "complaint-safe-2",
        orderId: "order-safe-2",
        cityCode: "shanghai",
        customerId: "customer-private-2",
        description: "第二个 actor 与城市作用域的投诉。",
      }),
      repairOrders: [],
      liabilityDecision: null,
      compensationIntents: [],
      timeline: [],
    };
    const scopedApi = api({
      getAftersaleComplaint: vi.fn()
        .mockImplementationOnce(() => firstDetail.promise)
        .mockResolvedValueOnce({ ok: true, detail: secondDetail }),
    });
    const scopedCoordinator = new CustomerAftersaleCoordinator(scopedApi);
    const scopedRender = render(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={detailRoute("complaint-safe-1")}
        cityCode="hangzhou"
        actorId="customer-private-1"
        coordinator={scopedCoordinator}
        navigation={navigation()}
      />,
    );
    scopedRender.rerender(
      <CustomerAftersalePage
        slice={customerAftersaleSlice}
        route={detailRoute("complaint-safe-2")}
        cityCode="shanghai"
        actorId="customer-private-2"
        coordinator={scopedCoordinator}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("第二个 actor 与城市作用域的投诉。"))
      .toBeTruthy();
    firstDetail.resolve({ ok: true, detail: detail() });
    await waitFor(() => {
      expect(screen.queryByText("服务质量与约定不一致，需要协助处理。"))
        .toBeNull();
    });
  });

  it("exports a read-only disputed-confirmation complaint seam", () => {
    expect(customerComplaintReference(complaint())).toEqual({
      complaintId: "complaint-safe-1",
      orderId: "order-safe-1",
      status: "submitted",
    });
  });

  it("renders loading, no-complaints, conflict and unavailable boundaries", () => {
    const base = {
      slice: customerAftersaleSlice,
      route: orderRoute(),
    };
    const { rerender } = render(
      <CustomerAftersaleCaseTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在读取售后记录")).toBeTruthy();
    rerender(
      <CustomerAftersaleCaseTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "aftersale_changed",
          refreshRequired: true,
          recovery: { actionKey: "retry", labelKey: "重新读取" },
        }}
      />,
    );
    expect(screen.getByText("售后状态已变化")).toBeTruthy();
    rerender(
      <CustomerAftersaleCaseTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.aftersale",
          reasonCode: "aftersale_api_unavailable",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会以本地数据替代/)).toBeTruthy();
  });
});
