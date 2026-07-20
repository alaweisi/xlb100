import { useCallback, useEffect, useReducer, useState } from "react";
import type {
  AddSupportTicketCommentRequest,
  CreateSupportConversationRequest,
  CreateSupportTicketRequest,
  ReopenSupportTicketRequest,
  SendSupportMessageRequest,
  SupportConversationDetailResponse,
  SupportConversationListResponse,
  SupportConversationResponse,
  SupportMessageResponse,
  SupportTicketDetailResponse,
  SupportTicketListFilters,
  SupportTicketListResponse,
  SupportTicketMutationResponse,
  SupportTicketPriority,
  SupportTicketResponse,
  SupportTicketType,
} from "@xlb/types";
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
import {
  initialSupportUiState,
  supportUiReducer,
} from "../features/support/reducer";
import { CustomerRouteShell } from "./customerPageShell";

export type CustomerSupportApi = {
  createTicket(
    input: CreateSupportTicketRequest,
  ): Promise<SupportTicketResponse>;
  listTickets(
    filters?: SupportTicketListFilters,
  ): Promise<SupportTicketListResponse>;
  getTicket(ticketId: string): Promise<SupportTicketDetailResponse>;
  addComment(
    ticketId: string,
    input: AddSupportTicketCommentRequest,
  ): Promise<SupportTicketMutationResponse>;
  reopenTicket(
    ticketId: string,
    input: ReopenSupportTicketRequest,
  ): Promise<SupportTicketMutationResponse>;
  submitCsat(ticketId:string,input:{score:5;idempotencyKey:string}):Promise<unknown>;
  createConversation(
    input: CreateSupportConversationRequest,
  ): Promise<SupportConversationResponse>;
  listConversations(): Promise<SupportConversationListResponse>;
  getConversation(
    conversationId: string,
  ): Promise<SupportConversationDetailResponse>;
  sendConversationMessage(
    conversationId: string,
    input: SendSupportMessageRequest,
  ): Promise<SupportMessageResponse>;
};
const requestKey = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const ticketStatusLabel: Record<string, string> = {
  open: "处理中",
  waiting_requester: "待你回复",
  escalated: "已升级处理",
  resolved: "已解决",
  closed: "已关闭",
};
const conversationStatusLabel: Record<string, string> = {
  queueing: "排队中",
  active: "沟通中",
  transferred: "已转接",
  closed: "已结束",
};
const ticketTypeLabel: Record<string, string> = {
  order_question: "订单咨询",
  order_dispute: "订单争议",
  service_complaint: "服务投诉",
  account_issue: "账号问题",
  safety: "安全问题",
  other: "其他问题",
};
const priorityLabel: Record<string, string> = {
  normal: "普通",
  high: "较急",
  urgent: "紧急",
  critical: "非常紧急",
};

