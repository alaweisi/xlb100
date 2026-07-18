import { useMemo, useState } from "react";
import type { Fulfillment, FulfillmentEvidenceType } from "@xlb/types";
import type { AftersaleRepairOrderResponse, FulfillmentEvidenceAggregateResponse } from "@xlb/api-client";
import { Button, Card, EmptyState, FormField, Input, LoadingState, Select, StatusTag, Textarea } from "@xlb/ui";
import { workerWorkflowActions } from "../adapters/workflowBindings";
import { formatDateTime, fulfillmentStatusLabel, helperText, statusTone, workerPanelStyle } from "./pageShared";

const evidenceLabels: Record<FulfillmentEvidenceType, string> = {
  arrival: "到达现场",
  before_service: "服务前",
  diagnosis: "检查诊断",
  material: "材料记录",
  after_service: "服务后",
  completion: "完工结果",
};

export function RepairOrdersPage({ repairOrders, loading, error, busyId, notes, onRefresh, onNoteChange, onStart, onComplete }: {
  repairOrders: AftersaleRepairOrderResponse[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  notes: Record<string, string>;
  onRefresh: () => void;
  onNoteChange: (repairOrderId: string, note: string) => void;
  onStart: (repairOrderId: string) => void;
  onComplete: (repairOrderId: string, note: string) => void;
}) {
  return (
    <>
      {loading && <LoadingState title="正在加载返工任务" description="正在读取已分派的售后返工单。" />}
      {error && <Card title="返工任务加载失败" actions={<StatusTag tone="danger">需处理</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{error}</p></Card>}
      <section className="worker-journey-section" aria-labelledby="repair-title">
        <div className="worker-section-heading"><div><span className="worker-eyebrow">售后履约</span><h2 id="repair-title">已分派返工</h2></div><Button onClick={onRefresh}>刷新</Button></div>
        {repairOrders.length === 0 && !loading ? <Card style={workerPanelStyle}><EmptyState title="暂无返工任务" description="平台分派的投诉返工任务会显示在这里。" /></Card> : <div className="worker-task-list">{repairOrders.map((item) => <article className={`worker-task-card worker-task-card--${item.status}`} key={item.repairOrderId}>
          <div className="worker-task-card__topline"><div><span>返工编号</span><strong>{item.repairOrderId}</strong></div><StatusTag tone={statusTone(item.status)}>{item.status === "assigned" ? "待开始" : item.status === "in_progress" ? "返工中" : item.status === "completed" ? "已完成" : item.status === "cancelled" ? "已取消" : "待分派"}</StatusTag></div>
          <dl className="worker-fact-grid"><div><dt>订单编号</dt><dd>{item.orderId}</dd></div><div><dt>返工原因</dt><dd>{item.reason}</dd></div></dl>
          <FormField label="完成说明"><Input value={notes[item.repairOrderId] ?? ""} onChange={(event) => onNoteChange(item.repairOrderId, event.target.value)} /></FormField>
          <div className="worker-card-actions"><Button disabled={item.status !== "assigned" || busyId === item.repairOrderId} onClick={() => onStart(item.repairOrderId)}>开始返工</Button><Button variant="primary" disabled={item.status !== "in_progress" || busyId === item.repairOrderId || !(notes[item.repairOrderId] ?? "").trim()} onClick={() => onComplete(item.repairOrderId, (notes[item.repairOrderId] ?? "").trim())}>登记完成</Button></div>
        </article>)}</div>}
      </section>
    </>
  );
}

function WorkflowTimeline({ fulfillment, confirmationStatus, evidenceCount }: { fulfillment: Fulfillment; confirmationStatus?: string; evidenceCount: number }) {
  const steps = useMemo(() => [
    { label: "已接单", detail: formatDateTime(fulfillment.createdAt), state: "done" },
    { label: "开始服务", detail: fulfillment.startedAt ? formatDateTime(fulfillment.startedAt) : "等待师傅操作", state: fulfillment.startedAt ? "done" : fulfillment.status === "cancelled" ? "blocked" : "current" },
    { label: "服务证据", detail: evidenceCount > 0 ? `已上传 ${evidenceCount} 项` : "尚未上传", state: evidenceCount > 0 ? "done" : fulfillment.status === "in_progress" ? "current" : "pending" },
    { label: "登记完工", detail: fulfillment.completedAt ? formatDateTime(fulfillment.completedAt) : "尚未完工", state: fulfillment.status === "completed" ? "done" : fulfillment.status === "in_progress" ? "current" : "pending" },
    { label: "顾客确认", detail: confirmationStatus === "confirmed" ? "顾客已确认" : confirmationStatus === "disputed" ? "顾客已发起争议" : fulfillment.status === "completed" ? "等待顾客确认" : "完工后开放", state: confirmationStatus === "confirmed" ? "done" : confirmationStatus === "disputed" ? "blocked" : fulfillment.status === "completed" ? "current" : "pending" },
  ], [confirmationStatus, evidenceCount, fulfillment]);
  return <ol className="worker-timeline">{steps.map((step) => <li className={`worker-timeline__item worker-timeline__item--${step.state}`} key={step.label}><span aria-hidden="true" /><div><strong>{step.label}</strong><small>{step.detail}</small></div></li>)}</ol>;
}

function ConfirmationPanel({ aggregate, completed }: { aggregate: FulfillmentEvidenceAggregateResponse | null; completed: boolean }) {
  const confirmation = aggregate?.confirmation;
  if (!completed) return <div className="worker-confirmation worker-confirmation--muted"><strong>顾客确认尚未开始</strong><span>师傅登记完工并生成确认单后，顾客可确认或发起争议。</span></div>;
  if (!confirmation) return <div className="worker-confirmation worker-confirmation--warning"><strong>等待确认单同步</strong><span>平台暂未返回顾客确认记录，请稍后刷新。请勿重复登记完工。</span></div>;
  if (confirmation.status === "confirmed") return <div className="worker-confirmation worker-confirmation--success"><strong>顾客已确认完成</strong><span>确认时间：{formatDateTime(confirmation.confirmedAt)}</span></div>;
  if (confirmation.status === "disputed") return <div className="worker-confirmation worker-confirmation--danger"><strong>顾客已发起争议</strong><span>{confirmation.customerNote || "顾客未填写争议说明"}</span><span>投诉编号：{confirmation.complaintId || "平台处理中"}</span><a href="/worker/support">联系客服处理</a></div>;
  return <div className="worker-confirmation worker-confirmation--warning"><strong>等待顾客确认</strong><span>顾客可确认完成或关联投诉发起争议。当前请保持证据可追溯。</span></div>;
}

export function TaskDetailPage({
  fulfillment,
  loading,
  error,
  fulfillmentId,
  lifecycleError,
  lifecycleNotice,
  lifecycleAction,
  evidenceAggregate,
  evidenceLoading,
  evidenceError,
  evidenceNotice = null,
  evidenceBusy,
  networkOnline = true,
  onBack,
  onStart,
  onComplete,
  onRefreshEvidence,
  onUploadEvidence,
}: {
  fulfillment: Fulfillment | null;
  loading: boolean;
  error: string | null;
  fulfillmentId: string;
  lifecycleError: string | null;
  lifecycleNotice: string | null;
  lifecycleAction: "start" | "complete" | null;
  evidenceAggregate: FulfillmentEvidenceAggregateResponse | null;
  evidenceLoading: boolean;
  evidenceError: string | null;
  evidenceNotice?: string | null;
  evidenceBusy: boolean;
  networkOnline?: boolean;
  onBack: () => void;
  onStart: (fulfillmentId: string) => void;
  onComplete: (fulfillmentId: string, completionNote?: string) => void;
  onRefreshEvidence: (fulfillmentId: string) => void;
  onUploadEvidence: (fulfillmentId: string, file: File, metadata: { evidenceType: FulfillmentEvidenceType; complaintId?: string; note?: string }) => void;
}) {
  const [evidenceType, setEvidenceType] = useState<FulfillmentEvidenceType>("before_service");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceComplaintId, setEvidenceComplaintId] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const lifecycleBusy = lifecycleAction !== null;
  const startAction = workerWorkflowActions.startFulfillment({ fulfillmentStatus: fulfillment?.status, busy: lifecycleBusy, hasWorkerIdentity: Boolean(fulfillment?.workerId) });
  const completeAction = workerWorkflowActions.completeFulfillment({ fulfillmentStatus: fulfillment?.status, busy: lifecycleBusy, hasWorkerIdentity: Boolean(fulfillment?.workerId) });
  const canStart = startAction.enabled && networkOnline;
  const canComplete = completeAction.enabled && networkOnline;
  const confirmationStatus = evidenceAggregate?.confirmation?.status;

  return (
    <>
      <div className="worker-detail-toolbar"><Button onClick={onBack}>返回任务列表</Button><span>履约编号 {fulfillmentId}</span></div>
      {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>不要重复开始或完工；恢复网络后先刷新确认结果。</span></div>}
      {loading && <LoadingState title="正在加载履约详情" description="正在读取真实履约状态和作业信息。" />}
      {error && <Card title="履约详情加载失败" actions={<StatusTag tone="danger">需处理</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{error}</p><Button onClick={onBack}>返回列表</Button></Card>}
      {lifecycleError && <Card title={lifecycleError.includes("结果暂时未知") ? "操作结果待确认" : "履约操作未完成"} actions={<StatusTag tone="danger">请核对</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{lifecycleError}</p></Card>}
      {lifecycleNotice && <Card title="履约状态已同步" actions={<StatusTag tone="success">成功</StatusTag>} style={workerPanelStyle}><p style={helperText}>{lifecycleNotice}</p></Card>}

      {!loading && !error && fulfillment && <>
        <Card title="当前履约状态" actions={<StatusTag tone={statusTone(fulfillment.status)}>{fulfillmentStatusLabel(fulfillment.status)}</StatusTag>} style={workerPanelStyle}>
          <p className="worker-primary-guidance">{fulfillment.status === "accepted" ? "到达服务现场后开始服务，并及时留存过程证据。" : fulfillment.status === "in_progress" ? "服务正在进行，请补齐关键证据后登记完工。" : fulfillment.status === "completed" ? "服务已完工，请关注顾客确认或争议结果。" : "该任务已取消，履约操作已关闭。"}</p>
          <WorkflowTimeline fulfillment={fulfillment} confirmationStatus={confirmationStatus} evidenceCount={evidenceAggregate?.evidence.length ?? 0} />
        </Card>

        <Card title="任务信息" style={workerPanelStyle}><dl className="worker-fact-grid worker-fact-grid--detail"><div><dt>订单编号</dt><dd>{fulfillment.orderId}</dd></div><div><dt>服务编号</dt><dd>{fulfillment.skuId}</dd></div><div><dt>工作城市</dt><dd>{fulfillment.cityCode}</dd></div><div><dt>派单编号</dt><dd>{fulfillment.dispatchTaskId}</dd></div><div><dt>开始时间</dt><dd>{formatDateTime(fulfillment.startedAt)}</dd></div><div><dt>完工时间</dt><dd>{formatDateTime(fulfillment.completedAt)}</dd></div></dl>{fulfillment.completionNote && <div className="worker-completion-note"><span>完工说明</span><p>{fulfillment.completionNote}</p></div>}</Card>

        <Card title="履约操作" actions={<StatusTag tone="primary">真实状态机</StatusTag>} style={workerPanelStyle}>
          <div className="worker-lifecycle-actions">
            <div><strong>1. 开始服务</strong><span>{fulfillment.status === "accepted" ? "确认到场后开始计入履约过程。" : "仅待开始状态可操作。"}</span><Button disabled={!canStart} onClick={() => onStart(fulfillmentId)} variant="primary">{lifecycleAction === "start" ? "正在确认开始" : "开始服务"}</Button></div>
            <div><strong>2. 登记完工</strong><span>{fulfillment.status === "in_progress" ? "填写实际结果；完工后等待顾客确认。" : "仅服务中状态可操作。"}</span><FormField label="完工说明（选填，最多 255 字）"><Textarea disabled={!canComplete} maxLength={255} value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} /></FormField><Button disabled={!canComplete} onClick={() => onComplete(fulfillmentId, completionNote.trim() || undefined)} variant="primary">{lifecycleAction === "complete" ? "正在确认完工" : "登记完工"}</Button></div>
          </div>
        </Card>

        <Card title="服务证据" actions={<StatusTag tone={evidenceAggregate?.evidence.length ? "success" : "warning"}>{evidenceAggregate?.evidence.length ?? 0} 项</StatusTag>} style={workerPanelStyle}>
          <div className="worker-evidence-form">
            <FormField label="证据节点"><Select disabled={fulfillment.status === "cancelled" || evidenceBusy} value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as FulfillmentEvidenceType)}>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
            <FormField label="现场图片（JPEG / PNG / WebP，最大 5 MiB）"><input accept="image/jpeg,image/png,image/webp" disabled={fulfillment.status === "cancelled" || evidenceBusy} onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} type="file" /></FormField>
            <FormField label="投诉编号（仅关联争议时填写）"><Input disabled={fulfillment.status === "cancelled" || evidenceBusy} maxLength={64} value={evidenceComplaintId} onChange={(event) => setEvidenceComplaintId(event.target.value)} /></FormField>
            <FormField label="证据说明（最多 500 字）"><Textarea disabled={fulfillment.status === "cancelled" || evidenceBusy} maxLength={500} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} /></FormField>
            <div className="worker-card-actions"><Button variant="primary" disabled={!evidenceFile || evidenceBusy || !networkOnline || fulfillment.status === "cancelled" || confirmationStatus === "confirmed" || confirmationStatus === "disputed"} onClick={() => evidenceFile && onUploadEvidence(fulfillmentId, evidenceFile, { evidenceType, complaintId: evidenceComplaintId.trim() || undefined, note: evidenceNote.trim() || undefined })}>{evidenceBusy ? "正在上传证据" : "上传证据"}</Button><Button disabled={evidenceLoading || !networkOnline} onClick={() => onRefreshEvidence(fulfillmentId)}>刷新证据</Button></div>
            <p className="worker-contract-note">证据为私有存储；顾客确认或争议后证据将冻结，不能继续上传。</p>
          </div>
        </Card>
        {evidenceError && <Card title={evidenceError.includes("结果暂时未知") ? "证据结果待确认" : "证据操作未完成"} actions={<StatusTag tone="danger">请核对</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{evidenceError}</p></Card>}
        {evidenceNotice && <Card title="证据已保存" actions={<StatusTag tone="success">已同步</StatusTag>} style={workerPanelStyle}><p style={helperText}>{evidenceNotice}</p></Card>}
        {evidenceLoading && <LoadingState title="正在加载证据" description="正在读取私有证据元数据。" />}
        {!evidenceLoading && evidenceAggregate && <Card title="证据时间线" style={workerPanelStyle}>{evidenceAggregate.evidence.length === 0 ? <EmptyState title="尚未上传证据" description="建议按到场、服务前后和完工节点留存现场图片。" /> : <div className="worker-evidence-list">{evidenceAggregate.evidence.map((item) => <article key={item.evidenceId}><div><StatusTag tone="primary">{evidenceLabels[item.evidenceType]}</StatusTag><strong>{item.mediaAsset.originalFileName}</strong></div><span>{formatDateTime(item.capturedAt)} · {Math.max(1, Math.round(item.mediaAsset.sizeBytes / 1024))} KB</span><small>校验值 {item.mediaAsset.checksumSha256.slice(0, 12)} · {item.mediaAsset.securityScanStatus === "not_malware_scanned_local" ? "本地格式检查" : item.mediaAsset.securityScanStatus}</small></article>)}</div>}</Card>}

        <Card title="顾客确认与争议" actions={<StatusTag tone={confirmationStatus === "confirmed" ? "success" : confirmationStatus === "disputed" ? "danger" : "warning"}>{confirmationStatus === "confirmed" ? "已确认" : confirmationStatus === "disputed" ? "有争议" : "待确认"}</StatusTag>} style={workerPanelStyle}><ConfirmationPanel aggregate={evidenceAggregate} completed={fulfillment.status === "completed"} /></Card>

        <Card title="取消与异常" actions={<StatusTag tone="muted">受限操作</StatusTag>} style={workerPanelStyle}><p style={helperText}>当前共享 API 未提供师傅取消履约接口，因此页面不会伪造取消成功。若无法继续服务，请联系客服留痕处理。</p><div className="worker-card-actions"><Button disabled>取消履约（接口待接入）</Button><a className="worker-link-button" href="/worker/support">联系平台客服</a></div></Card>
      </>}
    </>
  );
}
