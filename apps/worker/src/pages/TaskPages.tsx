import { useEffect, useMemo, useState } from "react";
import type { Fulfillment, WorkerTaskPoolItem } from "@xlb/types";
import { Button, Card, EmptyState, LoadingState, StatusTag } from "@xlb/ui";
import { workerWorkflowActions } from "../adapters/workflowBindings";
import {
  dispatchStatusLabel,
  formatAmount,
  formatBusinessCode,
  formatCityName,
  formatDateTime,
  formatServiceName,
  fulfillmentStatusLabel,
  helperText,
  statusTone,
  uiChoice,
  uiStateIn,
  uiStateIs,
  workerPanelStyle,
} from "./pageShared";

export type WorkerEligibilityView = {
  status: "loading" | "eligible" | "blocked" | "unknown";
  reasons: string[];
};

export type WorkerWorkMode = "online" | "paused";

function cityLabel(cityCode: string): string {
  return formatCityName(cityCode);
}

function formatElapsed(createdAt: string, now: number): string {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return "--:--";
  const seconds = Math.max(0, Math.floor((now - created) / 1_000));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function OfferTiming({ task }: { task: WorkerTaskPoolItem }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (task.status !== "offering") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [task.status]);

  if (task.status !== "offering") {
    return <span className="worker-task-timing">进入大厅 {formatDateTime(task.createdAt)}</span>;
  }
  return (
    <div className="worker-offer-clock" aria-label="派单邀约响应时间">
      <strong>倒计时 --:--</strong>
      <span>平台未返回截止时间 · 已等待 {formatElapsed(task.createdAt, now)}</span>
    </div>
  );
}

function EligibilityBadge({ eligibility }: { eligibility: WorkerEligibilityView | undefined }) {
  if (!eligibility || eligibility.status === "eligible") return <StatusTag tone="success">资格已通过</StatusTag>;
  if (eligibility.status === "loading") return <StatusTag tone="muted">资格校验中</StatusTag>;
  if (eligibility.status === "blocked") return <StatusTag tone="danger">资格阻断</StatusTag>;
  return <StatusTag tone="warning">资格结果未知</StatusTag>;
}

