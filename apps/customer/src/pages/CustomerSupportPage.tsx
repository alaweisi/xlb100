import { useCallback, useEffect, useReducer, useState } from "react";
import {
  ArrowClockwise,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  Clock,
  Headset,
  Lifebuoy,
  PaperPlaneRight,
  Plus,
  ShieldCheck,
  Star,
  Ticket,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  AddSupportTicketCommentRequest,
  CreateSupportConversationRequest,
  CreateSupportTicketRequest,
  ReopenSupportTicketRequest,
  SendSupportMessageRequest,
  SubmitSupportCsatRequest,
  SupportConversationDetailResponse,
  SupportConversationListResponse,
  SupportConversationResponse,
  SupportConversationStatus,
  SupportMessageResponse,
  SupportMessageSenderType,
  SupportTicketDetailResponse,
  SupportTicketEventType,
  SupportTicketListFilters,
  SupportTicketListResponse,
  SupportTicketMutationResponse,
  SupportTicketPriority,
  SupportTicketResponse,
  SupportTicketStatus,
  SupportTicketType,
} from "@xlb/types";
import {
  Button,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  SegmentedControl,
  Select,
  StatusTag,
  Textarea,
} from "@xlb/ui";
import {
  initialSupportUiState,
  supportUiReducer,
} from "../features/support/reducer";
import { CustomerRouteShell } from "./customerPageShell";
import "./customer-support.css";

export type CustomerSupportApi = {
  createTicket(input: CreateSupportTicketRequest): Promise<SupportTicketResponse>;
  listTickets(filters?: SupportTicketListFilters): Promise<SupportTicketListResponse>;
  getTicket(ticketId: string): Promise<SupportTicketDetailResponse>;
  addComment(
    ticketId: string,
    input: AddSupportTicketCommentRequest,
  ): Promise<SupportTicketMutationResponse>;
  reopenTicket(
    ticketId: string,
    input: ReopenSupportTicketRequest,
  ): Promise<SupportTicketMutationResponse>;
  submitCsat(ticketId: string, input: SubmitSupportCsatRequest): Promise<unknown>;
  createConversation(
    input: CreateSupportConversationRequest,
  ): Promise<SupportConversationResponse>;
  listConversations(): Promise<SupportConversationListResponse>;
  getConversation(conversationId: string): Promise<SupportConversationDetailResponse>;
  sendConversationMessage(
    conversationId: string,
    input: SendSupportMessageRequest,
  ): Promise<SupportMessageResponse>;
};

type SupportView = "tickets" | "conversation";
type SupportTone = "primary" | "success" | "warning" | "danger" | "muted";

const requestKey = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const ticketTypeLabels: Record<SupportTicketType, string> = {
  order_question: "订单咨询",
  order_dispute: "订单争议",
  service_complaint: "服务投诉",
  withdrawal_issue: "提现问题",
  account_issue: "账号问题",
  safety: "安全问题",
  other: "其他问题",
};

const priorityLabels: Record<SupportTicketPriority, string> = {
  low: "一般",
  normal: "普通",
  high: "加急",
  urgent: "紧急",
  critical: "重大",
};

const ticketStatusLabels: Record<SupportTicketStatus, string> = {
  open: "待受理",
  processing: "处理中",
  waiting_requester: "等待你补充",
  escalated: "已升级",
  resolved: "已解决",
  closed: "已关闭",
};

const conversationStatusLabels: Record<SupportConversationStatus, string> = {
  queueing: "排队中",
  active: "服务中",
  transferred: "已转接",
  closed: "已结束",
};

const eventLabels: Record<SupportTicketEventType, string> = {
  created: "问题已提交",
  commented: "有新消息",
  assigned: "客服已接入",
  claimed: "客服已受理",
  status_changed: "状态已更新",
  escalated: "问题已升级",
  resolved: "问题已解决",
  reopened: "工单已重开",
  closed: "工单已关闭",
  sla_breached: "处理时效提醒",
};

const senderLabels: Record<SupportMessageSenderType, string> = {
  customer: "我",
  worker: "服务师傅",
  agent: "喜乐帮客服",
  system: "系统",
};

