// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerCouponsPage } from "../../apps/customer/src/pages/CustomerCouponsPage";
import { MarketingOperationsPage } from "../../apps/admin/src/pages/MarketingOperationsPage";
import { toCustomerCouponGrantViewModel } from "../../apps/customer/src/adapters/marketingAdapter";

const now = new Date(Date.now() - 60_000).toISOString();
const later = new Date(Date.now() + 86_400_000).toISOString();
const grant = {
  couponGrantId: "grant-1", couponDefinitionId: "definition-1", marketingCampaignId: "campaign-1",
  ruleRevisionId: "revision-1", cityCode: "hangzhou" as const, customerId: "customer-1",
  status: "available" as const, issuanceReason: "admin_manual" as const, issuanceRef: "approval-1",
  availableAt: now, expiresAt: later, version: 1, createdAt: now, updatedAt: now,
};

afterEach(() => cleanup());

describe("Phase29 Marketing Customer/Admin surfaces", () => {
  it("renders real Customer grants and delegates selection without local money", async () => {
    const onSelectForQuote = vi.fn();
    render(<CustomerCouponsPage
      api={{ listCouponGrants: vi.fn().mockResolvedValue({ ok: true, couponGrants: [grant] }) }}
      onSelectForQuote={onSelectForQuote}
    />);
    expect(await screen.findByText("可使用")).toBeTruthy();
    expect(screen.getByText(/服务端报价为准/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "用于下单报价" }));
    expect(onSelectForQuote).toHaveBeenCalledWith("grant-1");
    expect(document.body.textContent).not.toContain("13800000000");
  });

  it("renders an expired available grant as expired and never exposes quote selection", async () => {
    const expiredAvailableGrant = { ...grant, expiresAt: "2000-01-01T00:00:00.000Z" };
    render(<CustomerCouponsPage
      api={{ listCouponGrants: vi.fn().mockResolvedValue({
        ok: true,
        couponGrants: [expiredAvailableGrant],
      }) }}
      onSelectForQuote={vi.fn()}
    />);

    expect(await screen.findByText("已过期")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "用于下单报价" })).toBeNull();

    const boundaryViewModel = toCustomerCouponGrantViewModel(
      { ...grant, expiresAt: now },
      new Date(now),
    );
    expect(boundaryViewModel.canSelectForQuote).toBe(false);
  });

  it("shows an honest Customer error and retries to empty state", async () => {
    const listCouponGrants = vi.fn()
      .mockRejectedValueOnce(new Error("coupon API unavailable"))
      .mockResolvedValueOnce({ ok: true, couponGrants: [] });
    render(<CustomerCouponsPage api={{ listCouponGrants }} />);
    expect((await screen.findByRole("alert")).textContent).toContain("优惠券暂时无法加载，请稍后重试");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("当前没有可使用的优惠券")).toBeTruthy();
  });

  it("keeps Admin auditor read-only while showing current-city records", async () => {
    const api = {
      listCampaigns: vi.fn().mockResolvedValue({ ok: true, campaigns: [{
        marketingCampaignId: "campaign-1", cityCode: "hangzhou", name: "真实活动", status: "draft",
        activeRuleRevisionId: null, startAt: now, endAt: later, reviewedBy: null, reviewedAt: null,
        version: 1, createdAt: now, updatedAt: now,
      }] }),
      createCampaign: vi.fn(), reviewCampaign: vi.fn(), scheduleCampaign: vi.fn(), changeCampaignStatus: vi.fn(),
      listRuleRevisions: vi.fn().mockResolvedValue({ ok: true, ruleRevisions: [] }), createRuleRevision: vi.fn(),
      reviewRuleRevision: vi.fn(), publishRuleRevision: vi.fn(),
      listCouponDefinitions: vi.fn().mockResolvedValue({ ok: true, couponDefinitions: [] }),
      createCouponDefinition: vi.fn(), changeCouponDefinitionStatus: vi.fn(),
      grantCoupon: vi.fn(), revokeCouponGrant: vi.fn(),
    };
    render(<MarketingOperationsPage api={api} initialCityCode="hangzhou" role="auditor" />);
    expect(await screen.findByText("真实活动")).toBeTruthy();
    expect(screen.getByText(/角色：auditor/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "创建草稿" })).toBeNull();
    expect(screen.queryByText("审计原因")).toBeNull();
  });

  it("submits an Admin campaign as a command with no invented success", async () => {
    const createCampaign = vi.fn().mockResolvedValue({ ok: true, campaign: {} });
    const api = {
      listCampaigns: vi.fn().mockResolvedValue({ ok: true, campaigns: [{
        marketingCampaignId: "operator-campaign", cityCode: "hangzhou", name: "Operator campaign", status: "draft",
        activeRuleRevisionId: null, startAt: now, endAt: later, reviewedBy: null, reviewedAt: null,
        version: 1, createdAt: now, updatedAt: now,
      }] }), createCampaign,
      reviewCampaign: vi.fn(), scheduleCampaign: vi.fn(), changeCampaignStatus: vi.fn(),
      listRuleRevisions: vi.fn().mockResolvedValue({ ok: true, ruleRevisions: [] }), createRuleRevision: vi.fn(),
      reviewRuleRevision: vi.fn(), publishRuleRevision: vi.fn(),
      listCouponDefinitions: vi.fn().mockResolvedValue({ ok: true, couponDefinitions: [{
        couponDefinitionId: "definition-1", marketingCampaignId: "operator-campaign", ruleRevisionId: "revision-1",
        cityCode: "hangzhou", name: "Operator definition", status: "draft", currency: "CNY",
        faceValueMinor: 1_000, minSpendMinor: 10_000, issuanceCap: 100, issuedCount: 0,
        compensationCap: 10, compensationIssuedCount: 0, validFrom: now, validUntil: later,
        version: 1, createdAt: now, updatedAt: now,
      }] }),
      createCouponDefinition: vi.fn(), changeCouponDefinitionStatus: vi.fn(),
      grantCoupon: vi.fn(), revokeCouponGrant: vi.fn(),
    };
    render(<MarketingOperationsPage api={api} initialCityCode="hangzhou" role="operator" />);
    await screen.findByText("Operator campaign");
    expect(screen.queryByRole("button", { name: "审核" })).toBeNull();
    expect(screen.queryByText("审计原因")).toBeNull();
    fireEvent.change(screen.getByLabelText("活动名称"), { target: { value: "夏季保洁" } });
    const dates = screen.getAllByDisplayValue("");
    const dateInputs = dates.filter((node) => node.getAttribute("type") === "datetime-local");
    fireEvent.change(dateInputs[0], { target: { value: "2026-07-15T10:00" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-07-16T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "创建草稿" }));
    await waitFor(() => expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: "夏季保洁", idempotencyKey: expect.stringMatching(/^marketing-campaign-/),
    })));
    expect(screen.queryByText(/创建成功/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "券定义" }));
    expect(await screen.findByText("Operator definition")).toBeTruthy();
    expect(screen.getByRole("button", { name: "创建券定义" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "启用" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "发放" }));
    expect(screen.queryByRole("button", { name: "发放" })).toBeNull();
    expect(screen.queryByRole("button", { name: "撤销" })).toBeNull();
  });

  it("loads published schedule revisions and exposes only valid campaign transitions", async () => {
    const campaign = (id: string, status: "draft" | "reviewed" | "active" | "paused") => ({
      marketingCampaignId: id, cityCode: "hangzhou" as const, name: id, status,
      activeRuleRevisionId: null, startAt: now, endAt: later,
      reviewedBy: status === "draft" ? null : "reviewer-1",
      reviewedAt: status === "draft" ? null : now,
      version: 1, createdAt: now, updatedAt: now,
    });
    const listRuleRevisions = vi.fn().mockResolvedValue({
      ok: true,
      ruleRevisions: [{
        ruleRevisionId: "published-revision-1", marketingCampaignId: "reviewed-campaign",
        cityCode: "hangzhou", revision: 1, status: "published", allowedSkuIds: ["sku-1"],
        createdBy: "creator-1", reviewedBy: "reviewer-1", reviewedAt: now,
        publishedBy: "publisher-1", publishedAt: now, version: 3, createdAt: now,
      }],
    });
    const api = {
      listCampaigns: vi.fn().mockResolvedValue({ ok: true, campaigns: [
        campaign("draft-campaign", "draft"),
        campaign("reviewed-campaign", "reviewed"),
        campaign("active-campaign", "active"),
        campaign("paused-campaign", "paused"),
      ] }),
      createCampaign: vi.fn(), reviewCampaign: vi.fn(), scheduleCampaign: vi.fn(), changeCampaignStatus: vi.fn(),
      listRuleRevisions, createRuleRevision: vi.fn(), reviewRuleRevision: vi.fn(), publishRuleRevision: vi.fn(),
      listCouponDefinitions: vi.fn().mockResolvedValue({ ok: true, couponDefinitions: [] }),
      createCouponDefinition: vi.fn(), changeCouponDefinitionStatus: vi.fn(),
      grantCoupon: vi.fn(), revokeCouponGrant: vi.fn(),
    };

    render(<MarketingOperationsPage api={api} initialCityCode="hangzhou" role="admin" />);

    expect(await screen.findByRole("option", { name: "published-revision-1" })).toBeTruthy();
    expect(listRuleRevisions).toHaveBeenCalledTimes(1);
    expect(listRuleRevisions).toHaveBeenCalledWith("reviewed-campaign");
    expect(screen.getAllByRole("button", { name: "结束" })).toHaveLength(2);
    expect(screen.getByText("draft-campaign", { selector: "strong" }).closest("li")?.textContent).not.toContain("结束");
    expect(screen.getByText("reviewed-campaign", { selector: "strong" }).closest("li")?.textContent).not.toContain("结束");
  });
});
