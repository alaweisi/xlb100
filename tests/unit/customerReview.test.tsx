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
  CustomerOrderReviewView,
  ReviewAppeal,
  ReviewVisibility,
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
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CUSTOMER_REVIEW_COMPONENTS,
  CustomerReviewActionController,
  CustomerReviewCoordinator,
  CustomerReviewPage,
  CustomerReviewTemplate,
  createCustomerReviewComponentRegistry,
  customerReviewFeatureRouteModule,
  customerReviewSlice,
  customerReviewTemplateRegistration,
  parseCustomerReviewRoute,
  type CustomerReviewNavigation,
} from "../../apps/customer/src/features/review/index.js";

const timestamp = "2026-07-24T08:00:00.000Z";

function appeal(
  overrides: Partial<ReviewAppeal> = {},
): ReviewAppeal {
  return {
    appealId: "rap-safe-1",
    cityCode: "hangzhou",
    reviewId: "review-safe-1",
    moderationVersion: 2,
    subjectType: "customer",
    subjectId: "customer-private-1",
    reason: "希望复核当前隐藏决定。",
    status: "open",
    version: 1,
    resolutionReason: null,
    openedAt: timestamp,
    resolvedAt: null,
    resolvedByAdminId: null,
    ...overrides,
  };
}

function reviewView(
  visibility: ReviewVisibility = "hidden",
  appeals: ReviewAppeal[] = [],
  overrides: Partial<CustomerOrderReviewView> = {},
): CustomerOrderReviewView {
  return {
    review: {
      reviewId: "review-safe-1",
      cityCode: "hangzhou",
      orderId: "order-safe-1",
      customerId: "customer-private-1",
      workerId: "worker-private-1",
      fulfillmentId: "fulfillment-private-1",
      rating: 5,
      comment: "服务准时，沟通清楚。",
      status: "created",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    visibility: {
      reviewId: "review-safe-1",
      visibility,
      moderationVersion: visibility === "pending_moderation" ? 0 : 2,
      version: 3,
      lastDecisionId: visibility === "pending_moderation"
        ? null
        : "decision-private-1",
      updatedAt: timestamp,
    },
    appeals,
    ...overrides,
  };
}

function orderRoute(orderId = "order-safe-1") {
  return {
    pathname: `/orders/${orderId}/review`,
    pattern: "/orders/:orderId/review" as const,
    params: { orderId },
    query: {},
  };
}

function appealRoute(
  reviewId = "review-safe-1",
  orderId: string | null = "order-safe-1",
) {
  return {
    pathname: `/reviews/${reviewId}/appeal`,
    pattern: "/reviews/:reviewId/appeal" as const,
    params: { reviewId },
    query: orderId === null ? {} : { orderId },
  };
}

function navigation(): CustomerReviewNavigation {
  return {
    back: vi.fn(),
    login: vi.fn(),
    openAppeal: vi.fn(),
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    getOrderReview: vi.fn().mockResolvedValue({
      ok: true,
      review: reviewView(),
    }),
    createOrderReview: vi.fn().mockResolvedValue({
      ok: true,
      review: reviewView().review,
      idempotent: false,
    }),
    createReviewAppeal: vi.fn().mockResolvedValue({
      ok: true,
      appeal: appeal(),
      idempotent: false,
    }),
    withdrawReviewAppeal: vi.fn().mockResolvedValue({
      ok: true,
      appeal: appeal({
        status: "withdrawn",
        version: 2,
        resolvedAt: timestamp,
      }),
      idempotent: false,
    }),
    ...overrides,
  };
}

function httpError(status: number, method = "GET") {
  return new ApiClientError({
    kind: "http",
    message: `review ${status}`,
    method,
    path: "/api/orders/order-safe-1/review",
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

afterEach(() => cleanup());

describe("Customer CSL-14 Review", () => {
  it("registers the closed L1 template, component plan and both guarded routes", async () => {
    const components = createCustomerReviewComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerReviewTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerReviewFeatureRouteModule)
      .seal();

    expect(components.list()).toEqual(CUSTOMER_REVIEW_COMPONENTS);
    expect(templates.resolveForSlice(customerReviewSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(customerReviewSlice.guards)
      .toEqual(["session", "city", "protected-route"]);
    expect(routes.resolve("/orders/:orderId/review")?.slice.id).toBe("CSL-14");
    expect(routes.resolve("/reviews/:reviewId/appeal")?.slice.id).toBe("CSL-14");
    await expect(routes.resolve("/orders/:orderId/review")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerReviewPage);
  });

  it("accepts only safe order/review identifiers and rejects path injection", () => {
    expect(parseCustomerReviewRoute(orderRoute())).toEqual({
      kind: "order",
      orderId: "order-safe-1",
      reviewId: null,
    });
    expect(parseCustomerReviewRoute(appealRoute())).toEqual({
      kind: "appeal",
      orderId: "order-safe-1",
      reviewId: "review-safe-1",
    });
    expect(parseCustomerReviewRoute(appealRoute(
      "review-safe-1",
      null,
    ))).toEqual({
      kind: "appeal",
      orderId: null,
      reviewId: "review-safe-1",
    });
    expect(parseCustomerReviewRoute(orderRoute("../other-order"))).toBeNull();
    expect(parseCustomerReviewRoute(appealRoute("review%2Fother"))).toBeNull();
    expect(parseCustomerReviewRoute(appealRoute(
      "review-safe-1",
      "../other-order",
    ))).toBeNull();
  });

  it("enforces the formal 1-5 rating and 500-character comment without inventing create idempotency", async () => {
    const customerApi = api();
    const controller = new CustomerReviewActionController(
      new CustomerReviewCoordinator(customerApi),
      navigation(),
    );
    await expect(controller.createReview(
      "order-safe-1",
      0,
      "内容",
    )).resolves.toMatchObject({
      status: "validation_error",
      errors: { rating: expect.any(String) },
    });
    await expect(controller.createReview(
      "order-safe-1",
      5,
      "字".repeat(501),
    )).resolves.toMatchObject({
      status: "validation_error",
      errors: { comment: expect.any(String) },
    });
    expect(customerApi.createOrderReview).not.toHaveBeenCalled();

    await expect(controller.createReview(
      "order-safe-1",
      5,
      "  正式评价  ",
    )).resolves.toMatchObject({ status: "success" });
    expect(customerApi.createOrderReview).toHaveBeenCalledWith({
      orderId: "order-safe-1",
      rating: 5,
      comment: "正式评价",
    });
    expect(customerApi.createOrderReview.mock.calls[0]?.[0])
      .not.toHaveProperty("idempotencyKey");
  });

  it("leaves eligibility and uniqueness to the server and maps a 409 to authoritative conflict", async () => {
    const customerApi = api({
      createOrderReview: vi.fn().mockRejectedValue(httpError(409, "POST")),
    });
    const coordinator = new CustomerReviewCoordinator(customerApi);
    await expect(coordinator.createReview(
      "order-safe-1",
      4,
      "服务体验真实。",
    )).resolves.toEqual({
      status: "conflict",
      reasonCode: "review_changed",
    });
    expect(customerApi.createOrderReview).toHaveBeenCalledTimes(1);

    customerApi.createOrderReview.mockResolvedValueOnce({
      ok: true,
      review: reviewView().review,
      idempotent: true,
    });
    await expect(coordinator.createReview(
      "order-safe-1",
      4,
      "服务体验真实。",
    )).resolves.toMatchObject({
      status: "success",
      idempotent: true,
    });
  });

  it("renders visibility exactly as returned and never treats created as public", () => {
    render(
      <CustomerReviewTemplate
        slice={customerReviewSlice}
        route={orderRoute()}
        state={{
          status: "ready",
          data: {
            viewModel: {
              routeInput: {
                kind: "order",
                orderId: "order-safe-1",
                reviewId: null,
              },
              review: reviewView("pending_moderation"),
              draft: { rating: null, comment: "", appealReason: "" },
              errors: {},
              operation: null,
              refreshing: false,
              notice: null,
            },
            actions: {
              onBack: vi.fn(),
              onRefresh: vi.fn(),
              onOpenAppeal: vi.fn(),
              onRatingChange: vi.fn(),
              onCommentChange: vi.fn(),
              onAppealReasonChange: vi.fn(),
              onCreateReview: vi.fn(),
              onCreateAppeal: vi.fn(),
              onWithdrawAppeal: vi.fn(),
              onDismissNotice: vi.fn(),
            },
          },
        }}
      />,
    );
    expect(screen.getByText("待审核")).toBeTruthy();
    expect(screen.getByText(/当前不能推断为公开可见/)).toBeTruthy();
    expect(screen.queryByText("服务端当前明确返回此评价为公开可见。"))
      .toBeNull();
  });

  it("uses the current moderation version and formal idempotency only for appeal mutations", async () => {
    const customerApi = api();
    const controller = new CustomerReviewActionController(
      new CustomerReviewCoordinator(customerApi),
      navigation(),
    );
    const hidden = reviewView("hidden");
    await expect(controller.createAppeal(
      "review-safe-1",
      hidden,
      "  希望复核  ",
    )).resolves.toMatchObject({ status: "success" });
    expect(customerApi.createReviewAppeal).toHaveBeenCalledWith(
      "review-safe-1",
      {
        moderationVersion: 2,
        reason: "希望复核",
        idempotencyKey: expect.stringMatching(
          /^customer-review-appeal-/u,
        ),
      },
    );

    const withOpenAppeal = reviewView("hidden", [appeal()]);
    await expect(controller.withdrawAppeal(
      "review-safe-1",
      withOpenAppeal,
    )).resolves.toMatchObject({ status: "success" });
    expect(customerApi.withdrawReviewAppeal).toHaveBeenCalledWith(
      "review-safe-1",
      {
        moderationVersion: 2,
        idempotencyKey: expect.stringMatching(
          /^customer-review-withdraw-/u,
        ),
      },
    );

    const terminal = reviewView("hidden", [appeal({
      status: "rejected",
      resolvedAt: timestamp,
      resolutionReason: "维持原决定",
    })]);
    await expect(controller.withdrawAppeal(
      "review-safe-1",
      terminal,
    )).resolves.toEqual({
      status: "conflict",
      reasonCode: "review_changed",
    });
    expect(customerApi.withdrawReviewAppeal).toHaveBeenCalledTimes(1);
  });

  it("renders appealing and withdrawing as locked server mutations", () => {
    const actions = {
      onBack: vi.fn(),
      onRefresh: vi.fn(),
      onOpenAppeal: vi.fn(),
      onRatingChange: vi.fn(),
      onCommentChange: vi.fn(),
      onAppealReasonChange: vi.fn(),
      onCreateReview: vi.fn(),
      onCreateAppeal: vi.fn(),
      onWithdrawAppeal: vi.fn(),
      onDismissNotice: vi.fn(),
    };
    const { rerender } = render(
      <CustomerReviewTemplate
        slice={customerReviewSlice}
        route={appealRoute()}
        state={{
          status: "ready",
          data: {
            viewModel: {
              routeInput: {
                kind: "appeal",
                orderId: "order-safe-1",
                reviewId: "review-safe-1",
              },
              review: reviewView("hidden"),
              draft: {
                rating: null,
                comment: "",
                appealReason: "希望复核",
              },
              errors: {},
              operation: "appealing",
              refreshing: false,
              notice: null,
            },
            actions,
          },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "正在提交申诉" })
      .hasAttribute("disabled")).toBe(true);

    rerender(
      <CustomerReviewTemplate
        slice={customerReviewSlice}
        route={appealRoute()}
        state={{
          status: "ready",
          data: {
            viewModel: {
              routeInput: {
                kind: "appeal",
                orderId: "order-safe-1",
                reviewId: "review-safe-1",
              },
              review: reviewView("hidden", [appeal()]),
              draft: { rating: null, comment: "", appealReason: "" },
              errors: {},
              operation: "withdrawing",
              refreshing: false,
              notice: null,
            },
            actions,
          },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "正在撤回申诉" })
      .hasAttribute("disabled")).toBe(true);
  });

  it("refreshes after a 409 appeal conflict and never advances appeal state locally", async () => {
    const refreshed = reviewView("hidden", [appeal()]);
    const customerApi = api({
      getOrderReview: vi.fn()
        .mockResolvedValueOnce({ ok: true, review: reviewView("hidden") })
        .mockResolvedValueOnce({ ok: true, review: refreshed }),
      createReviewAppeal: vi.fn().mockRejectedValue(httpError(409, "POST")),
    });

    render(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={appealRoute()}
        cityCode="hangzhou"
        coordinator={new CustomerReviewCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("暂无申诉");
    fireEvent.change(screen.getByLabelText("申诉原因"), {
      target: { value: "请复核隐藏决定" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交申诉" }));

    expect(await screen.findByText(/已刷新服务端最新事实/)).toBeTruthy();
    expect(screen.getByText("处理中")).toBeTruthy();
    expect(customerApi.createReviewAppeal).toHaveBeenCalledTimes(1);
    expect(customerApi.getOrderReview).toHaveBeenCalledTimes(2);
  });

  it("locks duplicate review submission, shows creating state and refreshes after success", async () => {
    const create = deferred<{
      ok: true;
      review: CustomerOrderReviewView["review"];
      idempotent: boolean;
    }>();
    const customerApi = api({
      getOrderReview: vi.fn()
        .mockResolvedValueOnce({ ok: true, review: null })
        .mockResolvedValueOnce({ ok: true, review: reviewView() }),
      createOrderReview: vi.fn(() => create.promise),
    });

    render(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={orderRoute()}
        cityCode="hangzhou"
        coordinator={new CustomerReviewCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    await screen.findByText("尚未提交评价");
    fireEvent.click(screen.getByRole("radio", { name: "5 星" }));
    fireEvent.change(screen.getByLabelText("评价内容"), {
      target: { value: "服务很好" },
    });
    const submit = screen.getByRole("button", { name: "提交评价" });
    fireEvent.click(submit);
    expect((await screen.findByRole("button", {
      name: "正在提交评价",
    })).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "正在提交评价" }));
    expect(customerApi.createOrderReview).toHaveBeenCalledTimes(1);

    create.resolve({
      ok: true,
      review: reviewView().review,
      idempotent: false,
    });
    expect(await screen.findByText(/服务端确认/)).toBeTruthy();
    expect(screen.getByText("5 / 5 星")).toBeTruthy();
    expect(customerApi.getOrderReview).toHaveBeenCalledTimes(2);
  });

  it("converges 403 and 404 safely, expires on 401, and exposes retry for 5xx", async () => {
    for (const status of [403, 404]) {
      const { unmount } = render(
        <CustomerReviewPage
          slice={customerReviewSlice}
          route={orderRoute()}
          cityCode="hangzhou"
          coordinator={new CustomerReviewCoordinator(api({
            getOrderReview: vi.fn().mockRejectedValue(httpError(status)),
          }))}
          navigation={navigation()}
        />,
      );
      expect(await screen.findByText("无法查看此评价")).toBeTruthy();
      expect(screen.getByText(/不会透露资源归属/)).toBeTruthy();
      unmount();
    }

    const expired = vi.fn();
    render(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={orderRoute()}
        cityCode="hangzhou"
        coordinator={new CustomerReviewCoordinator(api({
          getOrderReview: vi.fn().mockRejectedValue(httpError(401)),
        }))}
        navigation={navigation()}
        onSessionExpired={expired}
      />,
    );
    await waitFor(() => expect(expired).toHaveBeenCalledTimes(1));
    cleanup();

    render(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={orderRoute()}
        cityCode="hangzhou"
        coordinator={new CustomerReviewCoordinator(api({
          getOrderReview: vi.fn().mockRejectedValue(httpError(503)),
        }))}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("评价加载失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy();
  });

  it("keeps latest-wins across route changes and makes bare reviewId lookup unavailable", async () => {
    const first = deferred<{
      ok: true;
      review: CustomerOrderReviewView | null;
    }>();
    const secondView = reviewView("visible", [], {
      review: {
        ...reviewView().review,
        reviewId: "review-safe-2",
        orderId: "order-safe-2",
        rating: 4,
        comment: "第二个订单的评价。",
      },
      visibility: {
        ...reviewView("visible").visibility,
        reviewId: "review-safe-2",
      },
    });
    const customerApi = api({
      getOrderReview: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValueOnce({ ok: true, review: secondView }),
    });
    const coordinator = new CustomerReviewCoordinator(customerApi);
    const { rerender } = render(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={orderRoute("order-safe-1")}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={navigation()}
      />,
    );
    rerender(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={orderRoute("order-safe-2")}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("第二个订单的评价。")).toBeTruthy();
    first.resolve({ ok: true, review: reviewView() });
    await waitFor(() => {
      expect(screen.queryByText("服务准时，沟通清楚。")).toBeNull();
    });
    cleanup();

    render(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={appealRoute("review-safe-1", null)}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={navigation()}
      />,
    );
    expect(await screen.findByText("评价能力暂不可用")).toBeTruthy();
    expect(screen.getByText(/只能按订单读取评价/)).toBeTruthy();
  });

  it("renders loading, no-appeal, conflict and unavailable states", () => {
    const base = {
      slice: customerReviewSlice,
      route: orderRoute(),
    };
    const { rerender } = render(
      <CustomerReviewTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在读取评价")).toBeTruthy();

    rerender(
      <CustomerReviewTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "review_changed",
          refreshRequired: true,
          recovery: { actionKey: "retry", labelKey: "重新读取" },
        }}
      />,
    );
    expect(screen.getByText("评价状态已变化")).toBeTruthy();

    rerender(
      <CustomerReviewTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.review",
          reasonCode: "review_api_unavailable",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会用本地或演示数据替代/)).toBeTruthy();

    rerender(
      <CustomerReviewPage
        slice={customerReviewSlice}
        route={appealRoute()}
        cityCode="hangzhou"
        coordinator={new CustomerReviewCoordinator(api({
          getOrderReview: vi.fn().mockResolvedValue({
            ok: true,
            review: reviewView("pending_moderation"),
          }),
        }))}
        navigation={navigation()}
      />,
    );
    return screen.findByText("暂无申诉").then(() => {
      expect(screen.getByText(/尚未产生可申诉/)).toBeTruthy();
    });
  });
});
