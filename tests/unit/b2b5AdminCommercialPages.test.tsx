// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listWorkerWithdrawals: vi.fn(), reviewWorkerWithdrawal: vi.fn(), markWorkerWithdrawalPaid: vi.fn(),
  listOrderReverseRequests: vi.fn(), listAftersaleComplaints: vi.fn(), getAftersaleComplaint: vi.fn(),
  enterprise: {
    listClients: vi.fn(), listCredentials: vi.fn(), listAgreementPrices: vi.fn(),
    listWebhookSubscriptions: vi.fn(), listWebhookDeliveries: vi.fn(), listBills: vi.fn(),
    createClient: vi.fn(), updateClientStatus: vi.fn(), createCredential: vi.fn(), revokeCredential: vi.fn(),
    upsertAgreementPrice: vi.fn(), createWebhookSubscription: vi.fn(), updateWebhookSubscriptionStatus: vi.fn(),
    retryWebhookDelivery: vi.fn(), runWebhooks: vi.fn(), createBill: vi.fn(), issueBill: vi.fn(),
  },
  getSupportQualityDashboard: vi.fn(), createSupportQualityRubric: vi.fn(), createSupportQualityReview: vi.fn(),
}));

vi.mock("../../apps/admin/src/adminAuth", () => ({ adminOpsApi: api }));

import { WorkerWithdrawalsPage } from "../../apps/admin/src/pages/WorkerWithdrawalsPage";
import { AftersaleOpsPage } from "../../apps/admin/src/pages/AftersaleOpsPage";
import { EnterpriseOpsPage } from "../../apps/admin/src/pages/EnterpriseOpsPage";
import { SupportQualityPage } from "../../apps/admin/src/pages/SupportQualityPage";

const at = "2026-07-18T08:00:00.000Z";