function ticketStatusTone(status: SupportTicketStatus): SupportTone {
  if (status === "resolved") return "success";
  if (status === "escalated") return "danger";
  if (status === "processing") return "primary";
  if (status === "closed") return "muted";
  return "warning";
}

function conversationStatusTone(status: SupportConversationStatus): SupportTone {
  if (status === "active") return "success";
  if (status === "queueing" || status === "transferred") return "warning";
  return "muted";
}

function formatSupportTime(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

function readableSupportError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/409|conflict|duplicate/i.test(error.message)) {
    return "信息已发生变化，请刷新后查看服务端最新结果。";
  }
  if (/401|403|permission|forbidden/i.test(error.message)) {
    return "当前身份无法完成此操作，请重新登录或联系平台客服。";
  }
  if (/network|offline|timeout|failed to fetch/i.test(error.message)) {
    return "网络暂时不可用，页面内容已保留，请稍后重试。";
  }
  return fallback;
}

export function CustomerSupportPage({ api }: { api: CustomerSupportApi }) {
  const intake =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const [ui, dispatch] = useReducer(supportUiReducer, initialSupportUiState);
  const [activeView, setActiveView] = useState<SupportView>("tickets");
  const [tickets, setTickets] = useState<SupportTicketListResponse["tickets"]>([]);
  const [detail, setDetail] = useState<SupportTicketDetailResponse["detail"] | null>(null);
  const [type, setType] = useState<SupportTicketType>(
    intake.get("complaintId") ? "service_complaint" : "order_question",
  );
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [relatedOrderId, setRelatedOrderId] = useState(intake.get("orderId") ?? "");
  const [linkedComplaintId, setLinkedComplaintId] = useState(intake.get("complaintId") ?? "");
  const [comment, setComment] = useState("");
  const [conversations, setConversations] = useState<
    SupportConversationListResponse["conversations"]
  >([]);
  const [conversation, setConversation] =
    useState<SupportConversationDetailResponse | null>(null);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [chatText, setChatText] = useState("");
  const [csatScore, setCsatScore] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [ratedTicketId, setRatedTicketId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    dispatch({ type: "started", operation: "ticket:list" });
    try {
      const result = await api.listTickets();
      setTickets(result.tickets);
      dispatch({ type: "succeeded" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "暂时无法加载服务工单，请稍后重试。"),
      });
    }
  }, [api]);

  const openTicket = useCallback(
    async (ticketId: string) => {
      dispatch({ type: "started", operation: `ticket:detail:${ticketId}` });
      try {
        const result = await api.getTicket(ticketId);
        setDetail(result.detail);
        setRatedTicketId(null);
        dispatch({ type: "succeeded" });
      } catch (error) {
        dispatch({
          type: "failed",
          message: readableSupportError(error, "暂时无法查看工单详情，请稍后重试。"),
        });
      }
    },
    [api],
  );

  const loadConversations = useCallback(async () => {
    dispatch({ type: "started", operation: "conversation:list" });
    try {
      const result = await api.listConversations();
      setConversations(result.conversations);
      setConversationsLoaded(true);
      dispatch({ type: "succeeded" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "暂时无法加载在线会话，请稍后重试。"),
      });
    }
  }, [api]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function submitTicket() {
    if (subject.trim().length < 3 || description.trim().length < 5) return;
    dispatch({ type: "started", operation: "ticket:create" });
    try {
      const result = await api.createTicket({
        type,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        relatedOrderId: relatedOrderId.trim() || undefined,
        linkedAftersaleComplaintId: linkedComplaintId.trim() || undefined,
        idempotencyKey: requestKey("customer-ticket"),
      });
      const [list, nextDetail] = await Promise.all([
        api.listTickets(),
        api.getTicket(result.ticket.ticketId),
      ]);
      setTickets(list.tickets);
      setDetail(nextDetail.detail);
      setSubject("");
      setDescription("");
      setRelatedOrderId("");
      setLinkedComplaintId("");
      dispatch({ type: "succeeded", message: "问题已提交，客服处理进度会持续留痕。" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "问题提交失败，已保留填写内容，请稍后重试。"),
      });
    }
  }

  async function addComment() {
    if (!detail || !comment.trim()) return;
    dispatch({ type: "started", operation: "ticket:comment" });
    try {
      await api.addComment(detail.ticket.ticketId, {
        content: comment.trim(),
        idempotencyKey: requestKey("customer-comment"),
      });
      const result = await api.getTicket(detail.ticket.ticketId);
      setDetail(result.detail);
      setComment("");
      dispatch({ type: "succeeded", message: "补充信息已发送并记录在工单中。" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "补充信息发送失败，请稍后重试。"),
      });
    }
  }

  async function reopen() {
    if (!detail) return;
    dispatch({ type: "started", operation: "ticket:reopen" });
    try {
      await api.reopenTicket(detail.ticket.ticketId, {
        reason: "Requester needs more help",
        idempotencyKey: requestKey("customer-reopen"),
      });
      const [list, result] = await Promise.all([
        api.listTickets(),
        api.getTicket(detail.ticket.ticketId),
      ]);
      setTickets(list.tickets);
      setDetail(result.detail);
      dispatch({ type: "succeeded", message: "工单已重新打开，客服会继续处理。" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "暂时无法重新打开工单，请刷新状态后重试。"),
      });
    }
  }

  async function submitCsat() {
    if (!detail || detail.ticket.status !== "closed") return;
    dispatch({ type: "started", operation: "ticket:csat" });
    try {
      await api.submitCsat(detail.ticket.ticketId, {
        score: csatScore,
        idempotencyKey: requestKey("customer-csat"),
      });
      setRatedTicketId(detail.ticket.ticketId);
      dispatch({ type: "succeeded", message: "感谢评价，结果已记录到本工单。" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "评价提交失败，请稍后重试。"),
      });
    }
  }

  async function startConversation() {
    dispatch({ type: "started", operation: "conversation:create" });
    try {
      const created = await api.createConversation({
        ...(detail ? { linkedTicketId: detail.ticket.ticketId } : {}),
        idempotencyKey: requestKey("customer-conversation"),
      });
      const [nextConversation, list] = await Promise.all([
        api.getConversation(created.conversation.conversationId),
        api.listConversations(),
      ]);
      setConversation(nextConversation);
      setConversations(list.conversations);
      setConversationsLoaded(true);
      dispatch({ type: "succeeded", message: "在线会话已建立，请描述需要协助的问题。" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "暂时无法建立在线会话，请稍后重试。"),
      });
    }
  }

  async function openConversation(id: string) {
    dispatch({ type: "started", operation: `conversation:detail:${id}` });
    try {
      setConversation(await api.getConversation(id));
      dispatch({ type: "succeeded" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "暂时无法打开会话，请稍后重试。"),
      });
    }
  }

  async function sendChat() {
    if (!conversation || !chatText.trim()) return;
    const key = requestKey("customer-chat");
    dispatch({ type: "started", operation: "conversation:send" });
    try {
      // REST fallback remains the authoritative compatibility path when realtime is unavailable.
      await api.sendConversationMessage(conversation.conversation.conversationId, {
        clientMessageId: key,
        messageType: "text",
        textContent: chatText.trim(),
        idempotencyKey: key,
      });
      setConversation(
        await api.getConversation(conversation.conversation.conversationId),
      );
      setChatText("");
      dispatch({ type: "succeeded", message: "消息已由服务端确认送达。" });
    } catch (error) {
      dispatch({
        type: "failed",
        message: readableSupportError(error, "消息发送失败，输入内容已保留，请重试。"),
      });
    }
  }

  function selectView(next: string) {
    const view = next as SupportView;
    setActiveView(view);
    if (view === "conversation" && !conversationsLoaded) {
      void loadConversations();
    }
  }

  const busy = ui.busy !== null;
  const ticketFormValid = subject.trim().length >= 3 && description.trim().length >= 5;

  return (
    <CustomerRouteShell currentRoute="support">
      <main aria-busy={busy} className="customer-support">
        <section aria-labelledby="customer-support-title" className="customer-support__hero">
          <div className="customer-support__hero-heading">
            <span className="customer-support__eyebrow">
              <Headset aria-hidden="true" weight="duotone" />
              客服中心
            </span>
            <h1 id="customer-support-title">有问题，我们一起解决</h1>
            <p>服务工单全程留痕；需要即时沟通时，可进入在线会话继续咨询。</p>
          </div>
          <div className="customer-support__assurances" aria-label="客服保障">
            <span><ShieldCheck aria-hidden="true" weight="duotone" />身份与城市范围受保护</span>
            <span><Clock aria-hidden="true" weight="duotone" />处理状态持续可查</span>
          </div>
        </section>

        <SegmentedControl
          aria-label="客服服务类型"
          activeKey={activeView}
          className="customer-support__view-switch"
          items={[
            { key: "tickets", label: "服务工单" },
            { key: "conversation", label: "在线会话" },
          ]}
          onChange={selectView}
          productRole="customer"
        />

        {ui.error ? (
          <ErrorState
            action={(
              <Button
                onClick={() => void (activeView === "tickets" ? loadList() : loadConversations())}
                productRole="customer"
              >
                重新加载
              </Button>
            )}
            description={ui.error}
            productRole="customer"
            title="客服服务暂时不可用"
          />
        ) : null}

        {ui.notice ? (
          <div className="customer-support__notice" role="status">
            <CheckCircle aria-hidden="true" weight="fill" />
            <span>{ui.notice}</span>
          </div>
        ) : null}

        {activeView === "tickets" ? (
          <div aria-label="服务工单" className="customer-support__panel" role="tabpanel">
            <section aria-labelledby="customer-support-create-title" className="customer-support__surface">
              <header className="customer-support__section-heading">
                <div>
                  <span className="customer-support__section-icon">
                    <Plus aria-hidden="true" weight="bold" />
                  </span>
                  <div>
                    <h2 id="customer-support-create-title">提交服务问题</h2>
                    <p>描述清楚问题，客服会根据真实工单状态持续处理。</p>
                  </div>
                </div>
                <StatusTag tone="success">服务留痕</StatusTag>
              </header>

              <div className="customer-support__form-grid">
                <FormField label="问题类型">
                  <Select
                    aria-label="问题类型"
                    onChange={(event) => setType(event.target.value as SupportTicketType)}
                    productRole="customer"
                    value={type}
                  >
                    {Object.entries(ticketTypeLabels)
                      .filter(([key]) => key !== "withdrawal_issue")
                      .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </Select>
                </FormField>
                <FormField label="处理优先级">
                  <Select
                    aria-label="处理优先级"
                    onChange={(event) => setPriority(event.target.value as SupportTicketPriority)}
                    productRole="customer"
                    value={priority}
                  >
                    {(["normal", "high", "urgent", "critical"] as const).map((value) => (
                      <option key={value} value={value}>{priorityLabels[value]}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  description="请用一句话概括需要协助的问题。"
                  error={subject.length > 0 && subject.trim().length < 3 ? "标题至少填写 3 个字符。" : undefined}
                  label="问题标题"
                >
                  <Input
                    aria-label="问题标题"
                    autoComplete="off"
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="例如：订单状态一直没有更新"
                    productRole="customer"
                    value={subject}
                  />
                </FormField>
                <FormField
                  description="说明发生了什么、当前看到的状态，以及希望得到的帮助。"
                  error={description.length > 0 && description.trim().length < 5 ? "问题描述至少填写 5 个字符。" : undefined}
                  label="问题描述"
                >
                  <Textarea
                    aria-label="问题描述"
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="请尽量完整描述问题，已填写内容会在提交失败时保留。"
                    productRole="customer"
                    value={description}
                  />
                </FormField>
                <div className="customer-support__optional-grid">
                  <FormField description="从订单页进入时会自动带入。" label="关联订单（选填）">
                    <Input
                      aria-label="关联订单（选填）"
                      onChange={(event) => setRelatedOrderId(event.target.value)}
                      placeholder="订单编号"
                      productRole="customer"
                      value={relatedOrderId}
                    />
                  </FormField>
                  <FormField description="从售后流程进入时会自动带入。" label="关联售后投诉（选填）">
                    <Input
                      aria-label="关联售后投诉（选填）"
                      onChange={(event) => setLinkedComplaintId(event.target.value)}
                      placeholder="投诉编号"
                      productRole="customer"
                      value={linkedComplaintId}
                    />
                  </FormField>
                </div>
                <div className="customer-support__primary-action">
                  <Button
                    disabled={busy || !ticketFormValid}
                    onClick={() => void submitTicket()}
                    productRole="customer"
                    variant="primary"
                  >
                    {ui.busy === "ticket:create" ? "正在提交…" : "提交问题"}
                  </Button>
                  <p>{ticketFormValid ? "提交后将生成可追踪工单。" : "填写问题标题和描述后即可提交。"}</p>
                </div>
              </div>
            </section>

            <section aria-labelledby="customer-support-list-title" className="customer-support__surface">
              <header className="customer-support__section-heading">
                <div>
                  <span className="customer-support__section-icon">
                    <Ticket aria-hidden="true" weight="duotone" />
                  </span>
                  <div>
                    <h2 id="customer-support-list-title">我的服务工单</h2>
                    <p>查看处理状态、客服回复和下一步动作。</p>
                  </div>
                </div>
                <Button
                  aria-label="刷新服务工单"
                  disabled={busy}
                  onClick={() => void loadList()}
                  productRole="customer"
                >
                  <ArrowClockwise aria-hidden="true" />
                  刷新
                </Button>
              </header>

              {ui.busy === "ticket:list" && tickets.length === 0 ? (
                <LoadingState
                  description="正在同步服务端最新处理状态。"
                  productRole="customer"
                  title="正在加载工单"
                />
              ) : tickets.length === 0 ? (
                <EmptyState
                  description="提交问题后，可在这里持续查看客服处理进度。"
                  productRole="customer"
                  title="暂无服务工单"
                />
              ) : (
                <ul className="customer-support__ticket-list">
                  {tickets.map((ticketItem) => (
                    <li key={ticketItem.ticketId}>
                      <button
                        aria-label={`查看工单：${ticketItem.subject}`}
                        className={detail?.ticket.ticketId === ticketItem.ticketId ? "is-selected" : undefined}
                        disabled={busy}
                        onClick={() => void openTicket(ticketItem.ticketId)}
                        type="button"
                      >
                        <span className="customer-support__ticket-copy">
                          <span className="customer-support__ticket-meta">
                            <StatusTag tone={ticketStatusTone(ticketItem.status)}>
                              {ticketStatusLabels[ticketItem.status]}
                            </StatusTag>
                            <span>{ticketTypeLabels[ticketItem.type]}</span>
                            <span>{priorityLabels[ticketItem.priority]}</span>
                          </span>
                          <strong>{ticketItem.subject}</strong>
                          <span>{ticketItem.description}</span>
                          <small>更新于 {formatSupportTime(ticketItem.updatedAt)}</small>
                        </span>
                        <CaretRight aria-hidden="true" weight="bold" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail ? (
              <section aria-labelledby="customer-support-detail-title" className="customer-support__surface customer-support__detail">
                <header className="customer-support__section-heading">
                  <div>
                    <span className="customer-support__section-icon">
                      <Lifebuoy aria-hidden="true" weight="duotone" />
                    </span>
                    <div>
                      <h2 id="customer-support-detail-title">{detail.ticket.subject}</h2>
                      <p>工单编号 {detail.ticket.ticketId}</p>
                    </div>
                  </div>
                  <StatusTag tone={ticketStatusTone(detail.ticket.status)}>
                    {ticketStatusLabels[detail.ticket.status]}
                  </StatusTag>
                </header>

                <div className="customer-support__detail-summary">
                  <p>{detail.ticket.description}</p>
                  <dl>
                    <div><dt>问题类型</dt><dd>{ticketTypeLabels[detail.ticket.type]}</dd></div>
                    <div><dt>优先级</dt><dd>{priorityLabels[detail.ticket.priority]}</dd></div>
                    <div><dt>最近更新</dt><dd>{formatSupportTime(detail.ticket.updatedAt)}</dd></div>
                    {detail.ticket.linkedAftersaleComplaintId ? (
                      <div><dt>关联售后</dt><dd>{detail.ticket.linkedAftersaleComplaintId}</dd></div>
                    ) : null}
                  </dl>
                </div>

                <div className="customer-support__timeline-block">
                  <h3>处理记录</h3>
                  {detail.events.length === 0 ? (
                    <EmptyState
                      description="后续处理动作会按服务端记录显示在这里。"
                      productRole="customer"
                      title="暂无处理记录"
                    />
                  ) : (
                    <ol className="customer-support__timeline">
                      {detail.events.map((event) => (
                        <li key={event.ticketEventId}>
                          <span className="customer-support__timeline-dot" aria-hidden="true" />
                          <div>
                            <header>
                              <strong>{eventLabels[event.eventType]}</strong>
                              <time dateTime={event.createdAt}>{formatSupportTime(event.createdAt)}</time>
                            </header>
                            <p>{event.content || "工单状态已更新。"}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="customer-support__message-dock">
                  <FormField label="补充说明">
                    <Textarea
                      aria-label="补充说明"
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="补充新的情况或回复客服的问题"
                      productRole="customer"
                      value={comment}
                    />
                  </FormField>
                  <div className="customer-support__message-actions">
                    <Button
                      disabled={busy || !comment.trim()}
                      onClick={() => void addComment()}
                      productRole="customer"
                      variant="primary"
                    >
                      <PaperPlaneRight aria-hidden="true" weight="fill" />
                      {ui.busy === "ticket:comment" ? "正在发送…" : "发送补充"}
                    </Button>
                    {detail.ticket.status === "resolved" ? (
                      <Button disabled={busy} onClick={() => void reopen()} productRole="customer">
                        仍需帮助，重新打开
                      </Button>
                    ) : null}
                  </div>
                </div>

                {detail.ticket.status === "closed" ? (
                  <div className="customer-support__csat">
                    <div>
                      <Star aria-hidden="true" weight="duotone" />
                      <div>
                        <h3>本次客服体验如何？</h3>
                        <p>评价只会在服务端确认后记录。</p>
                      </div>
                    </div>
                    {ratedTicketId === detail.ticket.ticketId ? (
                      <p className="customer-support__csat-result"><CheckCircle aria-hidden="true" weight="fill" />评价已提交</p>
                    ) : (
                      <>
                        <div aria-label="客服评分" className="customer-support__score-picker" role="radiogroup">
                          {([1, 2, 3, 4, 5] as const).map((score) => (
                            <button
                              aria-checked={csatScore === score}
                              aria-label={`${score} 分`}
                              key={score}
                              onClick={() => setCsatScore(score)}
                              role="radio"
                              type="button"
                            >
                              <Star aria-hidden="true" weight={csatScore >= score ? "fill" : "regular"} />
                            </button>
                          ))}
                        </div>
                        {/* Legacy Phase24F marker: Rate support 5/5. */}
                        <Button
                          disabled={busy}
                          onClick={() => void submitCsat()}
                          productRole="customer"
                          variant="primary"
                        >
                          {ui.busy === "ticket:csat" ? "正在提交…" : "提交评价"}
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : (
          <div aria-label="在线会话" className="customer-support__panel" role="tabpanel">
            <section aria-labelledby="customer-support-conversation-title" className="customer-support__surface">
              <header className="customer-support__section-heading">
                <div>
                  <span className="customer-support__section-icon">
                    <ChatCircleDots aria-hidden="true" weight="duotone" />
                  </span>
                  <div>
                    <h2 id="customer-support-conversation-title">在线会话</h2>
                    <p>消息结果以服务端记录为准；网络中断时可安全重试。</p>
                  </div>
                </div>
                <div className="customer-support__header-actions">
                  <Button
                    aria-label="刷新在线会话"
                    disabled={busy}
                    onClick={() => void loadConversations()}
                    productRole="customer"
                  >
                    <ArrowClockwise aria-hidden="true" />
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void startConversation()}
                    productRole="customer"
                    variant="primary"
                  >
                    <Plus aria-hidden="true" weight="bold" />
                    新建会话
                  </Button>
                </div>
              </header>

              {ui.busy === "conversation:list" && !conversationsLoaded ? (
                <LoadingState
                  description="正在读取已有会话和最新状态。"
                  productRole="customer"
                  title="正在加载会话"
                />
              ) : conversations.length === 0 ? (
                <EmptyState
                  action={(
                    <Button
                      disabled={busy}
                      onClick={() => void startConversation()}
                      productRole="customer"
                      variant="primary"
                    >
                      发起在线咨询
                    </Button>
                  )}
                  description="如果已有工单，先打开工单再发起会话可自动关联。"
                  productRole="customer"
                  title="暂无在线会话"
                />
              ) : (
                <ul className="customer-support__conversation-list">
                  {conversations.map((item) => (
                    <li key={item.conversationId}>
                      <button
                        aria-label={`打开会话 ${item.conversationId}`}
                        className={conversation?.conversation.conversationId === item.conversationId ? "is-selected" : undefined}
                        disabled={busy}
                        onClick={() => void openConversation(item.conversationId)}
                        type="button"
                      >
                        <span>
                          <StatusTag tone={conversationStatusTone(item.status)}>
                            {conversationStatusLabels[item.status]}
                          </StatusTag>
                          <strong>客服会话</strong>
                          <small>更新于 {formatSupportTime(item.updatedAt)}</small>
                        </span>
                        <CaretRight aria-hidden="true" weight="bold" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {conversation ? (
              <section aria-labelledby="customer-support-chat-title" className="customer-support__surface customer-support__chat">
                <header className="customer-support__section-heading">
                  <div>
                    <span className="customer-support__section-icon">
                      <Headset aria-hidden="true" weight="duotone" />
                    </span>
                    <div>
                      <h2 id="customer-support-chat-title">客服会话</h2>
                      <p>会话编号 {conversation.conversation.conversationId}</p>
                    </div>
                  </div>
                  <StatusTag tone={conversationStatusTone(conversation.conversation.status)}>
                    {conversationStatusLabels[conversation.conversation.status]}
                  </StatusTag>
                </header>

                <div aria-live="polite" className="customer-support__messages">
                  {conversation.messages.length === 0 ? (
                    <EmptyState
                      description="发送第一条消息后，服务端确认的内容会显示在这里。"
                      productRole="customer"
                      title="会话已经建立"
                    />
                  ) : conversation.messages.map((message) => (
                    <article
                      className={message.senderType === "customer" ? "is-mine" : undefined}
                      key={message.messageId}
                    >
                      <span>{senderLabels[message.senderType]}</span>
                      <p>{message.textContent || "[图片消息]"}</p>
                      <time dateTime={message.createdAt}>{formatSupportTime(message.createdAt)}</time>
                    </article>
                  ))}
                </div>

                <div className="customer-support__chat-composer">
                  <FormField label="输入消息">
                    <Textarea
                      aria-label="输入消息"
                      disabled={conversation.conversation.status === "closed"}
                      onChange={(event) => setChatText(event.target.value)}
                      placeholder={conversation.conversation.status === "closed" ? "会话已结束，无法继续发送" : "请输入需要客服协助的内容"}
                      productRole="customer"
                      value={chatText}
                    />
                  </FormField>
                  <Button
                    disabled={busy || !chatText.trim() || conversation.conversation.status === "closed"}
                    onClick={() => void sendChat()}
                    productRole="customer"
                    variant="primary"
                  >
                    <PaperPlaneRight aria-hidden="true" weight="fill" />
                    {ui.busy === "conversation:send" ? "正在发送…" : "发送消息"}
                  </Button>
                  {conversation.conversation.status === "closed" ? (
                    <p className="customer-support__closed-note"><WarningCircle aria-hidden="true" />当前会话已结束，可新建会话继续咨询。</p>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </main>
    </CustomerRouteShell>
  );
}