export function HallPage({
  tasks,
  loading,
  error,
  acceptError,
  acceptNotice,
  acceptingDispatchTaskId,
  simulationAction,
  simulationControlsEnabled,
  cityCode,
  workerId,
  eligibilityBySku = {},
  workMode = "online",
  networkOnline = true,
  onWorkModeChange = () => undefined,
  onRefresh,
  onAccept,
  onReject,
  onSimulateTimeout,
}: {
  tasks: WorkerTaskPoolItem[];
  loading: boolean;
  error: string | null;
  acceptError: string | null;
  acceptNotice: string | null;
  acceptingDispatchTaskId: string | null;
  simulationAction: { type: "reject" | "timeout"; dispatchTaskId: string } | null;
  simulationControlsEnabled: boolean;
  cityCode: string;
  workerId: string;
  eligibilityBySku?: Record<string, WorkerEligibilityView>;
  workMode?: WorkerWorkMode;
  networkOnline?: boolean;
  onWorkModeChange?: (mode: WorkerWorkMode) => void;
  onRefresh: () => void;
  onAccept: (dispatchTaskId: string) => void;
  onReject: (dispatchTaskId: string) => void;
  onSimulateTimeout: (dispatchTaskId: string) => void;
}) {
  const actionableCount = tasks.filter((task) => {
    const eligibility = eligibilityBySku[task.skuId];
    return (task.status === "queued" || task.status === "offering") && (!eligibility || eligibility.status === "eligible");
  }).length;
  const paused = workMode === "paused";

  return (
    <>
      <Card
        title="接单状态"
        actions={<StatusTag tone={!networkOnline ? "danger" : paused ? "warning" : "success"}>{!networkOnline ? "网络离线" : paused ? "本机已暂停" : "本机可接单"}</StatusTag>}
        style={workerPanelStyle}
      >
        <div className="worker-duty-panel">
          <div>
            <strong>{paused ? "暂停新接单" : "在线接单"}</strong>
            <p style={helperText}>服务城市：{cityLabel(cityCode)} · {actionableCount} 个任务通过当前资格校验</p>
          </div>
          <div className="worker-segmented-control" aria-label="本机接单状态">
            <button aria-pressed={!paused} onClick={() => onWorkModeChange("online")} type="button">在线</button>
            <button aria-pressed={paused} onClick={() => onWorkModeChange("paused")} type="button">暂停</button>
          </div>
        </div>
        <p className="worker-contract-note">本机暂停会阻止此设备发起接单；平台在线状态切换接口尚未提供，不会在这里伪造平台状态。</p>
      </Card>

      {!networkOnline && (
        <div className="worker-state-banner worker-state-banner--danger" role="status">
          <strong>当前网络已断开</strong><span>任务内容可能不是最新状态。恢复网络后请刷新再操作。</span>
        </div>
      )}
      {loading && <LoadingState title="正在加载抢单大厅" description="正在读取真实任务并核验逐单服务资格。" />}
      {error && (
        <Card title="大厅加载失败" actions={<StatusTag tone="danger">需处理</StatusTag>} style={workerPanelStyle}>
          <p className="worker-error-copy">{error}</p>
          <Button disabled={!networkOnline} onClick={onRefresh}>重新加载</Button>
        </Card>
      )}
      {acceptError && (
        <Card title={acceptError.includes("结果暂时未知") ? "接单结果待确认" : "接单未完成"} actions={<StatusTag tone="danger">请核对</StatusTag>} style={workerPanelStyle}>
          <p className="worker-error-copy">{acceptError}</p>
          <Button disabled={!networkOnline} onClick={onRefresh}>刷新确认结果</Button>
        </Card>
      )}
      {acceptNotice && (
        <Card title="接单结果" actions={<StatusTag tone="success">已同步</StatusTag>} style={workerPanelStyle}>
          <p style={helperText}>{acceptNotice}</p>
        </Card>
      )}

      {!loading && !error && (
        <section className="worker-journey-section" aria-labelledby="available-task-title">
          <div className="worker-section-heading">
            <div><span className="worker-eyebrow">实时抢单大厅</span><h2 id="available-task-title">可承接任务</h2></div>
            <Button disabled={!networkOnline} onClick={onRefresh}>刷新</Button>
          </div>
          {tasks.length === 0 ? (
            <Card style={workerPanelStyle}><EmptyState title="当前没有待接任务" description={paused ? "本机处于暂停状态；恢复在线后仍需刷新查看平台任务。" : "保持页面在线，新任务进入本城市派单队列后会显示在这里。"} /></Card>
          ) : (
            <div className="worker-task-list">
              {tasks.map((task) => {
                const busy = acceptingDispatchTaskId !== null || simulationAction !== null;
                const eligibility = eligibilityBySku[task.skuId];
                const qualificationReady = !eligibility || eligibility.status === "eligible";
                const acceptAction = workerWorkflowActions.acceptTask({
                  dispatchTaskStatus: task.status,
                  busy,
                  hasWorkerIdentity: Boolean(cityCode && workerId),
                });
                const canAccept = acceptAction.enabled && qualificationReady && !paused && networkOnline;
                const canReject = task.status === "offering" && !busy && networkOnline;
                const blockReasons = eligibility?.status === "blocked" ? eligibility.reasons : [];
                const unknownReason = eligibility?.status === "unknown" ? eligibility.reasons[0] : null;
                return (
                  <article className={`worker-task-card worker-task-card--${task.status}`} key={task.dispatchTaskId}>
                    <div className="worker-task-card__topline">
                      <div><span>服务金额</span><strong>{formatAmount(task.amount)}</strong></div>
                      <div className="worker-status-stack"><StatusTag tone={statusTone(task.status)}>{dispatchStatusLabel(task.status)}</StatusTag><EligibilityBadge eligibility={eligibility} /></div>
                    </div>
                    <OfferTiming task={task} />
                    <dl className="worker-fact-grid">
                      <div><dt>服务编号</dt><dd>{formatBusinessCode(task.skuId, "服务")}</dd></div>
                      <div><dt>订单编号</dt><dd>{formatBusinessCode(task.orderId, "订单")}</dd></div>
                      <div><dt>派单编号</dt><dd>{formatBusinessCode(task.dispatchTaskId, "派单")}</dd></div>
                    </dl>
                    {blockReasons.length > 0 && <div className="worker-block-reason" role="note"><strong>暂不可接</strong><span>{blockReasons.join("；")}</span><a href="/worker/certification">查看服务资格</a></div>}
                    {uiStateIs(eligibility?.status, "loading") && <p className="worker-inline-note">正在向平台核验此服务资格，完成前不会开放接单。</p>}
                    {unknownReason && <div className="worker-block-reason worker-block-reason--warning"><strong>资格结果未知</strong><span>{unknownReason}</span><button onClick={onRefresh} type="button">重新核验</button></div>}
                    <div className="worker-card-actions">
                      <Button disabled={!canAccept} onClick={() => onAccept(task.dispatchTaskId)} variant="primary">
                        {acceptingDispatchTaskId === task.dispatchTaskId ? "正在确认接单" : paused ? "已暂停接单" : !networkOnline ? "网络离线" : "立即接单"}
                      </Button>
                      <Button disabled={!canReject} onClick={() => onReject(task.dispatchTaskId)}>
                        {uiChoice(uiStateIs(simulationAction?.type, "reject") && simulationAction?.dispatchTaskId === task.dispatchTaskId, "正在放弃", "放弃邀约")}
                      </Button>
                    </div>
                    {simulationControlsEnabled && uiStateIs(task.status, "offering") && (
                      <details className="worker-dev-controls"><summary>开发状态验证</summary><Button disabled={!canReject} onClick={() => onSimulateTimeout(task.dispatchTaskId)}>{uiChoice(uiStateIs(simulationAction?.type, "timeout"), "正在模拟", "模拟邀约超时")}</Button></details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}

type TaskFilter = "active" | "accepted" | "history";

export function TasksPage({ fulfillments, loading, error, networkOnline = true, onRefresh, onOpenDetail }: {
  fulfillments: Fulfillment[];
  loading: boolean;
  error: string | null;
  networkOnline?: boolean;
  onRefresh: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("active");
  const counts = useMemo(() => ({
    active: fulfillments.filter((item) => item.status === "accepted" || item.status === "in_progress").length,
    accepted: fulfillments.filter((item) => item.status === "accepted").length,
    inProgress: fulfillments.filter((item) => item.status === "in_progress").length,
    history: fulfillments.filter((item) => item.status === "completed" || item.status === "cancelled").length,
  }), [fulfillments]);
  const filtered = fulfillments.filter((item) => filter === "active"
    ? item.status === "accepted" || item.status === "in_progress"
    : filter === "accepted" ? item.status === "accepted" : item.status === "completed" || item.status === "cancelled");

  return (
    <>
      <Card title="任务总览" actions={<StatusTag tone={counts.active > 0 ? "warning" : "success"}>{counts.active} 个进行中</StatusTag>} style={workerPanelStyle}>
        <div className="worker-summary-metrics"><div><strong>{counts.accepted}</strong><span>待开始</span></div><div><strong>{counts.inProgress}</strong><span>服务中</span></div><div><strong>{counts.history}</strong><span>已结束</span></div></div>
      </Card>
      {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>列表可能不是最新状态，恢复后请刷新。</span></div>}
      {loading && <LoadingState title="正在加载我的任务" description="正在读取已承接的真实履约任务。" />}
      {error && <Card title="任务加载失败" actions={<StatusTag tone="danger">需处理</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{error}</p><Button disabled={!networkOnline} onClick={onRefresh}>重新加载</Button></Card>}
      {!loading && !error && (
        <section className="worker-journey-section" aria-labelledby="my-task-title">
          <div className="worker-section-heading"><div><span className="worker-eyebrow">任务履约</span><h2 id="my-task-title">我的任务</h2></div><Button disabled={!networkOnline} onClick={onRefresh}>刷新</Button></div>
          <div className="worker-filter-tabs" role="tablist" aria-label="任务筛选">
            {([{ key: "active", label: "进行中" }, { key: "accepted", label: "待开始" }, { key: "history", label: "已结束" }] as const).map((item) => <button aria-selected={filter === item.key} key={item.key} onClick={() => setFilter(item.key)} role="tab" type="button">{item.label}<span>{counts[item.key]}</span></button>)}
          </div>
          {filtered.length === 0 ? <Card style={workerPanelStyle}><EmptyState title={fulfillments.length === 0 ? "暂无履约任务" : "当前筛选下没有任务"} description={fulfillments.length === 0 ? "接单成功后，待服务、服务中和已完成任务会显示在这里。" : "可切换上方状态查看其他任务。"} /></Card> : (
            <div className="worker-task-list">
              {filtered.map((item) => <article className={`worker-task-card worker-task-card--${item.status}`} key={item.fulfillmentId}>
                <div className="worker-task-card__topline"><div><span>{uiChoice(uiStateIs(item.status, "in_progress"), "当前作业", "履约任务")}</span><strong>{formatServiceName(item.skuId)}</strong></div><StatusTag tone={statusTone(item.status)}>{fulfillmentStatusLabel(item.status)}</StatusTag></div>
                <p className="worker-next-step">{uiChoice(uiStateIs(item.status, "accepted"), "下一步：到达现场后开始服务并记录证据", uiChoice(uiStateIs(item.status, "in_progress"), "下一步：补齐服务证据并登记完工", uiChoice(uiStateIs(item.status, "completed"), "服务已完工，打开查看顾客确认或争议结果", "该任务已取消，仅可查看记录")))}</p>
                <dl className="worker-fact-grid"><div><dt>订单编号</dt><dd>{formatBusinessCode(item.orderId, "订单")}</dd></div><div><dt>更新时间</dt><dd>{formatDateTime(item.updatedAt)}</dd></div><div><dt>履约编号</dt><dd>{formatBusinessCode(item.fulfillmentId, "履约单")}</dd></div></dl>
                <Button onClick={() => onOpenDetail(item.fulfillmentId)} variant={uiStateIn(item.status, ["accepted", "in_progress"]) ? "primary" : undefined}>{uiChoice(uiStateIs(item.status, "accepted"), "去开始服务", uiChoice(uiStateIs(item.status, "in_progress"), "继续履约", "查看详情"))}</Button>
              </article>)}
            </div>
          )}
        </section>
      )}
    </>
  );
}