describe("B2-B5 Admin commercial page boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    api.listWorkerWithdrawals.mockResolvedValue({ ok: true, withdrawals: [] });
    api.listOrderReverseRequests.mockResolvedValue({ ok: true, reverseRequests: [] });
    api.listAftersaleComplaints.mockResolvedValue({ ok: true, complaints: [] });
    api.enterprise.listClients.mockResolvedValue({ ok: true, clients: [] });
    api.enterprise.listCredentials.mockResolvedValue({ ok: true, credentials: [] });
    api.enterprise.listAgreementPrices.mockResolvedValue({ ok: true, agreementPrices: [] });
    api.enterprise.listWebhookSubscriptions.mockResolvedValue({ ok: true, subscriptions: [] });
    api.enterprise.listWebhookDeliveries.mockResolvedValue({ ok: true, deliveries: [] });
    api.enterprise.listBills.mockResolvedValue({ ok: true, bills: [] });
    api.getSupportQualityDashboard.mockResolvedValue({ ok: true, dashboard: {
      response_count: 0, average_score: 0, score_1: 0, score_2: 0, score_3: 0,
      score_4: 0, score_5: 0, review_count: 0, average_review_score: 0,
    } });
  });

  afterEach(cleanup);

  it("A-06 only renders the server withdrawal queue and never claims arrival or provider execution", async () => {
    api.listWorkerWithdrawals.mockResolvedValue({ ok: true, withdrawals: [{
      withdrawalId: "withdrawal-controlled", cityCode: "hangzhou", workerId: "worker-01",
      bankAccountId: "bank-01", amount: 860, currency: "CNY", status: "requested",
      requestNote: null, reviewNote: null, markedPaidNote: null, requestedAt: at,
      reviewedAt: null, reviewedByAdminId: null, markedPaidAt: null, markedPaidByAdminId: null,
      createdAt: at, updatedAt: at,
    }] });
    render(<WorkerWithdrawalsPage initialCityCode="hangzhou" />);
    expect(await screen.findByText("withdrawal-controlled")).toBeTruthy();
    expect(api.listWorkerWithdrawals).toHaveBeenCalledWith({ cityCode: "hangzhou", limit: 100 });
    expect(screen.queryByText(/^已到账$/)).toBeNull();
    expect(screen.queryByText(/^外部 Provider 已执行$/)).toBeNull();
  });

  it("A-06 preserves a failed API result as a visible recovery boundary", async () => {
    api.listWorkerWithdrawals.mockRejectedValue(new Error("withdrawal service unavailable"));
    render(<WorkerWithdrawalsPage initialCityCode="hangzhou" />);
    await waitFor(() => expect(api.listWorkerWithdrawals).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.body.textContent).toContain("请求失败"));
    expect(screen.queryByText(/^已到账$/)).toBeNull();
  });

  it("A-07 consumes both authoritative queues without synthesizing refund success", async () => {
    render(<AftersaleOpsPage initialCityCode="hangzhou" />);
    await waitFor(() => {
      expect(api.listOrderReverseRequests).toHaveBeenCalledTimes(1);
      expect(api.listAftersaleComplaints).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/^退款成功$/)).toBeNull();
    expect(screen.queryByText(/^Provider 成功$/)).toBeNull();
  });

  it("A-07 surfaces partial contract failure instead of treating it as an empty success", async () => {
    api.listAftersaleComplaints.mockRejectedValue(new Error("complaint API 503"));
    render(<AftersaleOpsPage initialCityCode="hangzhou" />);
    await waitFor(() => expect(document.body.textContent).toContain("请求失败"));
    expect(api.listOrderReverseRequests).toHaveBeenCalledTimes(1);
  });

  it("A-08 displays retry-wait delivery evidence with externalProviderExecuted=false", async () => {
    api.enterprise.listClients.mockResolvedValue({ ok: true, clients: [{
      businessClientId: "business-01", cityCode: "hangzhou", clientCode: "HZ-001",
      name: "杭州企业客户", status: "active", billingMode: "monthly",
      billingCustomerId: "customer-enterprise-01", createdAt: at, updatedAt: at,
    }] });
    api.enterprise.listWebhookDeliveries.mockResolvedValue({ ok: true, deliveries: [{
      deliveryId: "delivery-retry", subscriptionId: "subscription-01", businessClientId: "business-01",
      cityCode: "hangzhou", eventId: "event-01", eventType: "order.created", status: "retry_wait",
      attemptCount: 1, maxAttempts: 5, nextRetryAt: at, payload: {}, payloadSha256: "0".repeat(64),
      signature: "controlled-signature", providerEnvelope: {
        provider: "https", providerStatus: "failed_https", externalProviderExecuted: false,
        httpStatus: 503, responseBody: null, attemptedAt: at,
      }, createdAt: at, updatedAt: at,
    }] });
    render(<EnterpriseOpsPage initialCityCode="hangzhou" />);
    expect(await screen.findByText("杭州企业客户")).toBeTruthy();
    await waitFor(() => expect(api.enterprise.listWebhookDeliveries).toHaveBeenCalledWith("business-01"));
    expect(screen.queryByText(/^已执行$/)).toBeNull();
  });

  it("A-12 renders server-confirmed quality metrics and exposes fetch failure", async () => {
    api.getSupportQualityDashboard.mockResolvedValueOnce({ ok: true, dashboard: {
      response_count: 12, average_score: 4.5, score_1: 0, score_2: 0, score_3: 1,
      score_4: 4, score_5: 7, review_count: 8, average_review_score: 92,
    } });
    const view = render(<SupportQualityPage initialCityCode="hangzhou" />);
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("92")).toBeTruthy();
    view.unmount();

    api.getSupportQualityDashboard.mockRejectedValueOnce(new Error("quality API unavailable"));
    render(<SupportQualityPage initialCityCode="hangzhou" />);
    await waitFor(() => expect(document.body.textContent).toContain("请求失败"));
  });
});
