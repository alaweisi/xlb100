import { useCallback, useEffect, useState } from "react";
import type {
  CreateReviewAppealRequest,
  ReviewAppeal,
  WorkerReputation,
  WorkerReviewAppealTarget,
} from "@xlb/types";
import { Button, Card, EmptyState, ErrorState, LoadingState, StatusTag, Textarea } from "@xlb/ui";
import { formatWorkerApiError } from "../app/workerFeedback";
import { uiChoice, uiStateIs } from "./pageShared";
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
    return "该评价审核决定已变更，或已有进行中的申诉。已保留输入，请刷新后核对。";
  }
  return formatWorkerApiError(cause, fallback, "mutation");
}

export function WorkerReputationPage({ api, networkOnline = true }: { api: WorkerReputationApi; networkOnline?: boolean }) {
  const [reputation, setReputation] = useState<WorkerReputation | null>(null);
  const [appealTargets, setAppealTargets] = useState<WorkerReviewAppealTarget[]>([]);
  const [appealReasons, setAppealReasons] = useState<Record<string, string>>({});
  const [appealKeys, setAppealKeys] = useState<Record<string, string>>({});
  const [busyAppeal, setBusyAppeal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reputationLoaded, setReputationLoaded] = useState(false);
  const [appealsLoaded, setAppealsLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [reputationResponse, targetResponse] = await Promise.allSettled([
        api.getMyReputation(),
        api.listReviewAppealTargets(),
      ]);
    const failed: string[] = [];
    if (reputationResponse.status === "fulfilled") { setReputation(reputationResponse.value.reputation); setReputationLoaded(true); } else failed.push("口碑汇总");
    if (targetResponse.status === "fulfilled") { setAppealTargets(targetResponse.value.items); setAppealsLoaded(true); } else failed.push("可申诉决定");
    if (failed.length) setError(`${failed.join("、")}暂不可用，已展示成功加载的其他数据。`);
    setLoading(false);
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
    setNotice(null);
    try {
      const response = await api.createReviewAppeal(target.reviewId, {
        moderationVersion: target.moderationVersion,
        reason,
        idempotencyKey,
      });
      setNotice(response.idempotent ? "重复申诉请求已安全处理，当前申诉状态未重复创建。" : "评价申诉已提交，等待平台处理。 ");
      setAppealReasons((previous) => ({ ...previous, [target.reviewId]: "" }));
      setAppealKeys((previous) => {
        const next = { ...previous };
        delete next[target.reviewId];
        return next;
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "评价申诉未完成，请刷新确认后重试。"));
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
    setNotice(null);
    try {
      const response = await api.withdrawReviewAppeal(target.reviewId, {
        moderationVersion: target.moderationVersion,
        idempotencyKey,
      });
      setNotice(response.idempotent ? "重复撤回请求已安全处理，申诉状态未重复变更。" : "申诉已撤回。 ");
      setAppealKeys((previous) => {
        const next = { ...previous };
        delete next[commandKey];
        return next;
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "撤回申诉未完成，请刷新确认后重试。"));
    } finally {
      setBusyAppeal(null);
    }
  }, [api, appealKeys, load]);

  if (loading) return <LoadingState title="正在加载口碑" description="正在读取可见评价汇总和可申诉的审核决定。" />;
  if (error && !reputationLoaded && !appealsLoaded) {
    return <ErrorState title="口碑暂不可用" description={error} action={<Button onClick={() => void load()}>重试</Button>} />;
  }

  return (
    <div className="worker-reputation-page">
      {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>申诉操作已关闭；恢复网络后先刷新审核决定。</span></div>}
      {error && <ErrorState title="部分口碑数据或申诉操作暂不可用" description={error} action={<Button disabled={!networkOnline} onClick={() => void load()}>刷新</Button>} />}
      {notice && <p role="status" className="notification-notice">{notice}</p>}
      {reputation ? (
        <Card
          title="我的口碑"
          actions={<StatusTag tone="success">仅统计可见评价</StatusTag>}
          className="worker-reputation-panel"
        >
          <div className="worker-reputation-stack">
            <div className="worker-reputation-summary">
              <strong className="worker-reputation-score">
                {reputation.averageRating?.toFixed(2) ?? "-"}
              </strong>
              <span className="worker-reputation-helper">{reputation.ratingCount} 条可见评价</span>
            </div>
            <div aria-label="评分分布" className="worker-reputation-distribution">
              {([5, 4, 3, 2, 1] as const).map((rating) => {
                const ratingKey = String(rating) as keyof WorkerReputation["ratingDistribution"];
                return (
                  <div key={rating} className="worker-reputation-distribution-row">
                    <span>{rating}/5</span>
                    <progress
                      aria-label={`${rating} 星评价数量`}
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
              统计公式版本 {reputation.formulaRevision}。该只读口碑汇总不用于派单、接单资格、排序或资质判定。
            </p>
            <div className="worker-reputation-actions">
              <StatusTag tone="muted">数据代次 {reputation.sourceGenerationId}</StatusTag>
              <StatusTag tone="muted">水位 {reputation.sourceWatermark ?? "无"}</StatusTag>
              <Button disabled={!networkOnline} onClick={() => void load()}>刷新</Button>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState title="暂无可见评分" description="待审核和已隐藏评价不会计入口碑汇总。" />
      )}

      <Card
        title="评价审核申诉"
        actions={<StatusTag tone="muted">仅展示决定元数据</StatusTag>}
        className="worker-reputation-panel"
      >
        {appealTargets.length === 0 ? (
          <EmptyState title="暂无可申诉决定" description="当前没有可见或隐藏评价的审核决定可供申诉。" />
        ) : (
          <div className="worker-reputation-appeals">
            {appealTargets.map((target) => (
              <div key={`${target.reviewId}:${target.moderationVersion}`} className="worker-reputation-appeal">
                <div className="worker-reputation-actions">
                  <StatusTag tone={uiChoice(uiStateIs(target.visibility, "visible"), "success", "warning")}>{uiChoice(uiStateIs(target.visibility, "visible"), "可见", "隐藏")}</StatusTag>
                  <StatusTag tone="muted">决定版本 {target.moderationVersion}</StatusTag>
                  <StatusTag tone="muted">{new Date(target.decidedAt).toLocaleString()}</StatusTag>
                  {target.activeAppealStatus && <StatusTag tone="warning">申诉 {uiChoice(uiStateIs(target.activeAppealStatus, "open"), "处理中", uiChoice(uiStateIs(target.activeAppealStatus, "withdrawn"), "已撤回", "状态未知"))}</StatusTag>}
                  {uiStateIs(target.activeAppealStatus, "open") && (
                    <Button
                      disabled={!networkOnline || busyAppeal !== null}
                      onClick={() => void withdrawAppeal(target)}
                    >
                      {busyAppeal === target.reviewId ? "正在撤回" : "撤回申诉"}
                    </Button>
                  )}
                </div>
                {!target.activeAppealStatus && (
                  <>
                    <Textarea
                      aria-label={`审核决定 ${target.moderationVersion} 的申诉理由`}
                      maxLength={1_000}
                      placeholder="说明为什么该审核决定需要复核"
                      value={appealReasons[target.reviewId] ?? ""}
                      onChange={(event) => setAppealReasons((previous) => ({
                        ...previous,
                        [target.reviewId]: event.target.value,
                      }))}
                    />
                    <div>
                      <Button
                        disabled={!networkOnline || busyAppeal !== null || !appealReasons[target.reviewId]?.trim()}
                        onClick={() => void submitAppeal(target)}
                      >
                        {busyAppeal === target.reviewId ? "正在提交申诉" : "提交申诉"}
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
