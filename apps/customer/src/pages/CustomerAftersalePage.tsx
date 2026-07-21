import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  CalendarBlank,
  ChatCircleDots,
  CheckCircle,
  Clock,
  FileImage,
  Headset,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  AftersaleComplaintResponse,
  FulfillmentEvidenceAggregateResponse,
  OrderReverseResponse,
} from "@xlb/api-client";
import {
  Button,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Select,
  StatusTag,
  Textarea,
} from "@xlb/ui";
import { describeCustomerAppError, type CustomerAppFailure } from "./customerPageShell";
import "./customer-aftersale.css";

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

type BusyAction = "load" | "reverse" | "complaint" | "confirmation";

type ResultMessage = {
  title: string;
  description: string;
  reference?: string;
};

const reverseTypeCopy: Record<OrderReverseResponse["reverseType"], string> = {
  cancel: "取消服务",
  reschedule: "修改预约",
  reassign: "更换师傅",
};

const reverseStatusCopy: Record<OrderReverseResponse["status"], string> = {
  requested: "待平台审核",
  approved: "平台已批准",
  rejected: "申请未通过",
  applied: "变更已处理",
};

const complaintCategoryCopy: Record<AftersaleComplaintResponse["category"], string> = {
  service_quality: "服务质量",
  price_dispute: "价格争议",
  material: "材料问题",
  timeliness: "时效问题",
  attitude: "服务态度",
  safety: "安全问题",
  damage: "物品损坏",
  other: "其他问题",
};

const complaintPriorityCopy: Record<AftersaleComplaintResponse["priority"], string> = {
  normal: "普通",
  urgent: "紧急",
  critical: "重大",
};

const complaintStatusCopy: Record<AftersaleComplaintResponse["status"], string> = {
  submitted: "已提交",
  triaged: "已分派",
  in_progress: "处理中",
  waiting_customer: "待你补充",
  resolved: "已解决",
  closed: "已关闭",
  rejected: "未受理",
};

const evidenceTypeCopy: Record<string, string> = {
  arrival: "到达现场",
  before_service: "服务前",
  diagnosis: "问题诊断",
  material: "材料记录",
  after_service: "服务后",
  completion: "完工结果",
};

const confirmationStatusCopy: Record<string, string> = {
  pending: "等待你确认",
  confirmed: "你已确认完成",
  disputed: "你已提出争议",
};

function requestKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "时间待更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待更新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function reverseTone(status: OrderReverseResponse["status"]): "success" | "warning" | "danger" | "primary" {
  if (status === "applied") return "success";
  if (status === "rejected") return "danger";
  if (status === "approved") return "primary";
  return "warning";
}

function complaintTone(status: AftersaleComplaintResponse["status"]): "success" | "warning" | "danger" | "primary" | "muted" {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "rejected") return "danger";
  if (status === "waiting_customer") return "warning";
  if (status === "triaged" || status === "in_progress") return "primary";
  return "muted";
}

function confirmationTone(status: string | undefined): "success" | "warning" | "danger" | "muted" {
  if (status === "confirmed") return "success";
  if (status === "disputed") return "danger";
  if (status === "pending") return "warning";
  return "muted";
}

