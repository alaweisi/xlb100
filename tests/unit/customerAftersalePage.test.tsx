// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AftersaleComplaintResponse,
  FulfillmentEvidenceAggregateResponse,
  OrderReverseResponse,
} from "@xlb/api-client";
import {
  CustomerAftersalePage,
  type CustomerAftersalePageProps,
} from "../../apps/customer/src/pages/CustomerAftersalePage";

const now = "2026-07-22T08:00:00.000Z";

const reverseRequest: OrderReverseResponse = {
  reverseRequestId: "reverse-b4-01",
  cityCode: "hangzhou",
  orderId: "order-b4-01",
  customerId: "customer-b4",
  reverseType: "reschedule",
  status: "requested",
  reason: "临时有事，需要调整上门时间",
  requestedScheduledAt: "2026-07-25T01:00:00.000Z",
  requestedTimeSlot: "morning",
  idempotencyKey: "reverse-key-b4",
  reviewNote: null,
  reviewedByAdminId: null,
  reviewedAt: null,
  appliedAt: null,
  createdAt: now,
  updatedAt: now,
};

const complaint: AftersaleComplaintResponse = {
  complaintId: "complaint-b4-01",
  cityCode: "hangzhou",
  orderId: "order-b4-01",
  customerId: "customer-b4",
  category: "service_quality",
  priority: "normal",
  description: "清洁结果与约定标准不一致",
  status: "in_progress",
  idempotencyKey: "complaint-key-b4",
  assignedAdminId: null,
  resolutionType: null,
  resolutionNote: null,
  submittedAt: now,
  resolvedAt: null,
  closedAt: null,
  updatedAt: now,
};

const evidence: FulfillmentEvidenceAggregateResponse = {
  fulfillmentId: "fulfillment-b4-01",
  orderId: "order-b4-01",
  cityCode: "hangzhou",
  fulfillmentStatus: "completed",
  evidence: [{
    evidenceId: "evidence-b4-01",
    cityCode: "hangzhou",
    fulfillmentId: "fulfillment-b4-01",
    orderId: "order-b4-01",
    complaintId: null,
    mediaAssetId: "media-b4-01",
    evidenceType: "completion",
    note: null,
    capturedAt: now,
    createdByWorkerId: "worker-b4",
    createdAt: now,
    mediaAsset: {
      mediaAssetId: "media-b4-01",
      cityCode: "hangzhou",
      orderId: "order-b4-01",
      fulfillmentId: "fulfillment-b4-01",
      complaintId: null,
      uploadedByType: "worker",
      uploadedById: "worker-b4",
      originalFileName: "completion.webp",
      contentType: "image/webp",
      sizeBytes: 2048,
      checksumSha256: "a".repeat(64),
      signatureValidated: true,
      securityScanStatus: "not_malware_scanned_local",
      storage: {
        provider: "local",
        providerName: "xlb-local-filesystem",
        providerStatus: "stored_local",
        externalProviderExecuted: false,
        objectKey: "b4/evidence.webp",
        storageUri: "local://b4/evidence.webp",
        publicUrl: null,
        checksumSha256: "a".repeat(64),
        sizeBytes: 2048,
        contentType: "image/webp",
        storedAt: now,
      },
      createdAt: now,
    },
  }],
  confirmation: {
    confirmationId: "confirmation-b4-01",
    cityCode: "hangzhou",
    fulfillmentId: "fulfillment-b4-01",
    orderId: "order-b4-01",
    customerId: "customer-b4",
    status: "pending",
    complaintId: null,
    customerNote: null,
    evidenceSnapshot: [],
    confirmedAt: null,
    disputedAt: null,
    createdAt: now,
    updatedAt: now,
  },
};

function createApi(): CustomerAftersalePageProps["api"] {
  return {
    createOrderReverseRequest: vi.fn().mockResolvedValue({ reverseRequest }),
    listOrderReverseRequests: vi.fn().mockResolvedValue({ reverseRequests: [reverseRequest] }),
    createAftersaleComplaint: vi.fn().mockResolvedValue({ complaint }),
    listAftersaleComplaints: vi.fn().mockResolvedValue({ complaints: [complaint] }),
    getOrderFulfillmentEvidence: vi.fn().mockResolvedValue({ aggregates: [evidence] }),
    decideFulfillmentConfirmation: vi.fn().mockResolvedValue({ confirmation: { status: "confirmed" } }),
  };
}

