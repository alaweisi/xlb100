import { useCallback, useEffect, useState } from "react";
import type { ReviewAppealQueueItem, ReviewModerationQueueItem, ReviewVisibility } from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi, readStoredAdminSession } from "../adminAuth";
import { businessLabel, cityLabel, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";
import "./review-moderation.css";

const visibilityOptions: ReviewVisibility[] = ["pending_moderation", "visible", "hidden"];

export function ReviewModerationPage({ initialCityCode }: { initialCityCode?: string }) {
  const cityCode = initialCityCode || "hangzhou";
  const canModerate = readStoredAdminSession()?.role === "admin";
  const online = useOnlineStatus();
  const [visibility, setVisibility] = useState<ReviewVisibility>("pending_moderation");
  const [reviews, setReviews] = useState<ReviewModerationQueueItem[]>([]);
  const [appeals, setAppeals] = useState<ReviewAppealQueueItem[]>([]);
  const [reviewNextCursor, setReviewNextCursor] = useState<string | null>(null);
  const [appealNextCursor, setAppealNextCursor] = useState<string | null>(null);
  const [reviewContent, setReviewContent] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [idempotencyKeys, setIdempotencyKeys] = useState<Record<string, string>>({});
  const [contentBusy, setContentBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const showError = (cause: unknown, subject: string) => {
    const failure = presentFailure(cause, subject);
    setError({ title: failure.title, detail: failure.detail });
    return failure;
  };

  const load = useCallback(async () => {
    setBusy("load"); setError(null); setNotice(null);
    const [reviewResult, appealResult] = await Promise.allSettled([
      adminOpsApi.review.listReviewModeration(visibility),
      adminOpsApi.review.listReviewAppeals("open"),
    ]);
    const failed: string[] = [];
    if (reviewResult.status === "fulfilled") {
      setReviews(reviewResult.value.items); setReviewNextCursor(reviewResult.value.nextCursor);
    } else {
      const failure = showError(reviewResult.reason, "评价审核队列");
      if (failure.kind === "forbidden") { setReviews([]); setReviewNextCursor(null); }
      failed.push("评价审核队列");
    }
    if (appealResult.status === "fulfilled") {
      setAppeals(appealResult.value.items); setAppealNextCursor(appealResult.value.nextCursor);
    } else {
      const failure = presentFailure(appealResult.reason, "评价申诉队列");
      if (failure.kind === "forbidden") { setAppeals([]); setAppealNextCursor(null); }
      if (reviewResult.status === "fulfilled") setError({ title: failure.title, detail: failure.detail });
      failed.push("评价申诉队列");
    }
    if (failed.length === 1) setNotice(`${failed[0]}加载失败，其余可用数据仍可查看。`);
    setBusy(null);
  }, [visibility]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setReviewContent({}); }, [cityCode]);

  async function loadMore(kind: "review" | "appeal") {
    const cursor = kind === "review" ? reviewNextCursor : appealNextCursor;
    if (!cursor) return;
    setBusy(`more:${kind}`); setError(null);
    try {
      if (kind === "review") {
        const result = await adminOpsApi.review.listReviewModeration(visibility, 50, cursor);
        setReviews(current => [...current, ...result.items]); setReviewNextCursor(result.nextCursor);
      } else {
        const result = await adminOpsApi.review.listReviewAppeals("open", 50, cursor);
        setAppeals(current => [...current, ...result.items]); setAppealNextCursor(result.nextCursor);
      }
    } catch (cause) { showError(cause, kind === "review" ? "更多评价" : "更多申诉"); }
    finally { setBusy(null); }
  }

  async function viewContent(reviewId: string) {
    if (!canModerate || !online || reviewContent[reviewId] !== undefined) return;
    setContentBusy(reviewId); setError(null);
    try {
      const result = await adminOpsApi.review.getReviewContent(reviewId);
      if (result.content.reviewId !== reviewId) throw new Error("评价内容标识不一致");
      setReviewContent(previous => ({ ...previous, [reviewId]: result.content.comment }));
    } catch (cause) { showError(cause, "受限评价内容"); }
    finally { setContentBusy(null); }
  }

  async function moderate(item: ReviewModerationQueueItem, decision: "visible" | "hidden") {
    const reason = reasons[item.reviewId]?.trim();
    if (!reason || !online) return;
    setBusy(`review:${item.reviewId}`); setError(null); setNotice(null);
    const commandKey = `review:${item.reviewId}:${item.visibilityVersion}:${decision}`;
    const idempotencyKey = idempotencyKeys[commandKey] ?? `admin-review-${crypto.randomUUID()}`;
    if (!idempotencyKeys[commandKey]) setIdempotencyKeys(previous => ({ ...previous, [commandKey]: idempotencyKey }));
    try {
      await adminOpsApi.review.moderateReview(item.reviewId, {
        decision, reasonCode: decision === "visible" ? "content_approved" : "content_policy_violation",
        reason, expectedVersion: item.visibilityVersion, idempotencyKey,
      });
      setNotice(decision === "visible" ? "评价已设为公开可见。" : "评价已隐藏。等待队列刷新确认。");
      await load();
      setIdempotencyKeys(previous => { const next = { ...previous }; delete next[commandKey]; return next; });
    } catch (cause) { showError(cause, "评价审核"); }
    finally { setBusy(null); }
  }

  async function resolveAppeal(appeal: ReviewAppealQueueItem, resolution: "upheld" | "rejected") {
    const reason = reasons[appeal.appealId]?.trim();
    if (!reason || !online) return;
    setBusy(`appeal:${appeal.appealId}`); setError(null); setNotice(null);
    const commandKey = `appeal:${appeal.appealId}:${appeal.version}:${resolution}`;
    const idempotencyKey = idempotencyKeys[commandKey] ?? `admin-appeal-${crypto.randomUUID()}`;
    if (!idempotencyKeys[commandKey]) setIdempotencyKeys(previous => ({ ...previous, [commandKey]: idempotencyKey }));
    try {
      await adminOpsApi.review.resolveReviewAppeal(appeal.appealId, { resolution, reason, expectedVersion: appeal.version, idempotencyKey });
      setNotice(resolution === "upheld" ? "申诉已判定成立。" : "申诉已驳回。等待队列刷新确认。");
      await load();
      setIdempotencyKeys(previous => { const next = { ...previous }; delete next[commandKey]; return next; });
    } catch (cause) { showError(cause, "评价申诉处理"); }
    finally { setBusy(null); }
  }

  const isLoadingQueues = busy === "load";

  return <div className="review-moderation-page">
    <Card title="评价审核与申诉" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone={canModerate ? "success" : "warning"}>{canModerate ? "审核管理员" : "只读权限"}</StatusTag><StatusTag tone={online ? "success" : "danger"}>{online ? "在线" : "离线"}</StatusTag></>}>
      <p>评价正文按需读取；所有裁决携带版本号与幂等键。冲突时必须刷新后重新判断，不覆盖他人结果。</p>
      <div className="review-moderation-actions">{visibilityOptions.map(value => <Button key={value} variant={visibility === value ? "primary" : undefined} onClick={() => setVisibility(value)}>{statusLabel(value)}</Button>)}<Button disabled={busy !== null || !online} onClick={() => void load()}>刷新队列</Button></div>
    </Card>
    {!online && <ApiErrorPanel title="当前网络不可用" detail="审核写入已停用。恢复网络并刷新队列后再继续操作。" />}
    {error && <ApiErrorPanel title={error.title} detail={error.detail} action={<Button disabled={!online} onClick={() => void load()}>重新加载</Button>} />}
    {notice && <p role="status">{notice}</p>}
    {isLoadingQueues && reviews.length === 0 && appeals.length === 0 && <LoadingState title="正在加载评价治理队列" description="读取当前城市的评价审核与申诉数据。" />}
    <Card title="评价审核队列" actions={<StatusTag tone="primary">{reviews.length} 条</StatusTag>}>
      {isLoadingQueues && reviews.length === 0 ? null : reviews.length === 0 ? <EmptyState title="当前状态下没有评价" /> : <Table rows={reviews} getRowKey={row => row.reviewId} columns={[
        { key: "review", title: "评价", render: row => <div><strong>{row.rating}/5 分</strong><br /><small>{row.reviewId}</small></div> },
        { key: "worker", title: "师傅", render: row => row.workerId },
        { key: "content", title: "正文", render: row => <div className="review-moderation-content">{reviewContent[row.reviewId] !== undefined ? <span className="review-moderation-text">{reviewContent[row.reviewId]}</span> : <StatusTag tone="warning">受限内容</StatusTag>}{canModerate && reviewContent[row.reviewId] === undefined && <Button disabled={!online || contentBusy !== null || busy !== null} onClick={() => void viewContent(row.reviewId)}>{contentBusy === row.reviewId ? "读取中" : "查看正文"}</Button>}</div> },
        { key: "state", title: "状态", render: row => <StatusTag tone={statusTone(row.visibility)}>{statusLabel(row.visibility)} · 审核版本 {row.moderationVersion}</StatusTag> },
        { key: "reason", title: "裁决说明", render: row => <Input disabled={!canModerate || !online} maxLength={1_000} placeholder="必填，说明事实依据" value={reasons[row.reviewId] ?? ""} onChange={event => setReasons(previous => ({ ...previous, [row.reviewId]: event.target.value }))} /> },
        { key: "actions", title: "操作", render: row => <div className="review-moderation-actions"><Button disabled={!canModerate || !online || busy !== null || !reasons[row.reviewId]?.trim()} onClick={() => void moderate(row, "visible")}>设为可见</Button><Button disabled={!canModerate || !online || busy !== null || !reasons[row.reviewId]?.trim()} onClick={() => void moderate(row, "hidden")}>隐藏评价</Button></div> },
      ]} />}
      {reviewNextCursor && <div className="review-moderation-load-more"><Button disabled={busy !== null || !online} onClick={() => void loadMore("review")}>加载更多评价</Button></div>}
    </Card>
    <Card title="待处理申诉" actions={<StatusTag tone="primary">{appeals.length} 条</StatusTag>}>
      {isLoadingQueues && appeals.length === 0 ? null : appeals.length === 0 ? <EmptyState title="当前没有待处理申诉" /> : <Table rows={appeals} getRowKey={row => row.appealId} columns={[
        { key: "appeal", title: "申诉", render: row => <div><strong>{businessLabel(row.subjectType)}</strong><br /><small>{row.appealId}</small></div> },
        { key: "review", title: "关联评价", render: row => <div>{row.reviewId}<br /><small>审核版本 {row.moderationVersion}</small></div> },
        { key: "request", title: "申诉原因", render: row => row.detailsRestricted ? <StatusTag tone="warning">内容受限</StatusTag> : row.reason },
        { key: "resolution", title: "裁决说明", render: row => <Input disabled={!canModerate || !online} maxLength={1_000} placeholder="必填，说明裁决依据" value={reasons[row.appealId] ?? ""} onChange={event => setReasons(previous => ({ ...previous, [row.appealId]: event.target.value }))} /> },
        { key: "actions", title: "操作", render: row => <div className="review-moderation-actions"><Button disabled={!canModerate || !online || busy !== null || !reasons[row.appealId]?.trim()} onClick={() => void resolveAppeal(row, "upheld")}>申诉成立</Button><Button disabled={!canModerate || !online || busy !== null || !reasons[row.appealId]?.trim()} onClick={() => void resolveAppeal(row, "rejected")}>驳回申诉</Button></div> },
      ]} />}
      {appealNextCursor && <div className="review-moderation-load-more"><Button disabled={busy !== null || !online} onClick={() => void loadMore("appeal")}>加载更多申诉</Button></div>}
    </Card>
  </div>;
}
