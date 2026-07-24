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
  SupportCsatResponse,
  SupportTicket,
  SupportTicketDetailResponse,
  SupportTicketEvent,
  SupportTicketListResponse,
  SupportTicketMutationResponse,
  SupportTicketResponse,
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
  CUSTOMER_SUPPORT_TICKET_CORE_COMPONENTS,
  CustomerSupportTicketPage,
  CustomerSupportTicketTemplate,
  SupportTicketActionController,
  SupportTicketCoordinator,
  createCustomerSupportTicketComponentRegistry,
  customerSupportTicketRouteModule,
  customerSupportTicketSlice,
  customerSupportTicketTemplateRegistration,
  mergeSupportTicketPages,
  parseCustomerSupportTicketPresentationPlan,
  parseCustomerSupportTicketRoute,
  requesterVisibleSupportTicketEvents,
  type CustomerSupportTicketNavigation,
} from "../../apps/customer/src/features/support/index.js";

const timestamp = "2026-07-24T08:00:00.000Z";

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    ticketId: "ticket-safe_1",
    cityCode: "hangzhou",
    source: "customer",
    requesterId: "customer-current",
    businessClientId: null,
    type: "order_question",
    priority: "normal",
    status: "open",
    subject: "订单服务时间需要确认",
    description: "我想确认服务人员预计何时到达。",
    relatedOrderId: null,
    relatedWorkerId: null,
    linkedAftersaleComplaintId: null,
    assignedAgentId: null,
    assignedSkillGroupId: null,
    routingLanguage: null,
    slaFirstResponseDueAt: null,
    slaResolutionDueAt: null,
    firstRespondedAt: null,
    slaFirstResponseBreachedAt: null,
    slaResolutionBreachedAt: null,
    resolvedAt: null,
    closedAt: null,
    resolutionCode: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function event(
  overrides: Partial<SupportTicketEvent> = {},
): SupportTicketEvent {
  return {
    ticketEventId: "ticket-event-1",
    cityCode: "hangzhou",
    ticketId: "ticket-safe_1",
    eventType: "created",
    actorType: "customer",
    actorId: "customer-current",
    visibility: "all",
    content: "我想确认服务人员预计何时到达。",
    payload: {},
    createdAt: timestamp,
    ...overrides,
  };
}

function listResponse(
  tickets: SupportTicket[] = [ticket()],
  nextCursor: string | null = null,
): SupportTicketListResponse {
  return { ok: true, tickets, nextCursor };
}

function detailResponse(
  currentTicket: SupportTicket = ticket(),
  events: SupportTicketEvent[] = [event()],
): SupportTicketDetailResponse {
  return {
    ok: true,
    detail: { ticket: currentTicket, events },
  };
}

function mutationResponse(
  currentTicket: SupportTicket,
  currentEvent: SupportTicketEvent,
): SupportTicketMutationResponse {
  return {
    ok: true,
    ticket: currentTicket,
    event: currentEvent,
    idempotent: false,
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    createSupportTicket: vi.fn<() => Promise<SupportTicketResponse>>()
      .mockResolvedValue({ ok: true, ticket: ticket() }),
    listSupportTickets: vi.fn<() => Promise<SupportTicketListResponse>>()
      .mockResolvedValue(listResponse()),
    getSupportTicket: vi.fn<() => Promise<SupportTicketDetailResponse>>()
      .mockResolvedValue(detailResponse()),
    addSupportTicketComment: vi.fn<() => Promise<SupportTicketMutationResponse>>()
      .mockResolvedValue(mutationResponse(
        ticket(),
        event({
          ticketEventId: "ticket-event-comment-1",
          eventType: "commented",
          visibility: "requester",
          content: "补充门牌信息。",
        }),
      )),
    reopenSupportTicket: vi.fn<() => Promise<SupportTicketMutationResponse>>()
      .mockResolvedValue(mutationResponse(
        ticket({ status: "processing", version: 2 }),
        event({
          ticketEventId: "ticket-event-reopen-1",
          eventType: "reopened",
          content: "仍需协助。",
        }),
      )),
    submitSupportTicketCsat: vi.fn<() => Promise<SupportCsatResponse>>()
      .mockResolvedValue({
        ok: true,
        csat: {
          csatId: "csat-1",
          cityCode: "hangzhou",
          targetType: "ticket",
          targetId: "ticket-safe_1",
          score: 5,
          comment: null,
        },
      }),
    ...overrides,
  };
}

