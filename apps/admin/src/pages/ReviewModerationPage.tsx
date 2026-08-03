import { useCallback, useEffect, useState } from "react";
import type { ReviewAppealQueueItem, ReviewModerationQueueItem, ReviewVisibility } from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi, adminVisibleError, readStoredAdminSession } from "../adminAuth";
import { adminDemoCityLabel, IS_ADMIN_INVESTOR_DEMO } from "../investorDemo";
import "./review-moderation.css";

export function ReviewModerationPage({
  initialCityCode,
  canModerate: canModerateOverride,
}: {
  initialCityCode?: string;
  canModerate?: boolean;
}) {
  const cityCode = initialCityCode || "hangzhou";
  const canModerate = canModerateOverride ?? readStoredAdminSession()?.role === "admin";
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
      return "评价状态已更新，请刷新列表后重试。";
    }
    return adminVisibleError(cause, fallback);
  }

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const [reviewResult, appealResult] = await Promise.all([
        adminOpsApi.review.listReviewModeration(visibility),
        IS_ADMIN_INVESTOR_DEMO
          ? Promise.resolve({ items: [], nextCursor: null })
          : adminOpsApi.review.listReviewAppeals("open"),
      ]);
      setReviews(reviewResult.items);
      setAppeals(appealResult.items);
      setReviewNextCursor(reviewResult.nextCursor);
      setAppealNextCursor(appealResult.nextCursor);
    } catch (cause) {
      setError(operationError(cause, "评价列表暂时无法加载，请稍后重试。"));
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
      setError(operationError(cause, "更多评价暂时无法加载，请稍后重试。"));
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
      setError(operationError(cause, "更多申诉暂时无法加载，请稍后重试。"));
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
      setError(operationError(cause, "评价内容暂时无法读取，请稍后重试。"));
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
      setError(operationError(cause, "评价处理未完成，请刷新后重试。"));
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
      setError(operationError(cause, "申诉处理未完成，请刷新后重试。"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="review-moderation-page">
      <Card
        title="评价与申诉"
        actions={<><ScopeBadge scope={`城市：${adminDemoCityLabel(cityCode)}`} /><StatusTag tone={canModerate ? "success" : "warning"}>{canModerate ? "可处理" : "只读查看"}</StatusTag></>}
      >
        <div className="review-moderation-actions">
          {(["pending_moderation", "visible", "hidden"] as ReviewVisibility[]).map((value) => (
            <Button key={value} variant={visibility === value ? "primary" : undefined} onClick={() => setVisibility(value)}>{{pending_moderation:"待审核",visible:"已展示",hidden:"已隐藏"}[value]}</Button>
          ))}
          <Button disabled={busy !== null} onClick={() => void load()}>刷新列表</Button>
        </div>
      </Card>
      {error && <ApiErrorPanel title="评价服务暂时不可用" detail={error} action={<Button onClick={() => void load()}>重新加载</Button>} />}
      {busy === "load" && reviews.length === 0 && appeals.length === 0 && (
        <LoadingState title="正在加载评价" description="正在读取当前城市的评价与申诉。" />
      )}
      <Card title="评价列表" actions={<StatusTag tone="primary">{reviews.length} 条</StatusTag>}>
        {busy === "load" && reviews.length === 0 ? null : reviews.length === 0 ? <EmptyState title="当前状态下暂无评价" /> : (
          <Table
            rows={reviews}
            getRowKey={(row) => row.reviewId}
            columns={[
              { key: "review", title: "评分", render: (row) => <div><strong>{row.rating}/5</strong><br /><small>{row.reviewId}</small></div> },
              { key: "worker", title: "师傅", render: (row) => IS_ADMIN_INVESTOR_DEMO ? "演示师傅" : row.workerId },
              { key: "content", title: "评价内容", render: (row) => (
                <div className="review-moderation-content">
                  {reviewContent[row.reviewId] !== undefined
                    ? <span className="review-moderation-text">{reviewContent[row.reviewId]}</span>
                    : <StatusTag tone="warning">内容受权限保护</StatusTag>}
                  {canModerate && reviewContent[row.reviewId] === undefined && (
                    <Button
                      disabled={contentBusy !== null || busy !== null}
                      onClick={() => void viewContent(row.reviewId)}
                    >
                      {contentBusy === row.reviewId ? "正在读取" : "查看内容"}
                    </Button>
                  )}
                </div>
              ) },
              { key: "state", title: "状态", render: (row) => <StatusTag tone={row.visibility === "visible" ? "success" : "warning"}>{row.visibility === "visible" ? "已展示" : row.visibility === "hidden" ? "已隐藏" : "待审核"}</StatusTag> },
              { key: "reason", title: "处理说明", render: (row) => <Input disabled={!canModerate} maxLength={1_000} value={reasons[row.reviewId] ?? ""} onChange={(event) => setReasons((previous) => ({ ...previous, [row.reviewId]: event.target.value }))} /> },
              { key: "actions", title: "操作", render: (row) => <div className="review-moderation-actions"><Button disabled={!canModerate || busy !== null || !reasons[row.reviewId]?.trim()} onClick={() => void moderate(row, "visible")}>展示</Button><Button disabled={!canModerate || busy !== null || !reasons[row.reviewId]?.trim()} onClick={() => void moderate(row, "hidden")}>隐藏</Button></div> },
            ]}
          />
        )}
        {reviewNextCursor && <div className="review-moderation-load-more"><Button disabled={busy !== null} onClick={() => void loadMoreReviews()}>加载更多评价</Button></div>}
      </Card>
      <Card title="待处理申诉" actions={<StatusTag tone="primary">{appeals.length} 条</StatusTag>}>
        {busy === "load" && appeals.length === 0 ? null : appeals.length === 0 ? <EmptyState title="当前没有待处理申诉" /> : (
          <Table
            rows={appeals}
            getRowKey={(row) => row.appealId}
            columns={[
              { key: "appeal", title: "申诉", render: (row) => <div><strong>{row.subjectType === "customer" ? "客户申诉" : "师傅申诉"}</strong><br /><small>{row.appealId}</small></div> },
              { key: "review", title: "关联评价", render: (row) => row.reviewId },
              { key: "request", title: "申诉原因", render: (row) => row.detailsRestricted
                ? <StatusTag tone="warning">内容受权限保护</StatusTag>
                : row.reason },
              { key: "resolution", title: "处理说明", render: (row) => <Input disabled={!canModerate} maxLength={1_000} value={reasons[row.appealId] ?? ""} onChange={(event) => setReasons((previous) => ({ ...previous, [row.appealId]: event.target.value }))} /> },
              { key: "actions", title: "操作", render: (row) => <div className="review-moderation-actions"><Button disabled={!canModerate || busy !== null || !reasons[row.appealId]?.trim()} onClick={() => void resolveAppeal(row, "upheld")}>支持申诉</Button><Button disabled={!canModerate || busy !== null || !reasons[row.appealId]?.trim()} onClick={() => void resolveAppeal(row, "rejected")}>驳回申诉</Button></div> },
            ]}
          />
        )}
        {appealNextCursor && <div className="review-moderation-load-more"><Button disabled={busy !== null} onClick={() => void loadMoreAppeals()}>加载更多申诉</Button></div>}
      </Card>
    </div>
  );
}