afterEach(() => cleanup());

describe("CustomerAftersalePage", () => {
  it("renders customer-facing Phase17 states without leaking storage implementation copy", async () => {
    render(<CustomerAftersalePage api={createApi()} cityCode="hangzhou" orderIds={["order-b4-01"]} />);

    expect(await screen.findByText("待平台审核")).toBeTruthy();
    expect(screen.getByText("处理中")).toBeTruthy();
    expect(screen.getByText("等待你确认")).toBeTruthy();
    expect(screen.getByRole("link", { name: "转入客服跟进" }).getAttribute("href")).toBe(
      "/customer/support?cityCode=hangzhou&orderId=order-b4-01&complaintId=complaint-b4-01",
    );
    expect(screen.getByText("履约图片由平台私密保存，仅用于当前订单确认与售后处理。")).toBeTruthy();
    expect(screen.queryByText(/local|mock|providerStatus|Service Evidence/i)).toBeNull();
  });

  it("shows an honest no-order state and does not call aftersale endpoints", () => {
    const api = createApi();
    render(<CustomerAftersalePage api={api} cityCode="hangzhou" orderIds={[]} />);

    expect(screen.getByText("还没有可处理的订单")).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看我的订单" }).getAttribute("href")).toBe(
      "/customer/orders?cityCode=hangzhou",
    );
    expect(api.listOrderReverseRequests).not.toHaveBeenCalled();
    expect(api.listAftersaleComplaints).not.toHaveBeenCalled();
    expect(api.getOrderFulfillmentEvidence).not.toHaveBeenCalled();
  });

  it("submits a reverse request with the authoritative contract and waits for server confirmation", async () => {
    const api = createApi();
    render(<CustomerAftersalePage api={api} cityCode="hangzhou" orderIds={["order-b4-01"]} />);
    await screen.findByText("待平台审核");

    fireEvent.change(screen.getByLabelText("申请原因"), { target: { value: "需要调整服务安排" } });
    fireEvent.click(screen.getByRole("button", { name: "提交变更申请" }));

    await waitFor(() => expect(api.createOrderReverseRequest).toHaveBeenCalledTimes(1));
    expect(api.createOrderReverseRequest).toHaveBeenCalledWith("order-b4-01", expect.objectContaining({
      reverseType: "cancel",
      reason: "需要调整服务安排",
      idempotencyKey: expect.stringMatching(/^customer-reverse-/),
    }));
    expect(await screen.findByText("申请已由平台受理")).toBeTruthy();
    expect(screen.getByText("服务记录号：reverse-b4-01")).toBeTruthy();
  });

  it("requires a complaint link for a dispute and preserves Phase17 decision payload", async () => {
    const api = createApi();
    render(<CustomerAftersalePage api={api} cityCode="hangzhou" orderIds={["order-b4-01"]} />);
    await screen.findByText("等待你确认");

    fireEvent.change(screen.getByLabelText("争议关联客诉"), { target: { value: "complaint-b4-01" } });
    fireEvent.change(screen.getByLabelText("确认备注（可选）/ 争议说明（必填）"), { target: { value: "结果与现场不一致" } });
    fireEvent.click(screen.getByRole("button", { name: "提出履约争议" }));

    await waitFor(() => expect(api.decideFulfillmentConfirmation).toHaveBeenCalledWith("fulfillment-b4-01", {
      decision: "disputed",
      note: "结果与现场不一致",
      complaintId: "complaint-b4-01",
    }));
  });

  it("standardizes load failures without exposing raw service errors", async () => {
    const api = createApi();
    api.listOrderReverseRequests = vi.fn().mockRejectedValue(new Error("database host leaked"));
    render(<CustomerAftersalePage api={api} cityCode="hangzhou" orderIds={["order-b4-01"]} />);

    expect(await screen.findByText("暂时无法完成请求")).toBeTruthy();
    expect(screen.getByText(/已填写的内容仍保留在页面中/)).toBeTruthy();
    expect(screen.queryByText(/database host leaked/)).toBeNull();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });
});