function route(
  pattern:
    | "/support"
    | "/support/tickets"
    | "/support/tickets/:ticketId",
  params: Readonly<Record<string, string>> = {},
  query: Readonly<Record<string, string>> = {},
) {
  return {
    pathname: pattern === "/support/tickets/:ticketId"
      ? `/support/tickets/${params.ticketId ?? ""}`
      : pattern,
    pattern,
    params,
    query,
  };
}

function navigation(): CustomerSupportTicketNavigation {
  return {
    back: vi.fn(),
    openTickets: vi.fn(),
    openTicket: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const scope = Object.freeze({
  cityCode: "hangzhou" as const,
  actorId: "customer-current",
});

describe("Customer CSL-15 Support Tickets", () => {
  it("registers the three fixed L2 routes with all required guards", async () => {
    const componentRegistry = createCustomerSupportTicketComponentRegistry();
    const templateRegistry = new CustomerTemplateRegistry()
      .register(customerSupportTicketTemplateRegistration)
      .seal();
    const routeRegistry = new CustomerFeatureRouteRegistry()
      .register(customerSupportTicketRouteModule)
      .seal();

    expect(componentRegistry.list()).toEqual(
      CUSTOMER_SUPPORT_TICKET_CORE_COMPONENTS,
    );
    expect(
      templateRegistry.resolveForSlice(customerSupportTicketSlice),
    ).toMatchObject({
      orchestrationLevel: "L2",
      operationalManifest: "limited",
    });
    expect(customerSupportTicketSlice.guards).toEqual([
      "session",
      "city",
      "protected-route",
    ]);
    for (const path of [
      "/support",
      "/support/tickets",
      "/support/tickets/:ticketId",
    ] as const) {
      expect(routeRegistry.resolve(path)?.slice.id).toBe("CSL-15");
    }
    await expect(routeRegistry.resolve("/support")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerSupportTicketPage);
  });

  it("strictly validates ticket IDs, cursors and optional business references", () => {
    expect(parseCustomerSupportTicketRoute(route("/support"))).toEqual({
      view: "hub",
      references: { orderId: null, complaintId: null },
    });
    expect(parseCustomerSupportTicketRoute(route(
      "/support/tickets",
      {},
      {
        orderId: "order-safe_1",
        complaintId: "complaint-safe_1",
        cursor: "cursor-page_2",
      },
    ))).toEqual({
      view: "tickets",
      references: {
        orderId: "order-safe_1",
        complaintId: "complaint-safe_1",
      },
      cursor: "cursor-page_2",
    });
    expect(parseCustomerSupportTicketRoute(route(
      "/support/tickets/:ticketId",
      { ticketId: "ticket-safe_1" },
    ))).toEqual({ view: "detail", ticketId: "ticket-safe_1" });
    expect(parseCustomerSupportTicketRoute(route(
      "/support/tickets/:ticketId",
      { ticketId: "../another-customer" },
    ))).toBeNull();
    expect(parseCustomerSupportTicketRoute(route(
      "/support/tickets",
      {},
      { complaintId: "complaint-without-order" },
    ))).toBeNull();
    expect(parseCustomerSupportTicketRoute(route(
      "/support/tickets",
      {},
      { cursor: "../unsafe" },
    ))).toBeNull();
  });

  it("accepts only presentation-only FAQ/help slots and rejects operational keys", () => {
    expect(parseCustomerSupportTicketPresentationPlan({
      slots: [{
        type: "faq",
        position: "hub-after-channels",
        title: "提交前可以准备什么？",
        body: "准备订单号有助于服务端关联事项。",
        items: ["说明发生时间", "不要提交账户凭据"],
      }],
    }).slots).toHaveLength(1);

    for (const plan of [
      { ticketTypes: ["other"], slots: [] },
      { priority: "critical", slots: [] },
      { status: "closed", slots: [] },
      { action: { method: "POST" }, slots: [] },
      {
        slots: [{
          type: "faq",
          position: "hub-after-channels",
          title: "帮助",
          body: "说明",
          visibility: "internal",
        }],
      },
    ]) {
      expect(parseCustomerSupportTicketPresentationPlan(plan).slots).toEqual([]);
    }
  });

  it("keeps the Support Hub conversation entry explicitly unavailable for GAP-07", async () => {
    render(
      <CustomerSupportTicketPage
        slice={customerSupportTicketSlice}
        route={route("/support")}
        cityCode="hangzhou"
        actorId="customer-current"
        coordinator={new SupportTicketCoordinator(api())}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByRole("heading", { name: "实时会话" })).toBeTruthy();
    const unavailable = screen.getByRole("button", { name: "暂未开放" });
    expect((unavailable as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/GAP-07/)).toBeTruthy();
  });

  it("deduplicates cursor pages with the newest authoritative version", () => {
    const newest = ticket({ version: 3, subject: "服务端新版本" });
    expect(mergeSupportTicketPages(
      [newest],
      [
        ticket({ version: 2, subject: "陈旧重复项" }),
        ticket({ ticketId: "ticket-safe_2", subject: "第二个工单" }),
      ],
    )).toEqual([
      newest,
      expect.objectContaining({ ticketId: "ticket-safe_2" }),
    ]);
  });

  it("loads the next opaque cursor page and deduplicates overlaps", async () => {
    const second = ticket({
      ticketId: "ticket-safe_2",
      subject: "第二个工单",
    });
    const customerApi = api({
      listSupportTickets: vi.fn()
        .mockResolvedValueOnce(listResponse([ticket()], "cursor-next_2"))
        .mockResolvedValueOnce(listResponse([
          ticket({ version: 2, subject: "刷新后的第一个工单" }),
          second,
        ])),
    });
    render(
      <CustomerSupportTicketPage
        slice={customerSupportTicketSlice}
        route={route("/support/tickets")}
        cityCode="hangzhou"
        actorId="customer-current"
        coordinator={new SupportTicketCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("订单服务时间需要确认");
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(await screen.findByText("刷新后的第一个工单")).toBeTruthy();
    expect(screen.getByText("第二个工单")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(customerApi.listSupportTickets).toHaveBeenNthCalledWith(2, {
      source: "customer",
      limit: 20,
      cursor: "cursor-next_2",
    });
  });

  it("rejects any internal event before it enters the requester ViewModel", async () => {
    const internal = event({
      ticketEventId: "internal-event",
      visibility: "internal",
      actorType: "operator",
      actorId: "operator-private",
      content: "内部诊断信息",
    });
    expect(requesterVisibleSupportTicketEvents([event(), internal])).toEqual([
      event(),
    ]);

    const coordinator = new SupportTicketCoordinator(api({
      getSupportTicket: vi.fn().mockResolvedValue(
        detailResponse(ticket(), [event(), internal]),
      ),
    }));
    await expect(coordinator.loadDetail("ticket-safe_1", scope)).resolves
      .toEqual({
        status: "unavailable",
        capability: "customer.support.tickets",
        reasonCode: "support_ticket_visibility_violation",
      });
  });

  it("verifies actor/city scope and safely converges 403/404 without existence leaks", async () => {
    const crossActor = new SupportTicketCoordinator(api({
      listSupportTickets: vi.fn().mockResolvedValue(
        listResponse([ticket({ requesterId: "another-customer" })]),
      ),
    }));
    await expect(crossActor.loadList(scope)).resolves.toMatchObject({
      status: "unavailable",
      reasonCode: "support_ticket_scope_violation",
    });

    for (const status of [403, 404]) {
      const coordinator = new SupportTicketCoordinator(api({
        getSupportTicket: vi.fn().mockRejectedValue(new ApiClientError({
          kind: "http",
          message: "hidden",
          method: "GET",
          path: "/api/support/tickets/ticket-safe_1",
          status,
        })),
      }));
      await expect(coordinator.loadDetail("ticket-safe_1", scope)).resolves
        .toEqual({ status: "not_found" });
    }
  });

  it("maps 401 to the session-expiry seam and 5xx to a retryable error", async () => {
    const expired = new SupportTicketCoordinator(api({
      listSupportTickets: vi.fn().mockRejectedValue(new ApiClientError({
        kind: "http",
        message: "expired",
        method: "GET",
        path: "/api/support/tickets",
        status: 401,
      })),
    }));
    await expect(expired.loadList(scope)).resolves.toEqual({
      status: "unauthenticated",
    });

    const failed = new SupportTicketCoordinator(api({
      listSupportTickets: vi.fn().mockRejectedValue(new ApiClientError({
        kind: "http",
        message: "failed",
        method: "GET",
        path: "/api/support/tickets",
        status: 500,
      })),
    }));
    await expect(failed.loadList(scope)).resolves.toEqual({
      status: "error",
      errorCode: "support_ticket_load_failed",
      retryable: true,
    });
  });

  it("notifies the app session-expiry seam when a live page receives 401", async () => {
    const onSessionExpired = vi.fn();
    const customerApi = api({
      listSupportTickets: vi.fn().mockRejectedValue(new ApiClientError({
        kind: "http",
        message: "expired",
        method: "GET",
        path: "/api/support/tickets",
        status: 401,
      })),
    });
    render(
      <CustomerSupportTicketPage
        slice={customerSupportTicketSlice}
        route={route("/support/tickets")}
        cityCode="hangzhou"
        actorId="customer-current"
        coordinator={new SupportTicketCoordinator(customerApi)}
        navigation={navigation()}
        onSessionExpired={onSessionExpired}
      />,
    );
    await screen.findByText("客服工单加载失败");
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("locks duplicate creates and sends only the formal idempotent request contract", async () => {
    const pending = deferred<SupportTicketResponse>();
    const customerApi = api({
      createSupportTicket: vi.fn(() => pending.promise),
    });
    const coordinator = new SupportTicketCoordinator(customerApi);
    const controller = new SupportTicketActionController(
      coordinator,
      navigation(),
    );
    const draft = {
      type: "order_question" as const,
      priority: "normal" as const,
      subject: "确认服务时间",
      description: "需要确认服务人员到达时间。",
      orderId: "order-safe_1",
      complaintId: "",
    };

    const first = controller.create(draft, scope);
    await expect(controller.create(draft, scope)).resolves.toEqual({
      status: "conflict",
      reasonCode: "request_in_flight",
    });
    expect(customerApi.createSupportTicket).toHaveBeenCalledTimes(1);
    expect(customerApi.createSupportTicket).toHaveBeenCalledWith({
      type: "order_question",
      priority: "normal",
      subject: "确认服务时间",
      description: "需要确认服务人员到达时间。",
      relatedOrderId: "order-safe_1",
      idempotencyKey: expect.stringMatching(/^customer-support-create-/u),
    });
    pending.resolve({ ok: true, ticket: ticket() });
    await expect(first).resolves.toMatchObject({ status: "success" });
  });

  it("creates through the formal API, then reads authority before navigating", async () => {
    const customerApi = api({
      listSupportTickets: vi.fn().mockResolvedValue(listResponse([])),
    });
    const nav = navigation();
    render(
      <CustomerSupportTicketPage
        slice={customerSupportTicketSlice}
        route={route("/support/tickets")}
        cityCode="hangzhou"
        actorId="customer-current"
        coordinator={new SupportTicketCoordinator(customerApi)}
        navigation={nav}
      />,
    );

    await screen.findByText("还没有客服工单");
    fireEvent.change(screen.getByLabelText("问题主题"), {
      target: { value: "确认服务时间" },
    });
    fireEvent.change(screen.getByLabelText("问题描述"), {
      target: { value: "需要确认服务人员到达时间。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交工单" }));

    await waitFor(() => expect(customerApi.createSupportTicket)
      .toHaveBeenCalledTimes(1));
    await waitFor(() => expect(customerApi.getSupportTicket)
      .toHaveBeenCalledWith("ticket-safe_1"));
    expect(nav.openTicket).toHaveBeenCalledWith("ticket-safe_1");
  });

  it("uses latest-wins when an older list resolves after a detail request", async () => {
    const staleList = deferred<SupportTicketListResponse>();
    const customerApi = api({
      listSupportTickets: vi.fn(() => staleList.promise),
    });
    const coordinator = new SupportTicketCoordinator(customerApi);
    const props = {
      slice: customerSupportTicketSlice,
      cityCode: "hangzhou" as const,
      actorId: "customer-current",
      coordinator,
      navigation: navigation(),
    };
    const { rerender } = render(
      <CustomerSupportTicketPage
        {...props}
        route={route("/support/tickets")}
      />,
    );
    rerender(
      <CustomerSupportTicketPage
        {...props}
        route={route(
          "/support/tickets/:ticketId",
          { ticketId: "ticket-safe_1" },
        )}
      />,
    );

    expect(await screen.findByRole("heading", {
      name: "订单服务时间需要确认",
    })).toBeTruthy();
    staleList.resolve(listResponse([
      ticket({ ticketId: "ticket-stale", subject: "陈旧列表结果" }),
    ]));
    await waitFor(() => {
      expect(screen.queryByText("陈旧列表结果")).toBeNull();
    });
    expect(screen.getByText("处理时间线")).toBeTruthy();
  });

  it("posts requester comments without invented CAS and refreshes the timeline", async () => {
    const added = event({
      ticketEventId: "ticket-event-comment-1",
      eventType: "commented",
      visibility: "requester",
      content: "补充门牌信息。",
    });
    const customerApi = api({
      getSupportTicket: vi.fn()
        .mockResolvedValueOnce(detailResponse())
        .mockResolvedValueOnce(detailResponse(ticket(), [event(), added])),
    });
    render(
      <CustomerSupportTicketPage
        slice={customerSupportTicketSlice}
        route={route(
          "/support/tickets/:ticketId",
          { ticketId: "ticket-safe_1" },
        )}
        cityCode="hangzhou"
        actorId="customer-current"
        coordinator={new SupportTicketCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );

    await screen.findByText("补充留言");
    fireEvent.change(screen.getByLabelText("留言内容"), {
      target: { value: "补充门牌信息。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交留言" }));
    expect(await screen.findByText("留言已获服务端回执，并已刷新工单时间线。"))
      .toBeTruthy();
    expect(customerApi.addSupportTicketComment).toHaveBeenCalledWith(
      "ticket-safe_1",
      {
        content: "补充门牌信息。",
        idempotencyKey: expect.stringMatching(/^customer-support-comment-/u),
      },
    );
    expect(
      customerApi.addSupportTicketComment.mock.calls[0]?.[1],
    ).not.toHaveProperty("expectedVersion");
    expect(customerApi.getSupportTicket).toHaveBeenCalledTimes(2);
  });

  it("reopens only a resolved ticket and does not invent requester CAS", async () => {
    const resolved = ticket({
      status: "resolved",
      resolvedAt: timestamp,
      resolutionCode: "answered",
    });
    const customerApi = api();
    const controller = new SupportTicketActionController(
      new SupportTicketCoordinator(customerApi),
      navigation(),
    );
    await expect(controller.reopen(resolved, "仍需协助。", scope)).resolves
      .toMatchObject({ status: "success" });
    expect(customerApi.reopenSupportTicket).toHaveBeenCalledWith(
      "ticket-safe_1",
      {
        reason: "仍需协助。",
        idempotencyKey: expect.stringMatching(/^customer-support-reopen-/u),
      },
    );
    expect(
      customerApi.reopenSupportTicket.mock.calls[0]?.[1],
    ).not.toHaveProperty("expectedVersion");

    await expect(controller.reopen(ticket(), "", scope)).resolves.toEqual({
      status: "conflict",
      reasonCode: "support_ticket_changed",
    });
    expect(customerApi.reopenSupportTicket).toHaveBeenCalledTimes(1);
  });

  it("shows reopen only for resolved and CSAT only for closed server states", () => {
    const base = {
      slice: customerSupportTicketSlice,
      route: route(
        "/support/tickets/:ticketId",
        { ticketId: "ticket-safe_1" },
      ),
      operationalManifest: null,
    };
    const actions = {
      onBack: vi.fn(),
      onOpenTickets: vi.fn(),
      onOpenTicket: vi.fn(),
      onRefresh: vi.fn(),
      onLoadMore: vi.fn(),
      onDraftChange: vi.fn(),
      onCreate: vi.fn(),
      onCommentChange: vi.fn(),
      onComment: vi.fn(),
      onReopenReasonChange: vi.fn(),
      onReopen: vi.fn(),
      onCsatScoreChange: vi.fn(),
      onCsatCommentChange: vi.fn(),
      onSubmitCsat: vi.fn(),
      onDismissNotice: vi.fn(),
    };
    const viewModel = {
      route: { view: "detail" as const, ticketId: "ticket-safe_1" },
      tickets: [],
      nextCursor: null,
      detail: {
        ticket: ticket({
          status: "resolved",
          resolvedAt: timestamp,
          resolutionCode: "answered",
        }),
        events: [event()],
      },
      refreshing: false,
      loadingMore: false,
      operation: null,
      notice: null,
      draft: {
        type: "order_question" as const,
        priority: "normal" as const,
        subject: "",
        description: "",
        orderId: "",
        complaintId: "",
      },
      draftErrors: {},
      comment: "",
      reopenReason: "",
      csatScore: null,
      csatComment: "",
      csatReceipt: null,
      csatServerDecided: false,
    };
    const { rerender } = render(
      <CustomerSupportTicketTemplate
        {...base}
        state={{ status: "ready", data: { viewModel, actions } }}
      />,
    );
    expect(screen.getByRole("button", { name: "请求重开" })).toBeTruthy();
    expect(screen.queryByText("满意度评分")).toBeNull();

    rerender(
      <CustomerSupportTicketTemplate
        {...base}
        state={{
          status: "ready",
          data: {
            viewModel: {
              ...viewModel,
              detail: {
                ticket: ticket({
                  status: "closed",
                  resolvedAt: timestamp,
                  resolutionCode: "answered",
                  closedAt: timestamp,
                }),
                events: [event()],
              },
            },
            actions,
          },
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "请求重开" })).toBeNull();
    expect(screen.queryByText("补充留言")).toBeNull();
    expect(screen.getByText("满意度评分")).toBeTruthy();
  });

  it("lets the server decide CSAT-once conflicts and does not replay", async () => {
    const closed = ticket({
      status: "closed",
      resolvedAt: timestamp,
      resolutionCode: "answered",
      closedAt: timestamp,
    });
    const conflict = new ApiClientError({
      kind: "http",
      message: "target already rated",
      method: "POST",
      path: "/api/support/tickets/ticket-safe_1/csat",
      status: 409,
    });
    const customerApi = api({
      getSupportTicket: vi.fn().mockResolvedValue(
        detailResponse(closed, [event()]),
      ),
      submitSupportTicketCsat: vi.fn().mockRejectedValue(conflict),
    });
    render(
      <CustomerSupportTicketPage
        slice={customerSupportTicketSlice}
        route={route(
          "/support/tickets/:ticketId",
          { ticketId: "ticket-safe_1" },
        )}
        cityCode="hangzhou"
        actorId="customer-current"
        coordinator={new SupportTicketCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("满意度评分");
    fireEvent.click(screen.getByLabelText("5 分"));
    fireEvent.click(screen.getByRole("button", { name: "提交评价" }));

    expect(await screen.findByText("服务端已裁决该工单的评价状态"))
      .toBeTruthy();
    expect(customerApi.submitSupportTicketCsat).toHaveBeenCalledTimes(1);
    expect(customerApi.submitSupportTicketCsat).toHaveBeenCalledWith(
      "ticket-safe_1",
      {
        score: 5,
        idempotencyKey: expect.stringMatching(/^customer-support-csat-/u),
      },
    );
    expect(
      customerApi.submitSupportTicketCsat.mock.calls[0]?.[1],
    ).not.toHaveProperty("expectedVersion");
  });

  it("renders loading, empty, error, conflict and unavailable boundaries", () => {
    const base = {
      slice: customerSupportTicketSlice,
      route: route("/support/tickets"),
      operationalManifest: null,
    };
    const { rerender } = render(
      <CustomerSupportTicketTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在读取客服工单")).toBeTruthy();

    rerender(
      <CustomerSupportTicketTemplate
        {...base}
        state={{
          status: "empty",
          reasonCode: "no_tickets",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("还没有客服工单")).toBeTruthy();

    rerender(
      <CustomerSupportTicketTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "support_ticket_load_failed",
          retryable: true,
          recovery: { actionKey: "retry", labelKey: "重试" },
        }}
      />,
    );
    expect(screen.getByText("客服工单加载失败")).toBeTruthy();

    rerender(
      <CustomerSupportTicketTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "support_ticket_changed",
          refreshRequired: true,
          recovery: { actionKey: "refresh", labelKey: "刷新" },
        }}
      />,
    );
    expect(screen.getByText("工单状态已变化")).toBeTruthy();

    rerender(
      <CustomerSupportTicketTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.support.tickets",
          reasonCode: "support_ticket_visibility_violation",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/内部事件/)).toBeTruthy();
  });
});