export function CustomerAftersalePage({ api, orderIds }: CustomerAftersalePageProps) {
  const availableOrderIds = useMemo(() => [...new Set(orderIds.filter(Boolean))], [orderIds]);
  const [orderId, setOrderId] = useState(availableOrderIds[0] ?? "");
  const [reverseType, setReverseType] = useState<"cancel" | "reschedule" | "reassign">("cancel");
  const [reverseReason, setReverseReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timeSlot, setTimeSlot] = useState<"morning" | "afternoon" | "evening">("morning");
  const [category, setCategory] = useState<AftersaleComplaintResponse["category"]>("service_quality");
  const [priority, setPriority] = useState<AftersaleComplaintResponse["priority"]>("normal");
  const [description, setDescription] = useState("");
  const [reverseRequests, setReverseRequests] = useState<OrderReverseResponse[]>([]);
  const [complaints, setComplaints] = useState<AftersaleComplaintResponse[]>([]);
  const [evidenceAggregates, setEvidenceAggregates] = useState<FulfillmentEvidenceAggregateResponse[]>([]);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [disputeComplaintId, setDisputeComplaintId] = useState("");
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [failure, setFailure] = useState<CustomerAppFailure | null>(null);
  const [result, setResult] = useState<ResultMessage | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [reverseAttempted, setReverseAttempted] = useState(false);
  const [complaintAttempted, setComplaintAttempted] = useState(false);

  useEffect(() => {
    if (availableOrderIds.length === 0) {
      setOrderId("");
      return;
    }
    if (!availableOrderIds.includes(orderId)) {
      setOrderId(availableOrderIds[0] ?? "");
    }
  }, [availableOrderIds, orderId]);

  const load = useCallback(async () => {
    if (!orderId) return;
    setBusy("load");
    setFailure(null);
    try {
      const [reverse, complaint, evidence] = await Promise.all([
        api.listOrderReverseRequests(orderId),
        api.listAftersaleComplaints(orderId),
        api.getOrderFulfillmentEvidence(orderId),
      ]);
      setReverseRequests(reverse.reverseRequests);
      setComplaints(complaint.complaints);
      setEvidenceAggregates(evidence.aggregates);
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setHasLoaded(true);
      setBusy(null);
    }
  }, [api, orderId]);

  useEffect(() => {
    setHasLoaded(false);
    setResult(null);
    if (orderId) void load();
  }, [load, orderId]);

  const reverseValidation = !reverseReason.trim()
    ? "请说明申请原因。"
    : reverseReason.trim().length < 2
      ? "申请原因至少填写 2 个字。"
      : reverseType === "reschedule" && !scheduledAt
        ? "请选择新的上门时间。"
        : null;
  const complaintValidation = !description.trim()
    ? "请描述遇到的问题。"
    : description.trim().length < 5
      ? "问题描述至少填写 5 个字，便于客服跟进。"
      : null;

  async function submitReverse() {
    setReverseAttempted(true);
    if (!orderId || reverseValidation) return;
    setBusy("reverse");
    setFailure(null);
    setResult(null);
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
      setResult({
        title: "申请已由平台受理",
        description: `当前状态：${reverseStatusCopy[response.reverseRequest.status]}。处理进展会保留在下方记录中。`,
        reference: response.reverseRequest.reverseRequestId,
      });
      setReverseReason("");
      setScheduledAt("");
      setReverseAttempted(false);
      await load();
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setBusy(null);
    }
  }

  async function submitComplaint() {
    setComplaintAttempted(true);
    if (!orderId || complaintValidation) return;
    setBusy("complaint");
    setFailure(null);
    setResult(null);
    try {
      const response = await api.createAftersaleComplaint({
        orderId,
        category,
        priority,
        description: description.trim(),
        idempotencyKey: requestKey("customer-complaint"),
      });
      setResult({
        title: "客诉已由平台受理",
        description: `当前状态：${complaintStatusCopy[response.complaint.status]}。可继续通过客服入口补充信息。`,
        reference: response.complaint.complaintId,
      });
      setDescription("");
      setComplaintAttempted(false);
      await load();
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setBusy(null);
    }
  }

  async function decideConfirmation(fulfillmentId: string, decision: "confirmed" | "disputed") {
    if (decision === "disputed" && (!disputeComplaintId || confirmationNote.trim().length < 2)) return;
    setBusy("confirmation");
    setFailure(null);
    setResult(null);
    try {
      const response = await api.decideFulfillmentConfirmation(fulfillmentId, {
        decision,
        note: confirmationNote.trim() || undefined,
        complaintId: decision === "disputed" ? disputeComplaintId : undefined,
      });
      setResult({
        title: decision === "confirmed" ? "完工结果已确认" : "争议已提交",
        description: confirmationStatusCopy[response.confirmation.status] ?? "平台已记录你的处理结果。",
        reference: fulfillmentId,
      });
      setConfirmationNote("");
      setDisputeComplaintId("");
      await load();
    } catch (error) {
      setFailure(describeCustomerAppError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="customer-aftersale">
      <header className="customer-aftersale__hero">
        <div className="customer-aftersale__hero-icon" aria-hidden="true">
          <ShieldCheck weight="duotone" />
        </div>
        <div>
          <p>售后保障</p>
          <h1>售后服务</h1>
          <span>围绕真实订单提交申请、客诉或履约确认，每一步都保留服务记录。</span>
        </div>
      </header>

      {availableOrderIds.length === 0 ? (
        <EmptyState
          action={<a className="customer-aftersale__state-link" href="/customer/orders">查看我的订单</a>}
          description="完成下单后，可从订单进入取消、改期、客诉和履约确认。"
          productRole="customer"
          title="还没有可处理的订单"
        />
      ) : (
        <>
          <section aria-labelledby="aftersale-order-title" className="customer-aftersale__order-bar">
            <div>
              <span id="aftersale-order-title">当前售后订单</span>
              <Select
                aria-label="选择售后订单"
                onChange={(event) => setOrderId(event.target.value)}
                productRole="customer"
                value={orderId}
              >
                {availableOrderIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </Select>
            </div>
            <Button
              aria-label="刷新售后进展"
              disabled={!orderId || busy !== null}
              onClick={() => void load()}
              productRole="customer"
              variant="secondary"
            >
              <ArrowClockwise aria-hidden="true" weight="bold" />
              刷新
            </Button>
          </section>

          <nav aria-label="售后页面分区" className="customer-aftersale__section-nav">
            <a href="#aftersale-request"><Clock aria-hidden="true" />申请变更</a>
            <a href="#aftersale-complaint"><ChatCircleDots aria-hidden="true" />提交客诉</a>
            <a href="#aftersale-evidence"><FileImage aria-hidden="true" />履约确认</a>
          </nav>

          {busy === "load" && !hasLoaded ? (
            <LoadingState
              description="正在同步逆向申请、客诉和履约记录。"
              productRole="customer"
              title="正在读取售后进展"
            />
          ) : null}

          {failure ? (
            <ErrorState
              action={(
                <Button onClick={() => void load()} productRole="customer" variant="secondary">
                  {failure.retryLabel}
                </Button>
              )}
              description={`${failure.description} 已填写的内容仍保留在页面中。`}
              productRole="customer"
              title={failure.title}
            />
          ) : null}

          {result ? (
            <section aria-live="polite" className="customer-aftersale__result" role="status">
              <CheckCircle aria-hidden="true" weight="fill" />
              <div>
                <strong>{result.title}</strong>
                <p>{result.description}</p>
                {result.reference ? <span>服务记录号：{result.reference}</span> : null}
              </div>
            </section>
          ) : null}

          <div className="customer-aftersale__form-grid">
            <section aria-labelledby="aftersale-request-title" className="customer-aftersale__panel" id="aftersale-request">
              <div className="customer-aftersale__section-heading">
                <span aria-hidden="true"><CalendarBlank weight="duotone" /></span>
                <div>
                  <p>订单变更</p>
                  <h2 id="aftersale-request-title">申请取消、改期或换师傅</h2>
                </div>
              </div>
              <p className="customer-aftersale__section-copy">提交后由平台按当前订单状态审核，不会在本地直接改变订单。</p>
              <div className="customer-aftersale__form">
                <FormField label="申请类型">
                  <Select
                    onChange={(event) => setReverseType(event.target.value as typeof reverseType)}
                    productRole="customer"
                    value={reverseType}
                  >
                    <option value="cancel">取消服务</option>
                    <option value="reschedule">修改预约</option>
                    <option value="reassign">申请更换师傅</option>
                  </Select>
                </FormField>
                {reverseType === "reschedule" ? (
                  <div className="customer-aftersale__field-row">
                    <FormField label="新的上门时间">
                      <Input
                        onChange={(event) => setScheduledAt(event.target.value)}
                        productRole="customer"
                        type="datetime-local"
                        value={scheduledAt}
                      />
                    </FormField>
                    <FormField label="期望时段">
                      <Select
                        onChange={(event) => setTimeSlot(event.target.value as typeof timeSlot)}
                        productRole="customer"
                        value={timeSlot}
                      >
                        <option value="morning">上午</option>
                        <option value="afternoon">下午</option>
                        <option value="evening">晚上</option>
                      </Select>
                    </FormField>
                  </div>
                ) : null}
                <FormField label="申请原因">
                  <Textarea
                    aria-describedby="aftersale-reverse-help"
                    onChange={(event) => setReverseReason(event.target.value)}
                    placeholder="请简要说明原因"
                    productRole="customer"
                    rows={4}
                    value={reverseReason}
                  />
                </FormField>
                <p className={reverseAttempted && reverseValidation ? "customer-aftersale__validation is-error" : "customer-aftersale__validation"} id="aftersale-reverse-help">
                  {reverseAttempted && reverseValidation ? reverseValidation : "平台会结合订单状态审核，申请结果以服务端记录为准。"}
                </p>
                <Button
                  disabled={!orderId || Boolean(reverseValidation) || busy !== null}
                  onClick={() => void submitReverse()}
                  productRole="customer"
                  variant="primary"
                >
                  {busy === "reverse" ? "正在提交申请…" : "提交变更申请"}
                </Button>
              </div>
            </section>

            <section aria-labelledby="aftersale-complaint-title" className="customer-aftersale__panel" id="aftersale-complaint">
              <div className="customer-aftersale__section-heading">
                <span aria-hidden="true"><Headset weight="duotone" /></span>
                <div>
                  <p>问题反馈</p>
                  <h2 id="aftersale-complaint-title">提交客诉</h2>
                </div>
              </div>
              <p className="customer-aftersale__section-copy">描述实际情况与影响程度，客服将按服务端进展持续跟进。</p>
              <div className="customer-aftersale__form">
                <div className="customer-aftersale__field-row">
                  <FormField label="问题类型">
                    <Select
                      onChange={(event) => setCategory(event.target.value as typeof category)}
                      productRole="customer"
                      value={category}
                    >
                      {Object.entries(complaintCategoryCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="影响程度">
                    <Select
                      onChange={(event) => setPriority(event.target.value as typeof priority)}
                      productRole="customer"
                      value={priority}
                    >
                      <option value="normal">普通</option>
                      <option value="urgent">紧急</option>
                      <option value="critical">重大</option>
                    </Select>
                  </FormField>
                </div>
                <FormField label="问题描述">
                  <Textarea
                    aria-describedby="aftersale-complaint-help"
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="请说明发生了什么，以及希望得到的帮助"
                    productRole="customer"
                    rows={5}
                    value={description}
                  />
                </FormField>
                <p className={complaintAttempted && complaintValidation ? "customer-aftersale__validation is-error" : "customer-aftersale__validation"} id="aftersale-complaint-help">
                  {complaintAttempted && complaintValidation ? complaintValidation : "安全或物品损坏问题请选择相应类型，便于平台优先处理。"}
                </p>
                <Button
                  disabled={!orderId || Boolean(complaintValidation) || busy !== null}
                  onClick={() => void submitComplaint()}
                  productRole="customer"
                  variant="primary"
                >
                  {busy === "complaint" ? "正在提交客诉…" : "提交客诉"}
                </Button>
              </div>
            </section>
          </div>

          <section aria-labelledby="aftersale-progress-title" className="customer-aftersale__progress">
            <div className="customer-aftersale__section-heading customer-aftersale__section-heading--plain">
              <div>
                <p>处理进展</p>
                <h2 id="aftersale-progress-title">申请与客诉记录</h2>
              </div>
            </div>

            <div className="customer-aftersale__record-group">
              <div className="customer-aftersale__record-title">
                <h3>订单变更申请</h3>
                <span>{reverseRequests.length} 条</span>
              </div>
              {hasLoaded && reverseRequests.length === 0 ? (
                <EmptyState description="提交取消、改期或换师傅申请后，会在这里显示审核进度。" productRole="customer" title="暂无变更申请" />
              ) : (
                <ul className="customer-aftersale__record-list">
                  {reverseRequests.map((item) => (
                    <li className="customer-aftersale__record-card" key={item.reverseRequestId}>
                      <div className="customer-aftersale__record-header">
                        <div>
                          <strong>{reverseTypeCopy[item.reverseType]}</strong>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                        <StatusTag tone={reverseTone(item.status)}>{reverseStatusCopy[item.status]}</StatusTag>
                      </div>
                      <p>{item.reason}</p>
                      {item.requestedScheduledAt ? (
                        <span className="customer-aftersale__record-meta">
                          新预约：{formatDate(item.requestedScheduledAt)} · {item.requestedTimeSlot === "morning" ? "上午" : item.requestedTimeSlot === "afternoon" ? "下午" : "晚上"}
                        </span>
                      ) : null}
                      {item.reviewNote ? <span className="customer-aftersale__record-note">平台说明：{item.reviewNote}</span> : null}
                      <span className="customer-aftersale__record-id">记录号：{item.reverseRequestId}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="customer-aftersale__record-group">
              <div className="customer-aftersale__record-title">
                <h3>客诉记录</h3>
                <span>{complaints.length} 条</span>
              </div>
              {hasLoaded && complaints.length === 0 ? (
                <EmptyState description="提交问题后，平台受理、处理和解决进展会保留在这里。" productRole="customer" title="暂无客诉记录" />
              ) : (
                <ul className="customer-aftersale__record-list">
                  {complaints.map((item) => (
                    <li className="customer-aftersale__record-card" key={item.complaintId}>
                      <div className="customer-aftersale__record-header">
                        <div>
                          <strong>{complaintCategoryCopy[item.category]}</strong>
                          <span>{formatDate(item.submittedAt)} · {complaintPriorityCopy[item.priority]}</span>
                        </div>
                        <StatusTag tone={complaintTone(item.status)}>{complaintStatusCopy[item.status]}</StatusTag>
                      </div>
                      <p>{item.description}</p>
                      {item.resolutionNote ? <span className="customer-aftersale__record-note">处理说明：{item.resolutionNote}</span> : null}
                      <div className="customer-aftersale__record-footer">
                        <span className="customer-aftersale__record-id">客诉单：{item.complaintId}</span>
                        <a href={`/customer/support?orderId=${encodeURIComponent(item.orderId)}&complaintId=${encodeURIComponent(item.complaintId)}`}>
                          转入客服跟进
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="aftersale-evidence-title" className="customer-aftersale__panel customer-aftersale__evidence" id="aftersale-evidence">
            <div className="customer-aftersale__section-heading">
              <span aria-hidden="true"><FileImage weight="duotone" /></span>
              <div>
                <p>履约留痕</p>
                <h2 id="aftersale-evidence-title">查看证据并确认结果</h2>
              </div>
            </div>
            <div className="customer-aftersale__privacy-note">
              <ShieldCheck aria-hidden="true" weight="fill" />
              <span>履约图片由平台私密保存，仅用于当前订单确认与售后处理。</span>
            </div>

            {hasLoaded && evidenceAggregates.length === 0 ? (
              <EmptyState description="师傅提交履约记录后，你可以在这里查看并确认。" productRole="customer" title="暂无履约证据" />
            ) : null}

            {evidenceAggregates.map((aggregate) => {
              const confirmationStatus = aggregate.confirmation?.status;
              const isPending = confirmationStatus === "pending";
              const disputeDisabled = !disputeComplaintId || confirmationNote.trim().length < 2 || busy !== null;
              return (
                <article className="customer-aftersale__evidence-card" key={aggregate.fulfillmentId}>
                  <div className="customer-aftersale__record-header">
                    <div>
                      <strong>本次服务履约记录</strong>
                      <span>{aggregate.evidence.length} 项证据</span>
                    </div>
                    <StatusTag tone={confirmationTone(confirmationStatus)}>
                      {confirmationStatusCopy[confirmationStatus ?? ""] ?? "等待师傅提交"}
                    </StatusTag>
                  </div>

                  {aggregate.evidence.length === 0 ? (
                    <p className="customer-aftersale__evidence-empty">当前还没有可查看的履约图片。</p>
                  ) : (
                    <ul className="customer-aftersale__evidence-list">
                      {aggregate.evidence.map((item) => (
                        <li key={item.evidenceId}>
                          <span aria-hidden="true"><FileImage weight="duotone" /></span>
                          <div>
                            <strong>{evidenceTypeCopy[item.evidenceType] ?? "履约记录"}</strong>
                            <p>{item.mediaAsset.originalFileName}</p>
                            <small>{formatDate(item.capturedAt)} · 文件完整性已校验</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {isPending ? (
                    <div className="customer-aftersale__confirmation">
                      <FormField label="确认备注（可选）/ 争议说明（必填）">
                        <Textarea
                          onChange={(event) => setConfirmationNote(event.target.value)}
                          placeholder="确认可留空；提出争议请至少填写 2 个字"
                          productRole="customer"
                          rows={3}
                          value={confirmationNote}
                        />
                      </FormField>
                      <FormField label="争议关联客诉">
                        <Select
                          onChange={(event) => setDisputeComplaintId(event.target.value)}
                          productRole="customer"
                          value={disputeComplaintId}
                        >
                          <option value="">请选择已有客诉</option>
                          {complaints.map((item) => (
                            <option key={item.complaintId} value={item.complaintId}>
                              {complaintCategoryCopy[item.category]} · {item.complaintId}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      {complaints.length === 0 ? (
                        <p className="customer-aftersale__confirmation-help">
                          <WarningCircle aria-hidden="true" />提出争议前，请先在上方提交客诉并说明问题。
                        </p>
                      ) : null}
                      <div className="customer-aftersale__confirmation-actions">
                        <Button
                          disabled={busy !== null}
                          onClick={() => void decideConfirmation(aggregate.fulfillmentId, "confirmed")}
                          productRole="customer"
                          variant="primary"
                        >
                          {busy === "confirmation" ? "正在提交…" : "确认服务完成"}
                        </Button>
                        <Button
                          aria-describedby="aftersale-dispute-help"
                          disabled={disputeDisabled}
                          onClick={() => void decideConfirmation(aggregate.fulfillmentId, "disputed")}
                          productRole="customer"
                          variant="danger"
                        >
                          提出履约争议
                        </Button>
                      </div>
                      <p className="customer-aftersale__validation" id="aftersale-dispute-help">
                        提出争议需要选择客诉并填写说明；提交后以平台记录为准。
                      </p>
                    </div>
                  ) : null}
                  <span className="customer-aftersale__record-id">履约记录号：{aggregate.fulfillmentId}</span>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
