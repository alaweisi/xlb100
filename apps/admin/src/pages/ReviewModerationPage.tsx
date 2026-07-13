import { useCallback, useEffect, useState } from "react";
import type { ReviewAppealQueueItem, ReviewModerationQueueItem, ReviewVisibility } from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi, readStoredAdminSession } from "../adminAuth";
import "./review-moderation.css";

export function ReviewModerationPage({ initialCityCode }: { initialCityCode?: string }) {
  const cityCode = initialCityCode || "hangzhou";
  const canModerate = readStoredAdminSession()?.role === "admin";
  const [visibility, setVisibility] = useState<ReviewVisibility>("pending_moderation");
  const [reviews, setReviews] = useState<ReviewModerationQueueItem[]>([]);
  const [appeals, setAppeals] = useState<ReviewAppealQueueItem[]>([]);
  const [reviewNextCursor, setReviewNextCursor] = useState<string | null>(null);
  const [appealNextCursor, setAppealNextCursor] = useState<string | null>(null);
  const [reviewContent, setReviewContent] = useState<Record<string, string>>({});
  const [contentBusy, setContentBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [idempotencyKeys, setIdempotencyKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function operationError(cause: unknown, fallback: string): string {
    if (cause && typeof cause === "object" && "status" in cause && cause.status === 409) {
      return "The review or appeal changed. Refresh the queue before retrying.";
    }
    return cause instanceof Error ? cause.message : fallback;
  }

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const [reviewResult, appealResult] = await Promise.all([
        adminOpsApi.review.listReviewModeration(visibility),
        adminOpsApi.review.listReviewAppeals("open"),
      ]);
      setReviews(reviewResult.items);
      setAppeals(appealResult.items);
      setReviewNextCursor(reviewResult.nextCursor);
      setAppealNextCursor(appealResult.nextCursor);
    } catch (cause) {
      setError(operationError(cause, "Unable to load Review moderation"));
    } finally {
      setBusy(null);
    }
  }, [visibility]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setReviewContent({}); }, [cityCode]);

  async function loadMoreReviews() {
    if (!reviewNextCursor) return;
    setBusy("load-more-reviews");
    setError(null);
    try {
      const result = await adminOpsApi.review.listReviewModeration(
        visibility, 50, reviewNextCursor,
      );
      setReviews((current) => [...current, ...result.items]);
      setReviewNextCursor(result.nextCursor);
    } catch (cause) {
      setError(operationError(cause, "Unable to load more reviews"));
    } finally {
      setBusy(null);
    }
  }

  async function loadMoreAppeals() {
    if (!appealNextCursor) return;
    setBusy("load-more-appeals");
    setError(null);
    try {
      const result = await adminOpsApi.review.listReviewAppeals("open", 50, appealNextCursor);
      setAppeals((current) => [...current, ...result.items]);
      setAppealNextCursor(result.nextCursor);
    } catch (cause) {
      setError(operationError(cause, "Unable to load more appeals"));
    } finally {
      setBusy(null);
    }
  }

  async function viewContent(reviewId: string) {
    if (!canModerate || reviewContent[reviewId] !== undefined) return;
    setContentBusy(reviewId);
    setError(null);
    try {
      const result = await adminOpsApi.review.getReviewContent(reviewId);
      if (result.content.reviewId !== reviewId) {
        throw new Error("Review content response identity mismatch");
      }
      setReviewContent((previous) => ({ ...previous, [reviewId]: result.content.comment }));
    } catch (cause) {
      setError(operationError(cause, "Unable to read review content"));
    } finally {
      setContentBusy(null);
    }
  }

  async function moderate(item: ReviewModerationQueueItem, decision: "visible" | "hidden") {
    const reason = reasons[item.reviewId]?.trim();
    if (!reason) return;
    setBusy(`review:${item.reviewId}`);
    setError(null);
    const commandKey = `review:${item.reviewId}:${item.visibilityVersion}:${decision}`;
    const idempotencyKey = idempotencyKeys[commandKey]
      ?? `admin-review-${crypto.randomUUID()}`;
    if (!idempotencyKeys[commandKey]) {
      setIdempotencyKeys((previous) => ({ ...previous, [commandKey]: idempotencyKey }));
    }
    try {
      await adminOpsApi.review.moderateReview(item.reviewId, {
        decision,
        reasonCode: decision === "visible" ? "content_approved" : "content_policy_violation",
        reason,
        expectedVersion: item.visibilityVersion,
        idempotencyKey,
      });
      await load();
      setIdempotencyKeys((previous) => {
        const next = { ...previous };
        delete next[commandKey];
        return next;
      });
    } catch (cause) {
      setError(operationError(cause, "Moderation failed"));
    } finally {
      setBusy(null);
    }
  }

  async function resolveAppeal(appeal: ReviewAppealQueueItem, resolution: "upheld" | "rejected") {
    const reason = reasons[appeal.appealId]?.trim();
    if (!reason) return;
    setBusy(`appeal:${appeal.appealId}`);
    setError(null);
    const commandKey = `appeal:${appeal.appealId}:${appeal.version}:${resolution}`;
    const idempotencyKey = idempotencyKeys[commandKey]
      ?? `admin-appeal-${crypto.randomUUID()}`;
    if (!idempotencyKeys[commandKey]) {
      setIdempotencyKeys((previous) => ({ ...previous, [commandKey]: idempotencyKey }));
    }
    try {
      await adminOpsApi.review.resolveReviewAppeal(appeal.appealId, {
        resolution,
        reason,
        expectedVersion: appeal.version,
        idempotencyKey,
      });
      await load();
      setIdempotencyKeys((previous) => {
        const next = { ...previous };
        delete next[commandKey];
        return next;
      });
    } catch (cause) {
      setError(operationError(cause, "Appeal resolution failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="review-moderation-page">
      <Card
        title="Review moderation"
        actions={<><ScopeBadge scope={`city: ${cityCode}`} /><StatusTag tone={canModerate ? "success" : "warning"}>{canModerate ? "review admin" : "read-only"}</StatusTag></>}
      >
        <div className="review-moderation-actions">
          {(["pending_moderation", "visible", "hidden"] as ReviewVisibility[]).map((value) => (
            <Button key={value} variant={visibility === value ? "primary" : undefined} onClick={() => setVisibility(value)}>{value}</Button>
          ))}
          <Button disabled={busy !== null} onClick={() => void load()}>Refresh</Button>
        </div>
      </Card>
      {error && <ApiErrorPanel title="Review operation failed" detail={error} action={<Button onClick={() => void load()}>Retry</Button>} />}
      {busy === "load" && reviews.length === 0 && appeals.length === 0 && (
        <LoadingState title="Loading review governance" description="Reading the scoped moderation and appeal queues." />
      )}
      <Card title="Moderation queue" actions={<StatusTag tone="primary">{reviews.length}</StatusTag>}>
        {busy === "load" && reviews.length === 0 ? null : reviews.length === 0 ? <EmptyState title="No reviews in this state" /> : (
          <Table
            rows={reviews}
            getRowKey={(row) => row.reviewId}
            columns={[
              { key: "review", title: "Review", render: (row) => <div><strong>{row.rating}/5</strong><br /><small>{row.reviewId}</small></div> },
              { key: "worker", title: "Worker", render: (row) => row.workerId },
              { key: "content", title: "Content", render: (row) => (
                <div className="review-moderation-content">
                  {reviewContent[row.reviewId] !== undefined
                    ? <span className="review-moderation-text">{reviewContent[row.reviewId]}</span>
                    : <StatusTag tone="warning">restricted</StatusTag>}
                  {canModerate && reviewContent[row.reviewId] === undefined && (
                    <Button
                      disabled={contentBusy !== null || busy !== null}
                      onClick={() => void viewContent(row.reviewId)}
                    >
                      {contentBusy === row.reviewId ? "Loading content" : "View content"}
                    </Button>
                  )}
                </div>
              ) },
              { key: "state", title: "State", render: (row) => <StatusTag tone={row.visibility === "visible" ? "success" : "warning"}>{row.visibility} v{row.moderationVersion}</StatusTag> },
              { key: "reason", title: "Decision reason", render: (row) => <Input disabled={!canModerate} maxLength={1_000} value={reasons[row.reviewId] ?? ""} onChange={(event) => setReasons((previous) => ({ ...previous, [row.reviewId]: event.target.value }))} /> },
              { key: "actions", title: "Actions", render: (row) => <div className="review-moderation-actions"><Button disabled={!canModerate || busy !== null || !reasons[row.reviewId]?.trim()} onClick={() => void moderate(row, "visible")}>Show</Button><Button disabled={!canModerate || busy !== null || !reasons[row.reviewId]?.trim()} onClick={() => void moderate(row, "hidden")}>Hide</Button></div> },
            ]}
          />
        )}
        {reviewNextCursor && <div className="review-moderation-load-more"><Button disabled={busy !== null} onClick={() => void loadMoreReviews()}>Load more reviews</Button></div>}
      </Card>
      <Card title="Open appeals" actions={<StatusTag tone="primary">{appeals.length}</StatusTag>}>
        {busy === "load" && appeals.length === 0 ? null : appeals.length === 0 ? <EmptyState title="No open appeals" /> : (
          <Table
            rows={appeals}
            getRowKey={(row) => row.appealId}
            columns={[
              { key: "appeal", title: "Appeal", render: (row) => <div><strong>{row.subjectType}</strong><br /><small>{row.appealId}</small></div> },
              { key: "review", title: "Review", render: (row) => `${row.reviewId} / moderation v${row.moderationVersion}` },
              { key: "request", title: "Reason", render: (row) => row.detailsRestricted
                ? <StatusTag tone="warning">restricted</StatusTag>
                : row.reason },
              { key: "resolution", title: "Resolution reason", render: (row) => <Input disabled={!canModerate} maxLength={1_000} value={reasons[row.appealId] ?? ""} onChange={(event) => setReasons((previous) => ({ ...previous, [row.appealId]: event.target.value }))} /> },
              { key: "actions", title: "Actions", render: (row) => <div className="review-moderation-actions"><Button disabled={!canModerate || busy !== null || !reasons[row.appealId]?.trim()} onClick={() => void resolveAppeal(row, "upheld")}>Uphold</Button><Button disabled={!canModerate || busy !== null || !reasons[row.appealId]?.trim()} onClick={() => void resolveAppeal(row, "rejected")}>Reject</Button></div> },
            ]}
          />
        )}
        {appealNextCursor && <div className="review-moderation-load-more"><Button disabled={busy !== null} onClick={() => void loadMoreAppeals()}>Load more appeals</Button></div>}
      </Card>
    </div>
  );
}
