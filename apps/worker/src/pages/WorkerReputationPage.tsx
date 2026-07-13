import { useCallback, useEffect, useState } from "react";
import type {
  CreateReviewAppealRequest,
  ReviewAppeal,
  WorkerReputation,
  WorkerReviewAppealTarget,
} from "@xlb/types";
import { Button, Card, EmptyState, ErrorState, LoadingState, StatusTag, Textarea } from "@xlb/ui";
import "./worker-reputation.css";

export interface WorkerReputationApi {
  getMyReputation(): Promise<{ ok: true; reputation: WorkerReputation | null }>;
  listReviewAppealTargets(): Promise<{ ok: true; items: WorkerReviewAppealTarget[] }>;
  createReviewAppeal(
    reviewId: string,
    body: CreateReviewAppealRequest,
  ): Promise<{ ok: true; appeal: ReviewAppeal; idempotent: boolean }>;
  withdrawReviewAppeal(
    reviewId: string,
    body: { moderationVersion: number; idempotencyKey: string },
  ): Promise<{ ok: true; appeal: ReviewAppeal; idempotent: boolean }>;
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === "object" && "status" in cause && cause.status === 409) {
    return "This moderation decision changed or already has an active appeal. Refresh and try again.";
  }
  return cause instanceof Error ? cause.message : fallback;
}

