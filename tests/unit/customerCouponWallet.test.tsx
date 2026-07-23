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
  CouponGrant,
  CouponGrantStatus,
  MarketingDiscountDecision,
} from "@xlb/types";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CUSTOMER_COUPON_GRANT_STATUSES,
  CUSTOMER_COUPON_WALLET_COMPONENTS,
  CouponWalletActionController,
  CouponWalletCoordinator,
  CustomerCouponWalletPage,
  createCustomerCouponWalletComponentRegistry,
  customerCouponWalletFeatureRouteModule,
  customerCouponWalletSlice,
  customerCouponWalletTemplateRegistration,
  filterCouponGrants,
  maskCouponGrantId,
  mergeCouponGrants,
  parseCouponWalletRoute,
  type CustomerCouponNavigation,
} from "../../apps/customer/src/features/coupons/index.js";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";

const timestamp = "2026-07-24T08:00:00.000Z";

function grant(
  status: CouponGrantStatus = "available",
  overrides: Partial<CouponGrant> = {},
): CouponGrant {
  return {
    couponGrantId: `grant-${status}-123456`,
    couponDefinitionId: "definition-private",
    marketingCampaignId: "campaign-private",
    ruleRevisionId: "rule-revision-private",
    cityCode: "hangzhou",
    customerId: "customer-private",
    status,
    issuanceReason: "campaign_targeted",
    issuanceRef: "issuance-private",
    availableAt: timestamp,
    expiresAt: "2026-08-24T08:00:00.000Z",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function decision(
  status: MarketingDiscountDecision["status"] = "issued",
): MarketingDiscountDecision {
  return {
    discountDecisionId: "decision-123",
    cityCode: "hangzhou",
    customerId: "customer-private",
    skuId: "sku-123",
    quantity: 2,
    priceRuleId: "price-rule-1",
    priceRuleVersion: 3,
    ruleRevisionId: "rule-revision-private",
    ruleContentHash: "a".repeat(64),
    couponDefinitionId: "definition-private",
    couponGrantId: "grant-available-123456",
    currency: "CNY",
    grossAmountMinor: 10_000,
    discountAmountMinor: 1_000,
    netAmountMinor: 9_000,
    requestFingerprint: "b".repeat(64),
    status,
    expiresAt: "2026-07-24T08:15:00.000Z",
    acceptedOrderId: status === "accepted" ? "order-123" : null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function route(query: Readonly<Record<string, string>> = {}) {
  return {
    pathname: "/coupons",
    pattern: "/coupons" as const,
    params: {},
    query,
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    listCouponGrants: vi.fn().mockResolvedValue({
      ok: true,
      couponGrants: [grant()],
    }),
    issueDiscountDecision: vi.fn().mockResolvedValue({
      ok: true,
      discountDecision: decision(),
    }),
    ...overrides,
  };
}

function navigation(): CustomerCouponNavigation {
  return {
    back: vi.fn(),
    showStatus: vi.fn(),
    returnToCheckout: vi.fn(),
  };
}

function httpError(status: number): ApiClientError {
  return new ApiClientError({
    kind: "http",
    message: `HTTP ${status}`,
    method: "POST",
    path: "/api/customer/marketing/discount-decisions",
    status,
  });
}

describe("Customer CSL-18 Coupon Wallet", () => {
  it("registers a fixed L1 route, forbidden manifest and closed component plan", async () => {
    const components = createCustomerCouponWalletComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerCouponWalletTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerCouponWalletFeatureRouteModule)
      .seal();

    expect(components.list()).toEqual(CUSTOMER_COUPON_WALLET_COMPONENTS);
    expect(templates.resolveForSlice(customerCouponWalletSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(customerCouponWalletSlice.guards)
      .toEqual(["session", "city", "protected-route"]);
    expect(routes.resolve("/coupons")?.slice.id).toBe("CSL-18");
    await expect(routes.resolve("/coupons")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerCouponWalletPage);
  });

  it("validates route status and Checkout Context without accepting unsafe returns", () => {
    expect(parseCouponWalletRoute(route())).toEqual({
      status: "all",
      checkoutContext: null,
      checkoutContextInvalid: false,
    });
    expect(parseCouponWalletRoute(route({
      status: "reserved",
      skuId: "sku-123",
      quantity: "2",
      returnTo: "/order/create",
    }))).toEqual({
      status: "reserved",
      checkoutContext: {
        skuId: "sku-123",
        quantity: 2,
        returnPath: "/order/create",
      },
      checkoutContextInvalid: false,
    });
    expect(parseCouponWalletRoute(route({ status: "unused" }))).toBeNull();
    expect(parseCouponWalletRoute(route({
      skuId: "sku-123",
      quantity: "2",
      returnTo: "https://other.example/checkout",
    }))).toMatchObject({
      checkoutContext: null,
      checkoutContextInvalid: true,
    });
    expect(parseCouponWalletRoute(route({
      skuId: "../unsafe",
      quantity: "2",
      returnTo: "/order/create",
    }))).toMatchObject({
      checkoutContext: null,
      checkoutContextInvalid: true,
    });

    const nav = navigation();
    const controller = new CouponWalletActionController(
      new CouponWalletCoordinator(api()),
      nav,
    );
    const context = {
      skuId: "sku-123",
      quantity: 2,
      returnPath: "/order/create" as const,
    };
    controller.showStatus("reserved", context);
    expect(nav.showStatus).toHaveBeenCalledWith("reserved", context);
  });

  it("keeps exactly the seven formal statuses and deduplicates by latest version", () => {
    expect(CUSTOMER_COUPON_GRANT_STATUSES).toEqual([
      "granted",
      "available",
      "reserved",
      "redeemed",
      "released",
      "expired",
      "revoked",
    ]);
    const old = grant("available", { version: 2 });
    const stale = grant("available", { version: 1, expiresAt: timestamp });
    const newer = grant("available", { version: 3, status: "reserved" });
    expect(mergeCouponGrants([old], [stale, newer])).toEqual([newer]);
    expect(filterCouponGrants(
      [grant("granted"), grant("expired")],
      "expired",
    )).toEqual([grant("expired")]);
    expect(maskCouponGrantId("grant-secret-123456")).toBe("••••123456");
    expect(maskCouponGrantId("short")).toBe("••••");
  });

  it("renders only minimal grant facts and exposes the real capability limits", async () => {
    render(
      <CustomerCouponWalletPage
        slice={customerCouponWalletSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new CouponWalletCoordinator(api())}
        navigation={navigation()}
      />,
    );

    expect(await screen.findByText("我的券包")).toBeTruthy();
    expect(screen.getByText("••••123456")).toBeTruthy();
    expect(screen.getByText(/cursor 契约尚未提供/)).toBeTruthy();
    expect(screen.getByText(/不会从其他端或本地常量补齐/)).toBeTruthy();
    expect(screen.getByText(/此状态不代表 Checkout eligibility/)).toBeTruthy();
    expect(screen.queryByText("definition-private")).toBeNull();
    expect(screen.queryByText("campaign-private")).toBeNull();
    expect(screen.queryByText("1000")).toBeNull();
    expect(screen.queryByRole("button", { name: "请求服务端判定" }))
      .toBeNull();
  });

  it("submits a validated decision once and returns only the server decision seam", async () => {
    const customerApi = api();
    const nav = navigation();
    render(
      <CustomerCouponWalletPage
        slice={customerCouponWalletSlice}
        route={route({
          skuId: "sku-123",
          quantity: "2",
          returnTo: "/order/create",
        })}
        cityCode="hangzhou"
        coordinator={new CouponWalletCoordinator(customerApi)}
        navigation={nav}
      />,
    );

    fireEvent.click(await screen.findByRole("button", {
      name: "请求服务端判定",
    }));
    expect(await screen.findByText("decision: issued")).toBeTruthy();
    expect(screen.getByText(/服务端已出具 decision/)).toBeTruthy();
    expect(customerApi.issueDiscountDecision).toHaveBeenCalledTimes(1);
    expect(customerApi.issueDiscountDecision).toHaveBeenCalledWith({
      skuId: "sku-123",
      quantity: 2,
      selectedCouponGrantId: "grant-available-123456",
      idempotencyKey: expect.stringMatching(/^customer-coupon-decision-/u),
    });

    fireEvent.click(screen.getByRole("button", { name: "返回 Checkout" }));
    expect(nav.returnToCheckout).toHaveBeenCalledWith(
      {
        skuId: "sku-123",
        quantity: 2,
        returnPath: "/order/create",
      },
      decision(),
    );
  });

  it("does not treat a surface status as eligibility and handles accepted/rejected/expired decisions", async () => {
    for (const decisionStatus of ["accepted", "rejected", "expired"] as const) {
      const customerApi = api({
        listCouponGrants: vi.fn().mockResolvedValue({
          ok: true,
          couponGrants: [grant("redeemed")],
        }),
        issueDiscountDecision: vi.fn().mockResolvedValue({
          ok: true,
          discountDecision: {
            ...decision(decisionStatus),
            couponGrantId: "grant-redeemed-123456",
          },
        }),
      });
      const { unmount } = render(
        <CustomerCouponWalletPage
          slice={customerCouponWalletSlice}
          route={route({
            skuId: "sku-123",
            quantity: "2",
            returnTo: "/order/create",
          })}
          cityCode="hangzhou"
          coordinator={new CouponWalletCoordinator(customerApi)}
          navigation={navigation()}
        />,
      );
      fireEvent.click(await screen.findByRole("button", {
        name: "请求服务端判定",
      }));
      expect(await screen.findByText(`decision: ${decisionStatus}`)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "返回 Checkout" }))
        .toBeNull();
      expect(customerApi.issueDiscountDecision).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("refreshes authoritative grants after 409 and hides 403/404 existence", async () => {
    const customerApi = api({
      listCouponGrants: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          couponGrants: [grant("available")],
        })
        .mockResolvedValueOnce({
          ok: true,
          couponGrants: [grant("reserved", {
            couponGrantId: "grant-available-123456",
            version: 2,
          })],
        }),
      issueDiscountDecision: vi.fn().mockRejectedValue(httpError(409)),
    });
    render(
      <CustomerCouponWalletPage
        slice={customerCouponWalletSlice}
        route={route({
          skuId: "sku-123",
          quantity: "2",
          returnTo: "/order/create",
        })}
        cityCode="hangzhou"
        coordinator={new CouponWalletCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", {
      name: "请求服务端判定",
    }));
    expect(await screen.findByText(/已刷新服务端券包/)).toBeTruthy();
    expect(screen.getByRole("article", {
      name: /状态 reserved/u,
    })).toBeTruthy();
    expect(screen.queryByText("decision: issued")).toBeNull();
    expect(customerApi.listCouponGrants).toHaveBeenCalledTimes(2);

    for (const status of [403, 404]) {
      const result = await new CouponWalletCoordinator(api({
        issueDiscountDecision: vi.fn().mockRejectedValue(httpError(status)),
      })).issueDecision({
        skuId: "sku-123",
        quantity: 2,
        selectedCouponGrantId: "grant-available-123456",
        idempotencyKey: "customer-coupon-decision-test",
      });
      expect(result).toEqual({ status: "not_found" });
    }
  });

  it("maps 401 and 5xx safely and enforces the action submission lock", async () => {
    const unauthorized = await new CouponWalletCoordinator(api({
      listCouponGrants: vi.fn().mockRejectedValue(httpError(401)),
    })).load("hangzhou");
    expect(unauthorized).toEqual({ status: "unauthenticated" });

    const failed = await new CouponWalletCoordinator(api({
      listCouponGrants: vi.fn().mockRejectedValue(httpError(500)),
    })).load("hangzhou");
    expect(failed).toMatchObject({
      status: "error",
      retryable: true,
    });

    let resolveDecision!: (value: {
      ok: true;
      discountDecision: MarketingDiscountDecision;
    }) => void;
    const pending = new Promise<{
      ok: true;
      discountDecision: MarketingDiscountDecision;
    }>((resolve) => {
      resolveDecision = resolve;
    });
    const coordinator = new CouponWalletCoordinator(api({
      issueDiscountDecision: vi.fn(() => pending),
    }));
    const controller = new CouponWalletActionController(
      coordinator,
      navigation(),
    );
    const context = {
      skuId: "sku-123",
      quantity: 2,
      returnPath: "/order/create" as const,
    };
    const first = controller.requestDecision(grant(), context);
    await expect(controller.requestDecision(grant(), context)).resolves.toEqual({
      status: "conflict",
      reasonCode: "request_in_flight",
    });
    resolveDecision({ ok: true, discountDecision: decision() });
    await expect(first).resolves.toMatchObject({ status: "decided" });
  });

  it("uses latest-wins when an older refresh resolves last", async () => {
    let resolveOld!: (value: {
      ok: true;
      couponGrants: CouponGrant[];
    }) => void;
    const old = new Promise<{
      ok: true;
      couponGrants: CouponGrant[];
    }>((resolve) => {
      resolveOld = resolve;
    });
    const customerApi = api({
      listCouponGrants: vi.fn()
        .mockImplementationOnce(() => old)
        .mockResolvedValueOnce({
          ok: true,
          couponGrants: [grant("expired")],
        }),
    });
    const coordinator = new CouponWalletCoordinator(customerApi);
    const props = {
      slice: customerCouponWalletSlice,
      cityCode: "hangzhou" as const,
      coordinator,
      navigation: navigation(),
    };
    const { rerender } = render(
      <CustomerCouponWalletPage {...props} route={route()} />,
    );
    rerender(
      <CustomerCouponWalletPage
        {...props}
        route={route({ status: "expired" })}
      />,
    );
    expect(await screen.findByRole("article", {
      name: /状态 expired/u,
    })).toBeTruthy();
    resolveOld({ ok: true, couponGrants: [grant("available")] });
    await waitFor(() => {
      expect(screen.getByRole("article", {
        name: /状态 expired/u,
      })).toBeTruthy();
    });
    expect(screen.queryByRole("article", {
      name: /状态 available/u,
    })).toBeNull();
  });
});
