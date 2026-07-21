import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AftersaleComplaintResponse,
  FulfillmentEvidenceAggregateResponse,
  OrderReverseResponse,
} from "@xlb/api-client";
import type { RefundRequest } from "@xlb/types";
import {
  ApiErrorPanel,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  Select,
  StatusTag,
  Table,
  Textarea,
} from "@xlb/ui";
import { CustomerRouteShell } from "./customerPageShell";
import { toCustomerError } from "../adapters/customerError";
import "./customer-orders.css";

export interface CustomerAftersalePageProps {
  orderIds: string[];
  api: {
    createOrderReverseRequest(orderId: string, body: {
      reverseType: "cancel" | "reschedule" | "reassign";
      reason: string;
      requestedScheduledAt?: string;
      requestedTimeSlot?: "morning" | "afternoon" | "evening";
      idempotencyKey: string;
    }): Promise<{ reverseRequest: OrderReverseResponse }>;
    listOrderReverseRequests(orderId: string): Promise<{ reverseRequests: OrderReverseResponse[] }>;
    createAftersaleComplaint(body: {
      orderId: string;
      category: "service_quality" | "price_dispute" | "material" | "timeliness" | "attitude" | "safety" | "damage" | "other";
      priority: "normal" | "urgent" | "critical";
      description: string;
      idempotencyKey: string;
    }): Promise<{ complaint: AftersaleComplaintResponse }>;
    listAftersaleComplaints(orderId?: string): Promise<{ complaints: AftersaleComplaintResponse[] }>;
    getOrderFulfillmentEvidence(orderId: string): Promise<{ aggregates: FulfillmentEvidenceAggregateResponse[] }>;
    decideFulfillmentConfirmation(fulfillmentId: string, body: {
      decision: "confirmed" | "disputed";
      note?: string;
      complaintId?: string;
    }): Promise<{ confirmation: { status: string } }>;
    createRefundRequest(body: { orderId: string; reason?: string }): Promise<{ refund: RefundRequest; idempotent: boolean }>;
  };
}

function requestKey(prefix: string): string {
  return prefix + "-" + (globalThis.crypto?.randomUUID?.() ?? (Date.now() + "-" + Math.random().toString(16).slice(2)));
}