export function WorkerReputationPage({ api }: { api: WorkerReputationApi }) {
  const [reputation, setReputation] = useState<WorkerReputation | null>(null);
  const [appealTargets, setAppealTargets] = useState<WorkerReviewAppealTarget[]>([]);
  const [appealReasons, setAppealReasons] = useState<Record<string, string>>({});
  const [appealKeys, setAppealKeys] = useState<Record<string, string>>({});
  const [busyAppeal, setBusyAppeal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reputationResponse, targetResponse] = await Promise.all([
        api.getMyReputation(),
        api.listReviewAppealTargets(),
      ]);
      setReputation(reputationResponse.reputation);
      setAppealTargets(targetResponse.items);
    } catch (cause) {
      setError(errorMessage(cause, "Unable to load reputation"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const submitAppeal = useCallback(async (target: WorkerReviewAppealTarget) => {
    const reason = appealReasons[target.reviewId]?.trim();
    if (!reason || target.activeAppealStatus) return;
    const idempotencyKey = appealKeys[target.reviewId]
      ?? `worker-review-appeal-${crypto.randomUUID()}`;
    if (!appealKeys[target.reviewId]) {
      setAppealKeys((previous) => ({ ...previous, [target.reviewId]: idempotencyKey }));
    }
    setBusyAppeal(target.reviewId);
    setError(null);
    try {
      await api.createReviewAppeal(target.reviewId, {
        moderationVersion: target.moderationVersion,
        reason,
        idempotencyKey,
      });
      setAppealReasons((previous) => ({ ...previous, [target.reviewId]: "" }));
      setAppealKeys((previous) => {
        const next = { ...previous };
        delete next[target.reviewId];
        return next;
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Unable to submit review appeal"));
    } finally {
      setBusyAppeal(null);
    }
  }, [api, appealKeys, appealReasons, load]);

  const withdrawAppeal = useCallback(async (target: WorkerReviewAppealTarget) => {
    if (target.activeAppealStatus !== "open") return;
    const commandKey = `withdraw:${target.reviewId}:${target.moderationVersion}`;
    const idempotencyKey = appealKeys[commandKey]
      ?? `worker-review-withdraw-${crypto.randomUUID()}`;
    if (!appealKeys[commandKey]) {
      setAppealKeys((previous) => ({ ...previous, [commandKey]: idempotencyKey }));
    }
    setBusyAppeal(target.reviewId);
    setError(null);
    try {
      await api.withdrawReviewAppeal(target.reviewId, {
        moderationVersion: target.moderationVersion,
        idempotencyKey,
      });
      setAppealKeys((previous) => {
        const next = { ...previous };
        delete next[commandKey];
        return next;
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Unable to withdraw review appeal"));
    } finally {
      setBusyAppeal(null);
    }
  }, [api, appealKeys, load]);

  if (loading) return <LoadingState title="Loading reputation" description="Reading the active projection generation and appealable decisions." />;
  if (error && !reputation && appealTargets.length === 0) {
    return <ErrorState title="Reputation unavailable" description={error} action={<Button onClick={() => void load()}>Retry</Button>} />;
  }

  return (
    <div className="worker-reputation-page">
      {error && <ErrorState title="Review operation failed" description={error} action={<Button onClick={() => void load()}>Refresh</Button>} />}
      {reputation ? (
        <Card
          title="My reputation"
          actions={<StatusTag tone="success">visible reviews only</StatusTag>}
          className="worker-reputation-panel"
        >
          <div className="worker-reputation-stack">
            <div className="worker-reputation-summary">
              <strong className="worker-reputation-score">
                {reputation.averageRating?.toFixed(2) ?? "-"}
              </strong>
              <span className="worker-reputation-helper">{reputation.ratingCount} visible reviews</span>
            </div>
            <div aria-label="Rating distribution" className="worker-reputation-distribution">
              {([5, 4, 3, 2, 1] as const).map((rating) => {
                const ratingKey = String(rating) as keyof WorkerReputation["ratingDistribution"];
                return (
                  <div key={rating} className="worker-reputation-distribution-row">
                    <span>{rating}/5</span>
                    <progress
                      aria-label={`${rating} star review count`}
                      className="worker-reputation-meter"
                      max={reputation.ratingCount || 1}
                      value={reputation.ratingDistribution[ratingKey]}
                    />
                    <span>{reputation.ratingDistribution[ratingKey]}</span>
                  </div>
                );
              })}
            </div>
            <p className="worker-reputation-helper">
              Formula {reputation.formulaRevision}. This read model is not used for dispatch, eligibility, ranking, or qualification.
            </p>
            <div className="worker-reputation-actions">
              <StatusTag tone="muted">generation {reputation.sourceGenerationId}</StatusTag>
              <StatusTag tone="muted">watermark {reputation.sourceWatermark ?? "none"}</StatusTag>
              <Button onClick={() => void load()}>Refresh</Button>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState title="No visible ratings yet" description="Pending and hidden reviews never contribute to this aggregate." />
      )}

      <Card
        title="Moderation appeals"
        actions={<StatusTag tone="muted">decision metadata only</StatusTag>}
        className="worker-reputation-panel"
      >
        {appealTargets.length === 0 ? (
          <EmptyState title="No appealable decisions" description="No visible or hidden moderation decision is available for appeal." />
        ) : (
          <div className="worker-reputation-appeals">
            {appealTargets.map((target) => (
              <div key={`${target.reviewId}:${target.moderationVersion}`} className="worker-reputation-appeal">
                <div className="worker-reputation-actions">
                  <StatusTag tone={target.visibility === "visible" ? "success" : "warning"}>{target.visibility}</StatusTag>
                  <StatusTag tone="muted">decision v{target.moderationVersion}</StatusTag>
                  <StatusTag tone="muted">{new Date(target.decidedAt).toLocaleString()}</StatusTag>
                  {target.activeAppealStatus && <StatusTag tone="warning">appeal {target.activeAppealStatus}</StatusTag>}
                  {target.activeAppealStatus === "open" && (
                    <Button
                      disabled={busyAppeal !== null}
                      onClick={() => void withdrawAppeal(target)}
                    >
                      {busyAppeal === target.reviewId ? "Withdrawing appeal" : "Withdraw appeal"}
                    </Button>
                  )}
                </div>
                {!target.activeAppealStatus && (
                  <>
                    <Textarea
                      aria-label={`Appeal reason for decision ${target.moderationVersion}`}
                      maxLength={1_000}
                      placeholder="Explain why this moderation decision should be reviewed"
                      value={appealReasons[target.reviewId] ?? ""}
                      onChange={(event) => setAppealReasons((previous) => ({
                        ...previous,
                        [target.reviewId]: event.target.value,
                      }))}
                    />
                    <div>
                      <Button
                        disabled={busyAppeal !== null || !appealReasons[target.reviewId]?.trim()}
                        onClick={() => void submitAppeal(target)}
                      >
                        {busyAppeal === target.reviewId ? "Submitting appeal" : "Appeal decision"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
