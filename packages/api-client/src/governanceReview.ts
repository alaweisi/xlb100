import type { ApiClient } from "./createApiClient.js";

export function createGovernanceReviewApi(client: ApiClient) {
  return {
    submitReview: (intentId: string, body: Record<string, unknown>) => client.post<{ ok: true; review: unknown }>(`/api/internal/settlement-action-governance/intents/${encodeURIComponent(intentId)}/reviews`, body),
    listReviews: (query?: Record<string, string>) => { const qs = query ? "?" + new URLSearchParams(query).toString() : ""; return client.get<{ ok: true; reviews: unknown[] }>(`/api/internal/settlement-action-governance/reviews${qs}`); },
    getReview: (reviewId: string) => client.get<{ ok: true; review: unknown }>(`/api/internal/settlement-action-governance/reviews/${encodeURIComponent(reviewId)}`),
    approveReview: (reviewId: string, body: Record<string, unknown>) => client.post<{ ok: true; review: unknown }>(`/api/internal/settlement-action-governance/reviews/${encodeURIComponent(reviewId)}/approve-governance`, body),
    rejectReview: (reviewId: string, body: Record<string, unknown>) => client.post<{ ok: true; review: unknown }>(`/api/internal/settlement-action-governance/reviews/${encodeURIComponent(reviewId)}/reject-governance`, body),
    requestChanges: (reviewId: string, body: Record<string, unknown>) => client.post<{ ok: true; review: unknown }>(`/api/internal/settlement-action-governance/reviews/${encodeURIComponent(reviewId)}/request-changes`, body),
  };
}
export const governanceReviewApi = { create: createGovernanceReviewApi };