function initialSchedule(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  date.setHours(10, 0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const reverseTypeLabel: Record<string, string> = { cancel: "取消服务", reschedule: "修改预约", reassign: "更换师傅" };
const reverseStatusLabel: Record<string, string> = { requested: "已申请", approved: "已批准", rejected: "未批准", applied: "已执行" };
const complaintCategoryLabel: Record<string, string> = { service_quality: "服务质量", price_dispute: "价格争议", material: "材料问题", timeliness: "时效问题", attitude: "服务态度", safety: "安全问题", damage: "物品损坏", other: "其他" };
const complaintStatusLabel: Record<string, string> = { submitted: "已提交", triaged: "已分流", in_progress: "处理中", waiting_customer: "等待我的回复", resolved: "已解决", closed: "已关闭", rejected: "未受理" };
const evidenceTypeLabel: Record<string, string> = { arrival: "到场", before_service: "服务前", diagnosis: "诊断", material: "材料", after_service: "服务后", completion: "完工" };

function confirmationTone(status?: string): "success" | "danger" | "warning" {
  if (status === "confirmed") return "success";
  if (status === "disputed") return "danger";
  return "warning";
}

function confirmationLabel(status?: string): string {
  if (status === "confirmed") return "已确认";
  if (status === "disputed") return "已提出异议";
  if (status === "pending") return "等待确认";
  return "等待师傅完工";
}

function isPendingConfirmation(status?: string): boolean {
  return status === "pending";
}

function isApprovedRefund(status?: string): boolean {
  return status === "approved";
}

export function CustomerAftersalePage({ api, orderIds }: CustomerAftersalePageProps) {
  const [orderId, setOrderId] = useState(orderIds[0] ?? "");
  const [reverseType, setReverseType] = useState<"cancel" | "reschedule" | "reassign">("cancel");
  const [reverseReason, setReverseReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState(initialSchedule);
  const [timeSlot, setTimeSlot] = useState<"morning" | "afternoon" | "evening">("morning");
  const [category, setCategory] = useState<"service_quality" | "price_dispute" | "material" | "timeliness" | "attitude" | "safety" | "damage" | "other">("service_quality");
  const [priority, setPriority] = useState<"normal" | "urgent" | "critical">("normal");
  const [description, setDescription] = useState("");
  const [reverseRequests, setReverseRequests] = useState<OrderReverseResponse[]>([]);
  const [complaints, setComplaints] = useState<AftersaleComplaintResponse[]>([]);
  const [evidenceAggregates, setEvidenceAggregates] = useState<FulfillmentEvidenceAggregateResponse[]>([]);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [disputeComplaintId, setDisputeComplaintId] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundResult, setRefundResult] = useState<{ refund: RefundRequest; idempotent: boolean } | null>(null);
  const [busy, setBusy] = useState<"reverse" | "complaint" | "load" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const commandKeys = useRef<Record<string, string>>({});
  const commandKey = (name: string, prefix: string) => commandKeys.current[name] ?? (commandKeys.current[name] = requestKey(prefix));
  const completeCommand = (name: string) => { delete commandKeys.current[name]; };

  const load = useCallback(async () => {
    if (!orderId) return;
    setBusy("load");
    setError(null);
    try {
      const [reverse, complaint, evidence] = await Promise.all([
        api.listOrderReverseRequests(orderId),
        api.listAftersaleComplaints(orderId),
        api.getOrderFulfillmentEvidence(orderId),
      ]);
      setReverseRequests(reverse.reverseRequests);
      setComplaints(complaint.complaints);
      setEvidenceAggregates(evidence.aggregates);
    } catch (err) {
      setError(toCustomerError(err, "售后记录加载失败").description);
    } finally {
      setBusy(null);
    }
  }, [api, orderId]);

  useEffect(() => { void load(); }, [load]);

  const selectedOrderOptions = useMemo(
    () => orderIds.map((id) => <option key={id} value={id}>{id}</option>),
    [orderIds],
  );

  async function submitReverse() {
    if (!orderId || reverseReason.trim().length < 2) return;
    setBusy("reverse"); setError(null); setNotice(null);
    try {
      const schedule = reverseType === "reschedule"
        ? { requestedScheduledAt: new Date(scheduledAt).toISOString(), requestedTimeSlot: timeSlot }
        : {};
      const response = await api.createOrderReverseRequest(orderId, {
        reverseType,
        reason: reverseReason.trim(),
        idempotencyKey: commandKey(`reverse:${orderId}:${reverseType}`, "customer-reverse"),
        ...schedule,
      });
      completeCommand(`reverse:${orderId}:${reverseType}`);
      setNotice(`逆向申请 ${response.reverseRequest.reverseRequestId} 已提交，当前状态：${reverseStatusLabel[response.reverseRequest.status] ?? "待确认"}。`);
      setReverseReason("");
      await load();
    } catch (err) {
      setError(toCustomerError(err, "逆向申请提交失败").description);
    } finally { setBusy(null); }
  }

  async function submitComplaint() {
    if (!orderId || description.trim().length < 5) return;
    setBusy("complaint"); setError(null); setNotice(null);
    try {
      const response = await api.createAftersaleComplaint({
        orderId, category, priority, description: description.trim(),
        idempotencyKey: commandKey(`complaint:${orderId}`, "customer-complaint"),
      });
      completeCommand(`complaint:${orderId}`);
      setNotice(`投诉 ${response.complaint.complaintId} 已提交，当前状态：${complaintStatusLabel[response.complaint.status] ?? "待确认"}。`);
      setDescription("");
      await load();
    } catch (err) {
      setError(toCustomerError(err, "投诉提交失败").description);
    } finally { setBusy(null); }
  }

  async function decideConfirmation(fulfillmentId: string, decision: "confirmed" | "disputed") {
    setBusy("load"); setError(null); setNotice(null);
    try {
      const response = await api.decideFulfillmentConfirmation(fulfillmentId, {
        decision,
        note: confirmationNote.trim() || undefined,
        complaintId: decision === "disputed" ? disputeComplaintId || undefined : undefined,
      });
      setNotice(`服务凭证已${response.confirmation.status === "confirmed" ? "确认" : response.confirmation.status === "disputed" ? "提出异议" : "更新"}。`);
      setConfirmationNote("");
      await load();
    } catch (err) {
      setError(toCustomerError(err, "服务凭证确认失败").description);
    } finally { setBusy(null); }
  }

  async function submitRefund() {
    if (!orderId) return;
    const operation = `refund:${orderId}`;
    setBusy("complaint"); setError(null); setNotice(null);
    try {
      const response = await api.createRefundRequest({ orderId, ...(refundReason.trim() ? { reason: refundReason.trim() } : {}) });
      completeCommand(operation);
      setRefundResult(response);
      setNotice(`退款申请 ${response.refund.refundId} 已由服务端受理，当前状态：${response.refund.status === "approved" ? "已批准" : "待处理"}。`);
    } catch (err) {
      setError(toCustomerError(err, "退款申请提交失败").description);
    } finally { setBusy(null); }
  }

  const isLoadingRecords = busy === "load";
  const isRescheduling = reverseType === "reschedule";
  const refundApproved = isApprovedRefund(refundResult?.refund.status);

  return (
    <CustomerRouteShell currentRoute="aftersale">
      <div className="customer-aftersale-stack">
        <Card title="售后服务" actions={<StatusTag tone="primary">服务端状态</StatusTag>}>
          <FormField label="订单">
            {orderIds.length > 0 ? (
              <Select value={orderId} onChange={(event) => setOrderId(event.target.value)}>{selectedOrderOptions}</Select>
            ) : (
              <Input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="输入订单号" />
            )}
          </FormField>
          <Button onClick={() => void load()} disabled={!orderId || isLoadingRecords}>刷新</Button>
        </Card>

        {isLoadingRecords && <LoadingState title="正在加载售后记录" description="读取逆向申请、投诉与服务凭证" />}
        {error && <ApiErrorPanel title="操作失败" detail={error} />}
        {notice && <Card title="已受理" actions={<StatusTag tone="success">后端已确认</StatusTag>}><p>{notice}</p></Card>}

        <Card title="订单逆向申请">
          <div style={{ display: "grid", gap: 12 }}>
            <FormField label="类型">
              <Select value={reverseType} onChange={(event) => setReverseType(event.target.value as typeof reverseType)}>
                <option value="cancel">取消服务</option>
                <option value="reschedule">修改预约</option>
                <option value="reassign">申请更换师傅</option>
              </Select>
            </FormField>
            {isRescheduling && (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
                <FormField label="新预约时间"><Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></FormField>
                <FormField label="时段"><Select value={timeSlot} onChange={(event) => setTimeSlot(event.target.value as typeof timeSlot)}><option value="morning">上午</option><option value="afternoon">下午</option><option value="evening">晚上</option></Select></FormField>
              </div>
            )}
            <FormField label="原因"><Textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></FormField>
            <Button variant="primary" disabled={!orderId || reverseReason.trim().length < 2 || busy !== null} onClick={() => void submitReverse()}>提交申请</Button>
          </div>
        </Card>

        <Card title="提交客诉">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
              <FormField label="问题类型"><Select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="service_quality">服务质量</option><option value="price_dispute">价格争议</option><option value="material">材料问题</option><option value="timeliness">时效问题</option><option value="attitude">服务态度</option><option value="safety">安全问题</option><option value="damage">物品损坏</option><option value="other">其他</option></Select></FormField>
              <FormField label="优先级"><Select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">普通</option><option value="urgent">紧急</option><option value="critical">重大</option></Select></FormField>
            </div>
            <FormField label="问题描述"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
            <Button variant="primary" disabled={!orderId || description.trim().length < 5 || busy !== null} onClick={() => void submitComplaint()}>提交客诉</Button>
          </div>
        </Card>

        <Card title="退款申请">
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>这里只提交退款申请，不代表退款已批准或已到账；金额和处理结果以服务端为准。</p>
            <FormField label="退款原因（选填）"><Textarea maxLength={255} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} /></FormField>
            <Button variant="primary" disabled={!orderId || busy !== null} onClick={() => void submitRefund()}>提交退款申请</Button>
            {refundResult ? <div className="customer-review-inline"><StatusTag tone="warning">{refundApproved ? "已批准" : "待处理"}</StatusTag><StatusTag tone="muted">申请号：{refundResult.refund.refundId}</StatusTag>{refundResult.idempotent ? <StatusTag tone="warning">服务端返回已有申请</StatusTag> : null}</div> : null}
          </div>
        </Card>

        <Card title="逆向记录" actions={<StatusTag tone="muted">{reverseRequests.length}</StatusTag>}>
          {reverseRequests.length === 0 ? <EmptyState title="暂无逆向申请" /> : <Table rows={reverseRequests} getRowKey={(item) => item.reverseRequestId} columns={[
            { key:"type",title:"类型",render:(item)=>reverseTypeLabel[item.reverseType] ?? "其他" },
            { key:"status",title:"状态",render:(item)=><StatusTag tone={item.status === "applied" ? "success" : item.status === "rejected" ? "danger" : "warning"}>{reverseStatusLabel[item.status] ?? "待确认"}</StatusTag> },
            { key:"reason",title:"原因",render:(item)=>item.reason },
          ]} />}
        </Card>
        <Card title="客诉记录" actions={<StatusTag tone="muted">{complaints.length}</StatusTag>}>
          {complaints.length === 0 ? <EmptyState title="暂无客诉" /> : <Table rows={complaints} getRowKey={(item) => item.complaintId} columns={[
            { key:"id",title:"客诉单",render:(item)=>item.complaintId },
            { key:"category",title:"类型",render:(item)=>complaintCategoryLabel[item.category] ?? "其他" },
            { key:"status",title:"状态",render:(item)=><StatusTag tone={item.status === "closed" ? "success" : item.status === "rejected" ? "danger" : "warning"}>{complaintStatusLabel[item.status] ?? "待确认"}</StatusTag> },
            { key:"support",title:"客服工单",render:(item)=><a href={`/customer/support?orderId=${encodeURIComponent(item.orderId)}&complaintId=${encodeURIComponent(item.complaintId)}`}>转入客服跟进</a> },
          ]} />}
        </Card>
        <Card title="服务凭证与顾客确认" actions={<StatusTag tone="primary">服务端凭证</StatusTag>}>
          <div style={{ display: "grid", gap: 12 }}>
            <FormField label="确认说明"><Textarea value={confirmationNote} onChange={(event) => setConfirmationNote(event.target.value)} /></FormField>
            <FormField label="异议关联投诉">
              <Select value={disputeComplaintId} onChange={(event) => setDisputeComplaintId(event.target.value)}>
                <option value="">选择已有投诉</option>
                {complaints.map((item)=><option key={item.complaintId} value={item.complaintId}>{item.complaintId}</option>)}
              </Select>
            </FormField>
            {evidenceAggregates.length===0?<EmptyState title="暂无服务凭证" description="师傅提交完工凭证后会显示在这里。" />:evidenceAggregates.map((aggregate)=>(
              <div key={aggregate.fulfillmentId} style={{ display: "grid", gap: 10, borderTop: "1px solid #e4e7ec", paddingTop: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{aggregate.fulfillmentId}</strong>
                  <StatusTag tone={confirmationTone(aggregate.confirmation?.status)}>{confirmationLabel(aggregate.confirmation?.status)}</StatusTag>
                </div>
                {aggregate.evidence.length===0?<EmptyState title="暂无凭证图片" />:<Table rows={aggregate.evidence} getRowKey={(item)=>item.evidenceId} columns={[
                  {key:"node",title:"环节",render:(item)=>evidenceTypeLabel[item.evidenceType] ?? "服务凭证"},
                  {key:"file",title:"文件",render:(item)=>item.mediaAsset.originalFileName},
                  {key:"provider",title:"存储",render:(item)=>item.mediaAsset.storage.externalProviderExecuted ? "外部存储已执行" : "平台存储"},
                  {key:"scan",title:"安全检查",render:(item)=>item.mediaAsset.securityScanStatus === "not_malware_scanned_local" ? "未完成恶意软件扫描" : "状态待确认"},
                ]}/>}
                {isPendingConfirmation(aggregate.confirmation?.status) && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="primary" disabled={busy!==null} onClick={()=>void decideConfirmation(aggregate.fulfillmentId,"confirmed")}>确认服务凭证</Button>
                  <Button disabled={busy!==null||!disputeComplaintId||confirmationNote.trim().length<2} onClick={()=>void decideConfirmation(aggregate.fulfillmentId,"disputed")}>关联投诉并提出异议</Button>
                </div>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </CustomerRouteShell>
  );
}