export function CustomerSupportPage({ api }: { api: CustomerSupportApi }) {
  const intake =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const [ui, dispatch] = useReducer(supportUiReducer, initialSupportUiState);
  const [tickets, setTickets] = useState<SupportTicketListResponse["tickets"]>(
    [],
  );
  const [detail, setDetail] = useState<
    SupportTicketDetailResponse["detail"] | null
  >(null);
  const [type, setType] = useState<SupportTicketType>(
    intake.get("complaintId") ? "service_complaint" : "order_question",
  );
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [relatedOrderId, setRelatedOrderId] = useState(
    intake.get("orderId") ?? "",
  );
  const [linkedComplaintId, setLinkedComplaintId] = useState(
    intake.get("complaintId") ?? "",
  );
  const [comment, setComment] = useState("");
  const [conversations, setConversations] = useState<
    SupportConversationListResponse["conversations"]
  >([]);
  const [conversation, setConversation] =
    useState<SupportConversationDetailResponse | null>(null);
  const [chatText, setChatText] = useState("");
  const loadList = useCallback(async () => {
    dispatch({ type: "started", operation: "list" });
    try {
      const result = await api.listTickets();
      setTickets(result.tickets);
      dispatch({ type: "succeeded" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error
            ? error.message
            : "客服工单加载失败",
      });
    }
  }, [api]);
  const openTicket = useCallback(
    async (ticketId: string) => {
      dispatch({ type: "started", operation: `detail:${ticketId}` });
      try {
        const result = await api.getTicket(ticketId);
        setDetail(result.detail);
        dispatch({ type: "succeeded" });
      } catch (error) {
        dispatch({
          type: "failed",
          message:
            error instanceof Error
              ? error.message
              : "工单详情加载失败",
        });
      }
    },
    [api],
  );
  useEffect(() => {
    void loadList();
  }, [loadList]);
  async function submitTicket() {
    if (subject.trim().length < 3 || description.trim().length < 5) return;
    dispatch({ type: "started", operation: "create" });
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
      setSubject("");
      setDescription("");
      setRelatedOrderId("");
      setLinkedComplaintId("");
      const [list, nextDetail] = await Promise.all([
        api.listTickets(),
        api.getTicket(result.ticket.ticketId),
      ]);
      setTickets(list.tickets);
      setDetail(nextDetail.detail);
      dispatch({ type: "succeeded", message: "客服工单已提交" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error
            ? error.message
            : "客服工单提交失败",
      });
    }
  }
  async function addComment() {
    if (!detail || !comment.trim()) return;
    dispatch({ type: "started", operation: "comment" });
    try {
      await api.addComment(detail.ticket.ticketId, {
        content: comment.trim(),
        idempotencyKey: requestKey("customer-comment"),
      });
      const result = await api.getTicket(detail.ticket.ticketId);
      setDetail(result.detail);
      setComment("");
      dispatch({ type: "succeeded", message: "消息已发送" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error ? error.message : "消息发送失败",
      });
    }
  }
  async function reopen() {
    if (!detail) return;
    dispatch({ type: "started", operation: "reopen" });
    try {
      await api.reopenTicket(detail.ticket.ticketId, {
        reason: "客户仍需客服协助",
        idempotencyKey: requestKey("customer-reopen"),
      });
      const [list, result] = await Promise.all([
        api.listTickets(),
        api.getTicket(detail.ticket.ticketId),
      ]);
      setTickets(list.tickets);
      setDetail(result.detail);
      dispatch({ type: "succeeded", message: "工单已重新打开" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error ? error.message : "工单重新打开失败",
      });
    }
  }
  const busy = ui.busy !== null;
  async function loadConversations() {
    try {
      setConversations((await api.listConversations()).conversations);
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error
            ? error.message
            : "在线客服记录加载失败",
      });
    }
  }
  async function startConversation() {
    try {
      const created = await api.createConversation({
        idempotencyKey: requestKey("customer-conversation"),
      });
      setConversation(
        await api.getConversation(created.conversation.conversationId),
      );
      await loadConversations();
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error
            ? error.message
            : "在线客服连接失败",
      });
    }
  }
  async function openConversation(id: string) {
    try {
      setConversation(await api.getConversation(id));
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error
            ? error.message
            : "在线客服记录打开失败",
      });
    }
  }
  async function sendChat() {
    if (!conversation || !chatText.trim()) return;
    const key = requestKey("customer-chat");
    try {
      await api.sendConversationMessage(
        conversation.conversation.conversationId,
        {
          clientMessageId: key,
          messageType: "text",
          textContent: chatText.trim(),
          idempotencyKey: key,
        },
      );
      setConversation(
        await api.getConversation(conversation.conversation.conversationId),
      );
      setChatText("");
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error
            ? error.message
            : "在线消息发送失败，请稍后重试",
      });
    }
  }
  return (
    <CustomerRouteShell currentRoute="support">
      {ui.error && (
        <ApiErrorPanel title="客服请求失败" detail="暂时无法连接客服，请检查网络后重试。" />
      )}
      <Card
        title="联系喜乐帮客服"
        actions={<StatusTag tone="success">进度可查询</StatusTag>}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="问题类型">
            <Select
              value={type}
              onChange={(event) =>
                setType(event.target.value as SupportTicketType)
              }
            >
              <option value="order_question">订单咨询</option>
              <option value="order_dispute">订单争议</option>
              <option value="service_complaint">服务投诉</option>
              <option value="account_issue">账号问题</option>
              <option value="safety">安全问题</option>
              <option value="other">其他问题</option>
            </Select>
          </FormField>
          <FormField label="紧急程度">
            <Select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as SupportTicketPriority)
              }
            >
              <option value="normal">普通</option>
              <option value="high">较急</option>
              <option value="urgent">紧急</option>
              <option value="critical">非常紧急</option>
            </Select>
          </FormField>
          <FormField label="问题标题">
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </FormField>
          <FormField label="问题说明">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <FormField label="关联订单（选填）">
            <Input
              value={relatedOrderId}
              onChange={(event) => setRelatedOrderId(event.target.value)}
            />
          </FormField>
          <FormField label="关联售后单（选填）">
            <Input
              value={linkedComplaintId}
              onChange={(event) => setLinkedComplaintId(event.target.value)}
            />
          </FormField>
          <Button
            variant="primary"
            disabled={
              busy || subject.trim().length < 3 || description.trim().length < 5
            }
            onClick={() => void submitTicket()}
          >
            提交问题
          </Button>
        </div>
      </Card>
      {ui.notice && (
        <Card title="处理成功">
          <p style={{ margin: 0 }}>{ui.notice}</p>
        </Card>
      )}
      <Card
        title="在线客服"
        actions={
          <>
            <Button onClick={() => void loadConversations()}>刷新</Button>
            <Button variant="primary" onClick={() => void startConversation()}>
              发起会话
            </Button>
          </>
        }
      >
        {conversations.length === 0 ? (
          <EmptyState title="暂无在线会话" description="需要即时沟通时，可发起在线客服会话。" />
        ) : (
          <Table
            rows={conversations}
            getRowKey={(row) => row.conversationId}
            columns={[
              { key: "status", title: "状态", render: (row) => conversationStatusLabel[row.status] ?? row.status },
              {
                key: "updated",
                title: "更新时间",
                render: (row) => row.updatedAt,
              },
              {
                key: "open",
                title: "",
                render: (row) => (
                  <Button
                    onClick={() => void openConversation(row.conversationId)}
                  >
                    打开
                  </Button>
                ),
              },
            ]}
          />
        )}
        {conversation && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <StatusTag tone="primary">
              {conversationStatusLabel[conversation.conversation.status] ?? conversation.conversation.status}
            </StatusTag>
            {conversation.messages.map((message) => (
              <div key={message.messageId}>
                <strong>{message.senderType}</strong>:{" "}
                {message.textContent || "图片消息"}
              </div>
            ))}
            <Textarea
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
            />
            <Button
              variant="primary"
              disabled={
                !chatText.trim() ||
                conversation.conversation.status === "closed"
              }
              onClick={() => void sendChat()}
            >
              发送消息
            </Button>
          </div>
        )}
      </Card>
      <Card
        title="我的客服工单"
        actions={
          <Button disabled={busy} onClick={() => void loadList()}>
            刷新
          </Button>
        }
      >
        {ui.busy === "list" && tickets.length === 0 ? (
          <LoadingState title="正在加载客服工单" />
        ) : tickets.length === 0 ? (
          <EmptyState title="暂无客服工单" description="提交问题后，可在这里查看处理进度。" />
        ) : (
          <Table
            rows={tickets}
            getRowKey={(row) => row.ticketId}
            columns={[
              {
                key: "subject",
                title: "问题",
                render: (row) => row.subject,
              },
              {
                key: "status",
                title: "状态",
                render: (row) => (
                  <StatusTag
                    tone={
                      row.status === "resolved" || row.status === "closed"
                        ? "success"
                        : row.status === "escalated"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {ticketStatusLabel[row.status] ?? row.status}
                  </StatusTag>
                ),
              },
              {
                key: "open",
                title: "",
                render: (row) => (
                  <Button
                    disabled={busy}
                    onClick={() => void openTicket(row.ticketId)}
                  >
                    查看
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      {detail && (
        <Card
          title={`工单 · ${detail.ticket.subject}`}
          actions={<StatusTag tone="primary">{ticketStatusLabel[detail.ticket.status] ?? detail.ticket.status}</StatusTag>}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0 }}>{detail.ticket.description}</p>
            <small>
              类型：{ticketTypeLabel[detail.ticket.type] ?? detail.ticket.type} · 紧急程度：{priorityLabel[detail.ticket.priority] ?? detail.ticket.priority} ·
              更新于：{detail.ticket.updatedAt}
            </small>
            {detail.ticket.linkedAftersaleComplaintId && (
              <p style={{ margin: 0 }}>
                关联售后单：{" "}
                <strong>{detail.ticket.linkedAftersaleComplaintId}</strong>{" "}
                （仅查看）
              </p>
            )}
            {detail.events.length === 0 ? (
              <EmptyState title="暂无处理记录" />
            ) : (
              detail.events.map((event) => (
                <div
                  key={event.ticketEventId}
                  style={{
                    background: "#fff7ed",
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <strong>{event.eventType}</strong>
                  <p style={{ margin: "4px 0 0" }}>
                    {event.content || "状态已更新"}
                  </p>
                  <small>
                    {event.actorType} · {event.createdAt}
                  </small>
                </div>
              ))
            )}
            <FormField label="补充消息">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </FormField>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                disabled={busy || !comment.trim()}
                onClick={() => void addComment()}
              >
                发送消息
              </Button>
              <Button
                disabled={busy || detail.ticket.status !== "resolved"}
                onClick={() => void reopen()}
              >
                继续求助
              </Button>
              {detail.ticket.status === "closed" && <Button disabled={busy} onClick={() => void api.submitCsat(detail.ticket.ticketId,{score:5,idempotencyKey:requestKey("customer-csat")})}>客服评价 5/5</Button>}
            </div>
          </div>
        </Card>
      )}
    </CustomerRouteShell>
  );
}
