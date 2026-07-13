// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkerReputationPage } from "../../apps/worker/src/pages/WorkerReputationPage";
import { ReviewModerationPage } from "../../apps/admin/src/pages/ReviewModerationPage";
import {
  createAdminReviewApi,
  createWorkerReputationApi,
  validateModerationListResponse,
  validateReviewContentResponse,
  validateWorkerAppealTargetsResponse,
  validateWorkerReputationResponse,
} from "../../packages/api-client/src/reviewReputation";

const adminMocks = vi.hoisted(() => ({
  listReviewModeration: vi.fn(),
  listReviewAppeals: vi.fn(),
  getReviewContent: vi.fn(),
  moderateReview: vi.fn(),
  resolveReviewAppeal: vi.fn(),
}));
const adminRole = vi.hoisted(() => ({ value: "operator" }));

vi.mock("../../apps/admin/src/adminAuth", () => ({
  adminOpsApi: { review: adminMocks },
  readStoredAdminSession: () => ({ role: adminRole.value, userId: `${adminRole.value}-hangzhou` }),
}));

describe("Phase28 Review/Reputation pages", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    adminRole.value = "operator";
  });

  it("renders only the worker self aggregate and states the dispatch boundary", async () => {
    const getMyReputation = vi.fn().mockResolvedValue({
      ok: true,
      reputation: {
        workerId: "worker-1",
        cityCode: "hangzhou",
        ratingCount: 3,
        ratingSum: 14,
        ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 2 },
        averageRating: 14 / 3,
        sourceGenerationId: "generation-1",
        formulaRevision: "lifetime-visible-arithmetic-v1",
        sourceWatermark: "delivery-3",
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
    });

    render(<WorkerReputationPage api={{
      getMyReputation,
      listReviewAppealTargets: vi.fn().mockResolvedValue({ ok: true, items: [] }),
      createReviewAppeal: vi.fn(),
      withdrawReviewAppeal: vi.fn(),
    }} />);

    expect(await screen.findByText("4.67")).toBeTruthy();
    expect(screen.getByText(/not used for dispatch, eligibility, ranking, or qualification/i)).toBeTruthy();
    expect(getMyReputation).toHaveBeenCalledTimes(1);
  });

  it("lets the Worker appeal only from privacy-minimized decision metadata", async () => {
    const createReviewAppeal = vi.fn().mockResolvedValue({ ok: true });
    const listReviewAppealTargets = vi.fn().mockResolvedValue({
      ok: true,
      items: [{
        reviewId: "review-1",
        visibility: "hidden",
        moderationVersion: 2,
        decidedAt: "2026-07-13T12:00:00.000Z",
        activeAppealStatus: null,
      }],
    });
    render(<WorkerReputationPage api={{
      getMyReputation: vi.fn().mockResolvedValue({ ok: true, reputation: null }),
      listReviewAppealTargets,
      createReviewAppeal,
      withdrawReviewAppeal: vi.fn(),
    }} />);

    const reason = await screen.findByLabelText("Appeal reason for decision 2");
    fireEvent.change(reason, { target: { value: "Please review this decision" } });
    fireEvent.click(screen.getByRole("button", { name: "Appeal decision" }));

    await waitFor(() => expect(createReviewAppeal).toHaveBeenCalledWith(
      "review-1",
      expect.objectContaining({ moderationVersion: 2, reason: "Please review this decision" }),
    ));
    const body = createReviewAppeal.mock.calls[0][1];
    expect(body.idempotencyKey).toMatch(/^worker-review-appeal-/);
    expect(body).not.toHaveProperty("comment");
    expect(body).not.toHaveProperty("customerId");
  });

  it("fails closed when a Worker response carries extra review content or inconsistent totals", () => {
    expect(() => validateWorkerAppealTargetsResponse({
      ok: true,
      items: [{
        reviewId: "review-1",
        visibility: "hidden",
        moderationVersion: 2,
        decidedAt: "2026-07-13T12:00:00.000Z",
        activeAppealStatus: null,
        comment: "must not cross the Worker boundary",
      }],
    })).toThrow(/unexpected response shape/i);

    expect(() => validateWorkerReputationResponse({
      ok: true,
      reputation: {
        workerId: "worker-1",
        cityCode: "hangzhou",
        ratingCount: 2,
        ratingSum: 10,
        ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 },
        averageRating: 5,
        sourceGenerationId: "generation-1",
        formulaRevision: "lifetime-visible-arithmetic-v1",
        sourceWatermark: null,
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
    })).toThrow(/internally inconsistent/i);
  });

  it("rejects a restricted Admin queue row if comment content is present", () => {
    expect(() => validateModerationListResponse({
      ok: true,
      items: [{
        reviewId: "review-1",
        cityCode: "hangzhou",
        orderId: "order-1",
        workerId: "worker-1",
        rating: 5,
        comment: "must be redacted",
        commentRestricted: true,
        visibility: "pending_moderation",
        moderationVersion: 0,
        visibilityVersion: 1,
        createdAt: "2026-07-13T12:00:00.000Z",
      }],
      nextCursor: null,
    })).toThrow(/comments must remain redacted/i);
  });

  it("uses canonical Worker and audited Admin content routes", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true });
    const post = vi.fn().mockResolvedValue({ ok: true });
    const client = { get, post } as never;
    await createWorkerReputationApi(client).getMyReputation();
    await createWorkerReputationApi(client).listReviewAppealTargets();
    await createAdminReviewApi(client).getReviewContent("review / 1");

    expect(get.mock.calls.map((call) => call[0])).toEqual([
      "/api/worker/reputation",
      "/api/worker/review-appeal-targets",
      "/api/admin/reviews/review%20%2F%201/content",
    ]);
  });

  it("accepts only the two-field audited content envelope", () => {
    expect(validateReviewContentResponse({
      ok: true,
      content: { reviewId: "review-1", comment: "Authorized detail" },
    }).content.comment).toBe("Authorized detail");
    expect(() => validateReviewContentResponse({
      ok: true,
      content: { reviewId: "review-1", comment: "Authorized detail", customerId: "forbidden" },
    })).toThrow(/unexpected response shape/i);
  });

  it("keeps Operator moderation read-only and redacts review content", async () => {
    adminMocks.listReviewModeration.mockResolvedValue({
      ok: true,
      items: [{
        reviewId: "review-1",
        cityCode: "hangzhou",
        orderId: "order-1",
        workerId: "worker-1",
        rating: 5,
        comment: null,
        commentRestricted: true,
        visibility: "pending_moderation",
        moderationVersion: 0,
        visibilityVersion: 1,
        createdAt: "2026-07-13T12:00:00.000Z",
      }],
      nextCursor: null,
    });
    adminMocks.listReviewAppeals.mockResolvedValue({ ok: true, items: [{
      appealId: "appeal-redacted",
      reviewId: "review-1",
      moderationVersion: 1,
      subjectType: "customer",
      subjectId: null,
      reason: null,
      status: "open",
      version: 1,
      resolutionReason: null,
      openedAt: "2026-07-13T12:00:00.000Z",
      resolvedAt: null,
      resolvedByAdminId: null,
      detailsRestricted: true,
    }], nextCursor: null });

    render(<ReviewModerationPage initialCityCode="hangzhou" />);

    expect(await screen.findByText("review-1")).toBeTruthy();
    expect(screen.getAllByText("restricted").length).toBeGreaterThan(0);
    expect(screen.getByText("read-only")).toBeTruthy();
    expect(screen.getAllByText("restricted").length).toBeGreaterThan(1);
    expect(screen.queryByText("private appellant statement")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Show" })).toHaveProperty("disabled", true);
      expect(screen.getByRole("button", { name: "Hide" })).toHaveProperty("disabled", true);
    });
    expect(screen.queryByRole("button", { name: "View content" })).toBeNull();
  });

  it("loads one audited review content item only after an Admin explicitly asks", async () => {
    adminRole.value = "admin";
    adminMocks.listReviewModeration.mockResolvedValue({
      ok: true,
      items: [{
        reviewId: "review-1",
        cityCode: "hangzhou",
        orderId: "order-1",
        workerId: "worker-1",
        rating: 5,
        comment: null,
        commentRestricted: true,
        visibility: "pending_moderation",
        moderationVersion: 0,
        visibilityVersion: 1,
        createdAt: "2026-07-13T12:00:00.000Z",
      }],
      nextCursor: null,
    });
    adminMocks.listReviewAppeals.mockResolvedValue({ ok: true, items: [], nextCursor: null });
    adminMocks.getReviewContent.mockResolvedValue({
      ok: true,
      content: { reviewId: "review-1", comment: "Authenticated single-item content" },
    });

    render(<ReviewModerationPage initialCityCode="hangzhou" />);
    fireEvent.click(await screen.findByRole("button", { name: "View content" }));

    expect(await screen.findByText("Authenticated single-item content")).toBeTruthy();
    expect(adminMocks.getReviewContent).toHaveBeenCalledTimes(1);
    expect(adminMocks.getReviewContent).toHaveBeenCalledWith("review-1");
  });

  it("loads the next moderation keyset page from the opaque cursor", async () => {
    const item = (reviewId: string) => ({
      reviewId,
      cityCode: "hangzhou",
      orderId: `order-${reviewId}`,
      workerId: "worker-1",
      rating: 5,
      comment: null,
      commentRestricted: true,
      visibility: "pending_moderation" as const,
      moderationVersion: 0,
      visibilityVersion: 1,
      createdAt: "2026-07-13T12:00:00.000Z",
    });
    adminMocks.listReviewModeration
      .mockResolvedValueOnce({ ok: true, items: [item("review-1")], nextCursor: "opaque_1" })
      .mockResolvedValueOnce({ ok: true, items: [item("review-2")], nextCursor: null });
    adminMocks.listReviewAppeals.mockResolvedValue({ ok: true, items: [], nextCursor: null });

    render(<ReviewModerationPage initialCityCode="hangzhou" />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more reviews" }));

    expect(await screen.findByText("review-2")).toBeTruthy();
    expect(adminMocks.listReviewModeration).toHaveBeenLastCalledWith(
      "pending_moderation", 50, "opaque_1",
    );
  });
});
