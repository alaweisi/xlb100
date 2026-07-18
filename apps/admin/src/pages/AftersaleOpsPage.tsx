import { useCallback, useEffect, useState } from "react";
import type { AftersaleComplaintDetailResponse, AftersaleComplaintResponse, OrderReverseResponse } from "@xlb/api-client";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, ScopeBadge, Select, StatusTag, Textarea } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import { businessLabel, cityLabel, formatCurrency, formatDateTime, presentFailure, statusLabel, statusTone, useOnlineStatus, type OperationsFailure } from "../operationsPresentation";
import "./operations-workbench.css";
import "./mobile-core.css";

const REVERSE_QUEUE = "reverse";
const COMPLAINT_QUEUE = "complaints";

export function AftersaleOpsPage({ initialCityCode }: { initialCityCode?: string }) {
  const [cityCode, setCityCode] = useState(initialCityCode || "hangzhou");
  const online = useOnlineStatus();
  const [reverseRequests, setReverseRequests] = useState<OrderReverseResponse[]>([]);
  const [complaints, setComplaints] = useState<AftersaleComplaintResponse[]>([]);
  const [detail, setDetail] = useState<AftersaleComplaintDetailResponse | null>(null);
  const [workerId, setWorkerId] = useState("");
  const [reverseNote, setReverseNote] = useState("");
  const [handlingNote, setHandlingNote] = useState("");
  const [repairReason, setRepairReason] = useState("");
  const [liabilityReason, setLiabilityReason] = useState("");
  const [liableParty, setLiableParty] = useState<"customer" | "worker" | "platform" | "no_fault" | "merchant" | "shared">("no_fault");
  const [workerPercent, setWorkerPercent] = useState("0");
  const [platformPercent, setPlatformPercent] = useState("0");
  const [customerPercent, setCustomerPercent] = useState("0");
  const [compensationAmount, setCompensationAmount] = useState("");
  const [compensationReason, setCompensationReason] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<OperationsFailure | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueView, setQueueView] = useState<typeof REVERSE_QUEUE | typeof COMPLAINT_QUEUE>(COMPLAINT_QUEUE);

  const load = useCallback(async () => {
    setBusy("load"); setFailure(null); setPartial(null); setNotice(null);
    window.history.replaceState({}, "", `#/aftersale?cityCode=${encodeURIComponent(cityCode)}`);
    const [reverse, complaint] = await Promise.allSettled([api.listOrderReverseRequests(), api.listAftersaleComplaints()]);
    const failed: string[] = [];
    if (reverse.status === "fulfilled") setReverseRequests(reverse.value.reverseRequests);
    else { const f = presentFailure(reverse.reason, "订单变更队列"); if (f.kind === "forbidden") setReverseRequests([]); failed.push(`订单变更（${f.title}）`); }
    if (complaint.status === "fulfilled") setComplaints(complaint.value.complaints);
    else { const f = presentFailure(complaint.reason, "投诉队列"); if (f.kind === "forbidden") setComplaints([]); failed.push(`投诉（${f.title}）`); }
    if (failed.length === 2) setFailure(presentFailure(reverse.status === "rejected" ? reverse.reason : complaint.status === "rejected" ? complaint.reason : null, "售后工作台"));
    else if (failed.length) setPartial(`部分结果：${failed.join("、")}未能更新，其余队列保留本次真实返回。`);
    setLoaded(true); setBusy(null);
  }, [cityCode]);

  const openDetail = useCallback(async (id: string) => {
    setBusy(id); setFailure(null);
    try { setDetail((await api.getAftersaleComplaint(id)).detail); }
    catch (error) { const next = presentFailure(error, "投诉详情"); if (next.kind === "forbidden") setDetail(null); setFailure(next); }
    finally { setBusy(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function execute(key: string, subject: string, action: () => Promise<unknown>, success: string, refreshDetail = false) {
    setBusy(key); setFailure(null); setNotice(null);
    try {
      await action();
      if (refreshDetail && detail) await openDetail(detail.complaint.complaintId);
      await load();
      setNotice(success);
    } catch (error) { setFailure(presentFailure(error, subject)); }
    finally { setBusy(null); }
  }

  const liabilityTotal = Number(workerPercent) + Number(platformPercent) + Number(customerPercent);
  const complaintId = detail?.complaint.complaintId;
  const isRefreshing = busy === "load";
  const hasAssignedLiability = liableParty !== "no_fault";

  return <div className="operations-workbench admin-mobile-core">
    <Card title="售后运营工作台" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone={online ? "success" : "danger"}>{online ? "服务已连接" : "当前离线"}</StatusTag><StatusTag tone="warning">不执行服务商退款</StatusTag></>}>
      <div className="admin-mobile-summary" aria-label="售后运营摘要"><div className="admin-mobile-summary__item"><span>订单变更</span><strong>{reverseRequests.length}</strong></div><div className="admin-mobile-summary__item"><span>投诉</span><strong>{complaints.length}</strong></div><div className="admin-mobile-summary__item"><span>当前城市</span><strong>{cityLabel(cityCode)}</strong></div><div className="admin-mobile-summary__item"><span>当前详情</span><strong>{detail?.complaint.complaintId || "未选择"}</strong></div></div>
      <details className="admin-mobile-filter"><summary>城市筛选</summary><div className="admin-mobile-filter__body"><FormField label="城市"><Select value={cityCode} onChange={(event) => setCityCode(event.target.value)}><option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option></Select></FormField><Button variant="primary" disabled={busy !== null} onClick={() => void load()}>{isRefreshing ? "刷新中…" : "刷新售后队列"}</Button></div></details>
      <div className="admin-mobile-segments" aria-label="售后队列"><Button aria-pressed={queueView === COMPLAINT_QUEUE} onClick={() => setQueueView(COMPLAINT_QUEUE)}>投诉 {complaints.length}</Button><Button aria-pressed={queueView === REVERSE_QUEUE} onClick={() => setQueueView(REVERSE_QUEUE)}>订单变更 {reverseRequests.length}</Button></div>
    </Card>
    {!online && <div className="operations-alert operations-alert--offline" role="status">网络已断开。旧数据仅供核对，所有售后写操作已停用。</div>}
    {partial && <div className="operations-alert" role="status">{partial}</div>}
    {notice && <div className="operations-alert" role="status">{notice}</div>}
    {failure && <ApiErrorPanel title={failure.title} detail={failure.detail} action={<Button onClick={() => void load()}>刷新最新数据</Button>} />}
    {!loaded && <LoadingState title="正在读取售后队列" description="正在分别读取订单变更和投诉处理记录。" />}

    {queueView === REVERSE_QUEUE && <Card title="订单变更队列" actions={<StatusTag tone="muted">{reverseRequests.length} 条</StatusTag>}>
      {loaded && reverseRequests.length === 0 ? <EmptyState title="当前城市暂无订单变更申请" /> : <div className="admin-mobile-list">{reverseRequests.map(item => <article className="admin-mobile-item" key={item.reverseRequestId}><header className="admin-mobile-item__header"><h3>{businessLabel(item.reverseType)} · {item.orderId}</h3><StatusTag tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusTag></header><dl className="admin-mobile-meta"><div><dt>申请编号</dt><dd>{item.reverseRequestId}</dd></div><div><dt>客户原因</dt><dd>{item.reason}</dd></div></dl><div className="admin-mobile-item__actions"><FormField label="变更复核意见"><Input aria-label={`变更复核意见 ${item.reverseRequestId}`} value={reverseNote} onChange={(event) => setReverseNote(event.target.value)} placeholder="通过或驳回前填写" /></FormField><div className="admin-mobile-actions"><Button disabled={!online || busy !== null || item.status !== "requested" || !reverseNote.trim()} onClick={() => void execute(item.reverseRequestId, "订单变更复核", () => api.reviewOrderReverseRequest(item.reverseRequestId, { decision: "approved", reviewNote: reverseNote.trim() }), "订单变更申请已通过复核。")}>通过</Button><Button disabled={!online || busy !== null || item.status !== "requested" || !reverseNote.trim()} onClick={() => void execute(item.reverseRequestId, "订单变更复核", () => api.reviewOrderReverseRequest(item.reverseRequestId, { decision: "rejected", reviewNote: reverseNote.trim() }), "订单变更申请已驳回。")}>驳回</Button><Button variant="primary" disabled={!online || busy !== null || item.status !== "approved"} onClick={() => void execute(item.reverseRequestId, "应用订单变更", () => api.applyOrderReverseRequest(item.reverseRequestId), "订单变更已按服务端规则应用。")}>应用已批准变更</Button></div></div></article>)}</div>}
    </Card>}

    {queueView === COMPLAINT_QUEUE && <Card title="投诉队列" actions={<StatusTag tone="muted">{complaints.length} 条</StatusTag>}>
      {loaded && complaints.length === 0 ? <EmptyState title="当前城市暂无投诉" /> : <div className="admin-mobile-list">{complaints.map(item => <article className="admin-mobile-item" key={item.complaintId}><header className="admin-mobile-item__header"><h3>{item.complaintId}</h3><StatusTag tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusTag></header><dl className="admin-mobile-meta"><div><dt>订单</dt><dd>{item.orderId}</dd></div><div><dt>类别</dt><dd>{businessLabel(item.category)}</dd></div><div><dt>优先级</dt><dd><StatusTag tone={item.priority === "critical" ? "danger" : item.priority === "urgent" ? "warning" : "muted"}>{businessLabel(item.priority)}</StatusTag></dd></div></dl><div className="admin-mobile-item__actions"><Button variant="primary" onClick={() => void openDetail(item.complaintId)}>{detail?.complaint.complaintId === item.complaintId ? "刷新投诉详情" : "打开投诉详情"}</Button></div></article>)}</div>}
    </Card>}

    {detail && <Card title={`投诉详情 · ${detail.complaint.complaintId}`} actions={<StatusTag tone={statusTone(detail.complaint.status)}>{statusLabel(detail.complaint.status)}</StatusTag>}>
      <div className="operations-section-stack">
        <section className="operations-panel"><h3>客户描述</h3><p>{detail.complaint.description}</p></section>
        <div className="operations-form-grid"><FormField label="处理备注"><Textarea value={handlingNote} onChange={(event) => setHandlingNote(event.target.value)} /></FormField><FormField label="返工原因"><Textarea value={repairReason} onChange={(event) => setRepairReason(event.target.value)} /></FormField><FormField label="返工师傅编号（可选）"><Input value={workerId} onChange={(event) => setWorkerId(event.target.value)} /></FormField><Button disabled={!online || busy !== null || !handlingNote.trim() || !["submitted", "triaged", "waiting_customer"].includes(detail.complaint.status)} onClick={() => void execute(complaintId!, "投诉分诊", () => api.triageAftersaleComplaint(complaintId!, { status: "in_progress", priority: detail.complaint.priority, note: handlingNote.trim() }), "投诉已进入处理中。", true)}>开始处理</Button><Button disabled={!online || busy !== null || !repairReason.trim() || ["closed", "rejected"].includes(detail.complaint.status)} onClick={() => void execute(complaintId!, "创建返工", () => api.createAftersaleRepairOrder(complaintId!, { workerId: workerId.trim() || undefined, reason: repairReason.trim() }), "返工单已创建。", true)}>创建返工单</Button></div>

        <section className="operations-panel"><h3>责任认定</h3><div className="operations-form-grid"><FormField label="责任方"><Select value={liableParty} onChange={(event) => setLiableParty(event.target.value as typeof liableParty)}><option value="no_fault">无责</option><option value="worker">师傅责任</option><option value="platform">平台责任</option><option value="customer">客户责任</option><option value="merchant">商户责任</option><option value="shared">共同责任</option></Select></FormField><FormField label="认定原因"><Textarea value={liabilityReason} onChange={(event) => setLiabilityReason(event.target.value)} /></FormField><FormField label="师傅责任比例"><Input type="number" min="0" max="100" value={workerPercent} onChange={(event) => setWorkerPercent(event.target.value)} /></FormField><FormField label="平台责任比例"><Input type="number" min="0" max="100" value={platformPercent} onChange={(event) => setPlatformPercent(event.target.value)} /></FormField><FormField label="客户责任比例"><Input type="number" min="0" max="100" value={customerPercent} onChange={(event) => setCustomerPercent(event.target.value)} /></FormField></div>{liabilityTotal !== 100 && hasAssignedLiability && <div className="operations-alert operations-alert--danger">三方责任比例合计必须为 100%。当前为 {liabilityTotal}%。</div>}<Button disabled={!online || busy !== null || Boolean(detail.liabilityDecision) || !liabilityReason.trim() || (hasAssignedLiability && liabilityTotal !== 100)} onClick={() => void execute(complaintId!, "责任认定", () => api.decideAftersaleLiability(complaintId!, { liableParty, workerLiabilityPercent: liableParty === "no_fault" ? 0 : Number(workerPercent), platformLiabilityPercent: liableParty === "no_fault" ? 0 : Number(platformPercent), customerLiabilityPercent: liableParty === "no_fault" ? 0 : Number(customerPercent), reason: liabilityReason.trim() }), "责任认定已记录。", true)}>记录责任认定</Button></section>

        <section className="operations-panel"><h3>补偿与结案</h3><div className="operations-form-grid"><FormField label="补偿金额"><Input type="number" min="0" value={compensationAmount} onChange={(event) => setCompensationAmount(event.target.value)} /></FormField><FormField label="补偿原因"><Textarea value={compensationReason} onChange={(event) => setCompensationReason(event.target.value)} /></FormField><FormField label="结案说明"><Textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} /></FormField></div><div className="operations-inline-actions"><Button disabled={!online || busy !== null || !compensationReason.trim() || !Number.isFinite(Number(compensationAmount)) || Number(compensationAmount) <= 0 || ["closed", "rejected"].includes(detail.complaint.status)} onClick={() => void execute(complaintId!, "补偿提议", () => api.proposeAftersaleCompensation(complaintId!, { intentType: "service_credit", requestedAmount: Number(compensationAmount), reason: compensationReason.trim() }), "补偿意图已提交，尚未执行任何服务商退款。", true)}>提交服务补偿意图</Button><Button disabled={!online || busy !== null || !resolutionNote.trim() || !["triaged", "in_progress", "waiting_customer"].includes(detail.complaint.status)} onClick={() => void execute(complaintId!, "投诉解决", () => api.resolveAftersaleComplaint(complaintId!, { resolutionType: "explanation", resolutionNote: resolutionNote.trim() }), "投诉解决结果已记录。", true)}>记录解决结果</Button><Button variant="primary" disabled={!online || busy !== null || detail.complaint.status !== "resolved"} onClick={() => void execute(complaintId!, "投诉关闭", () => api.closeAftersaleComplaint(complaintId!), "投诉已关闭。", true)}>关闭投诉</Button></div></section>

        <section className="admin-mobile-panel"><h3>补偿意图</h3>{detail.compensationIntents.length === 0 ? <EmptyState title="暂无补偿意图" /> : <div className="admin-mobile-list">{detail.compensationIntents.map(item => <article className="admin-mobile-item" key={item.compensationIntentId}><header className="admin-mobile-item__header"><h3>{businessLabel(item.intentType)} · {formatCurrency(item.requestedAmount)}</h3><StatusTag tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusTag></header><dl className="admin-mobile-meta"><div><dt>服务商执行</dt><dd>{statusLabel(item.providerExecutionStatus)}</dd></div><div><dt>意图编号</dt><dd>{item.compensationIntentId}</dd></div></dl><div className="admin-mobile-item__actions"><div className="admin-mobile-actions"><Button disabled={!online || busy !== null || item.status !== "proposed" || !compensationReason.trim()} onClick={() => void execute(item.compensationIntentId, "补偿审批", () => api.reviewAftersaleCompensation(item.compensationIntentId, { decision: "approved", approvedAmount: item.requestedAmount, decisionNote: compensationReason.trim() }), "补偿意图已批准；未执行外部退款。", true)}>批准意图</Button><Button disabled={!online || busy !== null || item.status !== "proposed" || !compensationReason.trim()} onClick={() => void execute(item.compensationIntentId, "补偿审批", () => api.reviewAftersaleCompensation(item.compensationIntentId, { decision: "rejected", decisionNote: compensationReason.trim() }), "补偿意图已驳回。", true)}>驳回</Button></div><p className="admin-mobile-note">批准只更新补偿意图，不执行外部退款。</p></div></article>)}</div>}</section>
        <section className="admin-mobile-panel"><h3>处理时间线</h3><div className="admin-mobile-list">{detail.timeline.map(item => <article className="admin-mobile-item" key={item.timelineEventId}><header className="admin-mobile-item__header"><h3>{statusLabel(item.eventType)}</h3><span>{formatDateTime(item.createdAt)}</span></header><dl className="admin-mobile-meta"><div><dt>操作主体</dt><dd>{businessLabel(item.actorType)}：{item.actorId || "系统"}</dd></div><div><dt>内容</dt><dd>{item.content}</dd></div></dl></article>)}</div></section>
      </div>
    </Card>}
    <div className="admin-mobile-bottom-actions"><Button variant="primary" disabled={busy !== null} onClick={() => void load()}>{isRefreshing ? "刷新中…" : "刷新最新售后状态"}</Button>{detail && <Button onClick={() => setDetail(null)}>关闭当前详情</Button>}</div>
  </div>;
}
