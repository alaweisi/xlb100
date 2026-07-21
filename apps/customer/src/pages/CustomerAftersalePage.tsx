import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AftersaleComplaintResponse,
  FulfillmentEvidenceAggregateResponse,
  OrderReverseResponse,
} from "@xlb/api-client";
import {
  ApiErrorPanel,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
  StatusTag,
  Table,
  Textarea,
} from "@xlb/ui";
import { CustomerRouteShell } from "./customerPageShell";

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
  };
}

function requestKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CustomerAftersalePage({ api, orderIds }: CustomerAftersalePageProps) {
  const [orderId, setOrderId] = useState(orderIds[0] ?? "");
  const [reverseType, setReverseType] = useState<"cancel" | "reschedule" | "reassign">("cancel");
  const [reverseReason, setReverseReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState("2026-07-20T10:00");
  const [timeSlot, setTimeSlot] = useState<"morning" | "afternoon" | "evening">("morning");
  const [category, setCategory] = useState<"service_quality" | "price_dispute" | "material" | "timeliness" | "attitude" | "safety" | "damage" | "other">("service_quality");
  const [priority, setPriority] = useState<"normal" | "urgent" | "critical">("normal");
  const [description, setDescription] = useState("");
  const [reverseRequests, setReverseRequests] = useState<OrderReverseResponse[]>([]);
  const [complaints, setComplaints] = useState<AftersaleComplaintResponse[]>([]);
  const [evidenceAggregates, setEvidenceAggregates] = useState<FulfillmentEvidenceAggregateResponse[]>([]);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [disputeComplaintId, setDisputeComplaintId] = useState("");
  const [busy, setBusy] = useState<"reverse" | "complaint" | "load" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    } catch {
      setError("售后记录暂时无法加载，请稍后重试");
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
        idempotencyKey: requestKey("customer-reverse"),
        ...schedule,
      });
      setNotice(`售后申请 ${response.reverseRequest.reverseRequestId} 已提交，当前状态：${response.reverseRequest.status}`);
      setReverseReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "售后申请提交失败，请稍后重试");
    } finally { setBusy(null); }
  }

  async function submitComplaint() {
    if (!orderId || description.trim().length < 5) return;
    setBusy("complaint"); setError(null); setNotice(null);
    try {
      const response = await api.createAftersaleComplaint({
        orderId, category, priority, description: description.trim(),
        idempotencyKey: requestKey("customer-complaint"),
      });
      setNotice(`客诉 ${response.complaint.complaintId} 已提交，当前状态：${response.complaint.status}`);
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "客诉提交失败，请稍后重试");
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
      setNotice(`服务凭证已更新，当前状态：${response.confirmation.status}`);
      setConfirmationNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "服务凭证确认失败，请稍后重试");
    } finally { setBusy(null); }
  }

  return (
    <CustomerRouteShell currentRoute="aftersale">
      <div className="customer-aftersale-stack">
        <Card title="售后服务" actions={<StatusTag tone="primary">进度可查询</StatusTag>}>
          <FormField label="订单">
            {orderIds.length > 0 ? (
              <Select value={orderId} onChange={(event) => setOrderId(event.target.value)}>{selectedOrderOptions}</Select>
            ) : (
              <Input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="输入订单号" />
            )}
          </FormField>
          <Button onClick={() => void load()} disabled={!orderId || busy === "load"}>刷新</Button>
        </Card>

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
            {reverseType === "reschedule" && (
              <div className="customer-mobile-form">
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
            <div className="customer-mobile-form">
              <FormField label="问题类型"><Select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="service_quality">服务质量</option><option value="price_dispute">价格争议</option><option value="material">材料问题</option><option value="timeliness">时效问题</option><option value="attitude">服务态度</option><option value="safety">安全问题</option><option value="damage">物品损坏</option><option value="other">其他</option></Select></FormField>
              <FormField label="优先级"><Select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">普通</option><option value="urgent">紧急</option><option value="critical">重大</option></Select></FormField>
            </div>
            <FormField label="问题描述"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
            <Button variant="primary" disabled={!orderId || description.trim().length < 5 || busy !== null} onClick={() => void submitComplaint()}>提交客诉</Button>
          </div>
        </Card>

        <Card title="逆向记录" actions={<StatusTag tone="muted">{reverseRequests.length}</StatusTag>}>
          {reverseRequests.length === 0 ? <EmptyState title="暂无逆向申请" /> : <Table rows={reverseRequests} getRowKey={(item) => item.reverseRequestId} columns={[
            { key:"type",title:"类型",render:(item)=>item.reverseType },
            { key:"status",title:"状态",render:(item)=><StatusTag tone={item.status === "applied" ? "success" : item.status === "rejected" ? "danger" : "warning"}>{item.status}</StatusTag> },
            { key:"reason",title:"原因",render:(item)=>item.reason },
          ]} />}
        </Card>
        <Card title="客诉记录" actions={<StatusTag tone="muted">{complaints.length}</StatusTag>}>
          {complaints.length === 0 ? <EmptyState title="暂无客诉" /> : <Table rows={complaints} getRowKey={(item) => item.complaintId} columns={[
            { key:"id",title:"客诉单",render:(item)=>item.complaintId },
            { key:"category",title:"类型",render:(item)=>item.category },
            { key:"status",title:"状态",render:(item)=><StatusTag tone={item.status === "closed" ? "success" : "warning"}>{item.status}</StatusTag> },
            { key:"support",title:"客服工单",render:(item)=><a href={`/customer/support?orderId=${encodeURIComponent(item.orderId)}&complaintId=${encodeURIComponent(item.complaintId)}`}>转入客服跟进</a> },
          ]} />}
        </Card>
        <Card title="服务凭证" actions={<StatusTag tone="primary">仅当前订单可见</StatusTag>}>
          <div style={{ display: "grid", gap: 12 }}>
            <FormField label="确认说明"><Textarea value={confirmationNote} onChange={(event) => setConfirmationNote(event.target.value)} /></FormField>
            <FormField label="关联客诉">
              <Select value={disputeComplaintId} onChange={(event) => setDisputeComplaintId(event.target.value)}>
                <option value="">选择已有客诉</option>
                {complaints.map((item)=><option key={item.complaintId} value={item.complaintId}>{item.complaintId}</option>)}
              </Select>
            </FormField>
            {evidenceAggregates.length===0?<EmptyState title="暂无服务凭证" description="师傅提交服务记录后会显示在这里。" />:evidenceAggregates.map((aggregate)=>(
              <div key={aggregate.fulfillmentId} style={{ display: "grid", gap: 10, borderTop: "1px solid #e4e7ec", paddingTop: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{aggregate.fulfillmentId}</strong>
                  <StatusTag tone={aggregate.confirmation?.status === "confirmed" ? "success" : aggregate.confirmation?.status === "disputed" ? "danger" : "warning"}>{aggregate.confirmation?.status === "confirmed" ? "已确认" : aggregate.confirmation?.status === "disputed" ? "有异议" : aggregate.confirmation?.status === "pending" ? "待确认" : "等待师傅完成服务"}</StatusTag>
                </div>
                {aggregate.evidence.length===0?<EmptyState title="暂无凭证记录" />:<Table rows={aggregate.evidence} getRowKey={(item)=>item.evidenceId} columns={[
                  {key:"node",title:"节点",render:(item)=>item.evidenceType},
                  {key:"file",title:"文件",render:(item)=>item.mediaAsset.originalFileName},
                  {key:"provider",title:"存储",render:(item)=>item.mediaAsset.storage.providerStatus},
                  {key:"scan",title:"安全检查",render:(item)=>item.mediaAsset.securityScanStatus},
                ]}/>}
                {aggregate.confirmation?.status === "pending" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="primary" disabled={busy!==null} onClick={()=>void decideConfirmation(aggregate.fulfillmentId,"confirmed")}>确认服务凭证</Button>
                  <Button disabled={busy!==null||!disputeComplaintId||confirmationNote.trim().length<2} onClick={()=>void decideConfirmation(aggregate.fulfillmentId,"disputed")}>提交凭证异议</Button>
                </div>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </CustomerRouteShell>
  );
}
