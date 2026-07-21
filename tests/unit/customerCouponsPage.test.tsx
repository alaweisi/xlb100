// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CouponGrant } from "@xlb/types";
import { CustomerCouponsPage } from "../../apps/customer/src/pages/CustomerCouponsPage";
import { toCustomerCouponGrantViewModel } from "../../apps/customer/src/adapters/marketingAdapter";

const now = "2026-07-22T08:00:00.000Z";
const future = "2026-08-22T08:00:00.000Z";
const availableGrant: CouponGrant = {
  couponGrantId: "grant-customer-c3",
  couponDefinitionId: "definition-c3",
  marketingCampaignId: "campaign-c3",
  ruleRevisionId: "revision-c3",
  cityCode: "hangzhou",
  customerId: "customer-c3",
  status: "available",
  issuanceReason: "admin_manual",
  issuanceRef: "approval-c3",
  availableAt: now,
  expiresAt: future,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

afterEach(() => cleanup());

describe("Customer Coupons C3 slice", () => {
  it("renders an authoritative available grant and delegates quote selection without local discount math", async () => {
    const onSelectForQuote = vi.fn();
    render(
      <CustomerCouponsPage
        api={{ listCouponGrants: vi.fn().mockResolvedValue({ ok: true, couponGrants: [availableGrant] }) }}
        onSelectForQuote={onSelectForQuote}
      />,
    );

    expect(await screen.findByText("现在可用于服务报价")).toBeTruthy();
    expect(screen.getByText("价格透明")).toBeTruthy();
    expect(screen.getByText(/服务端报价为准/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/¥|￥|减\s*\d|折/);

    fireEvent.click(screen.getByRole("button", { name: "用于下单报价" }));
    expect(onSelectForQuote).toHaveBeenCalledWith("grant-customer-c3");
    expect(screen.getByText("正在前往报价…")).toBeTruthy();
  });

  it("treats an expired available grant as stale and never offers quote selection", async () => {
    const staleGrant = { ...availableGrant, expiresAt: "2026-07-21T08:00:00.000Z" };
    const viewModel = toCustomerCouponGrantViewModel(staleGrant, new Date(now));
    expect(viewModel).toMatchObject({ statusLabel: "已过期", canSelectForQuote: false, isStale: true, statusTone: "muted" });

    render(
      <CustomerCouponsPage
        api={{ listCouponGrants: vi.fn().mockResolvedValue({ ok: true, couponGrants: [staleGrant] }) }}
        onSelectForQuote={vi.fn()}
      />,
    );

    const card = await screen.findByLabelText("优惠券 grant-customer-c3");
    expect(card.getAttribute("data-coupon-stale")).toBe("true");
    expect(screen.getByText("已过期")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "用于下单报价" })).toBeNull();
  });

  it("switches server filters and distinguishes available/all empty states", async () => {
    const listCouponGrants = vi.fn().mockResolvedValue({ ok: true, couponGrants: [] });
    render(<CustomerCouponsPage api={{ listCouponGrants }} />);

    expect(await screen.findByText("当前没有可使用的优惠券")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "全部记录" }));
    expect(await screen.findByText("当前没有优惠券记录")).toBeTruthy();
    expect(listCouponGrants).toHaveBeenNthCalledWith(1, { status: "available" });
    expect(listCouponGrants).toHaveBeenNthCalledWith(2, undefined);
  });

  it("shows customer-safe recovery copy and retries after a recoverable error", async () => {
    const listCouponGrants = vi.fn()
      .mockRejectedValueOnce(new Error("coupon API unavailable"))
      .mockResolvedValueOnce({ ok: true, couponGrants: [] });
    render(<CustomerCouponsPage api={{ listCouponGrants }} />);

    expect((await screen.findByRole("alert")).textContent).toContain("暂时无法完成请求");
    expect(document.body.textContent).not.toContain("coupon API unavailable");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(listCouponGrants).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("当前没有可使用的优惠券")).toBeTruthy();
  });
});
