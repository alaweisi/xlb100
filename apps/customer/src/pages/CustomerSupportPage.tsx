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
            : "Unable to load support tickets",
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
              : "Unable to load ticket detail",
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
      dispatch({ type: "succeeded", message: "Support ticket created" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create support ticket",
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
      dispatch({ type: "succeeded", message: "Message sent" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error ? error.message : "Unable to send message",
      });
    }
  }
  async function reopen() {
    if (!detail) return;
    dispatch({ type: "started", operation: "reopen" });
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
      dispatch({ type: "succeeded", message: "Ticket reopened" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error ? error.message : "Unable to reopen ticket",
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
            : "Unable to load conversations",
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
            : "Unable to start conversation",
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
            : "Unable to open conversation",
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
            : "Realtime unavailable; REST message failed",
      });
    }
  }
  return (
    <CustomerRouteShell currentRoute="support">
      <Card
        title="Customer Support"
        actions={<StatusTag tone="success">Tracked ticket</StatusTag>}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="Issue type">
            <Select
              value={type}
              onChange={(event) =>
                setType(event.target.value as SupportTicketType)
              }
            >
              <option value="order_question">Order question</option>
              <option value="order_dispute">Order dispute</option>
              <option value="service_complaint">Service complaint</option>
              <option value="account_issue">Account issue</option>
              <option value="safety">Safety</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Priority">
            <Select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as SupportTicketPriority)
              }
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </Select>
          </FormField>
          <FormField label="Subject">
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </FormField>
          <FormField label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <FormField label="Related order (optional)">
            <Input
              value={relatedOrderId}
              onChange={(event) => setRelatedOrderId(event.target.value)}
            />
          </FormField>
          <FormField label="Linked aftersale complaint (optional)">
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
            Submit issue
          </Button>
        </div>
      </Card>
      {ui.error && (
        <ApiErrorPanel title="Support request failed" detail={ui.error} />
      )}
      {ui.notice && (
        <Card title="Updated">
          <p style={{ margin: 0 }}>{ui.notice}</p>
        </Card>
      )}
      <Card
        title="Live support conversations"
        actions={
          <>
            <Button onClick={() => void loadConversations()}>Refresh</Button>
            <Button variant="primary" onClick={() => void startConversation()}>
              Start conversation
            </Button>
          </>
        }
      >
        {conversations.length === 0 ? (
          <EmptyState title="No conversations loaded" />
        ) : (
          <Table
            rows={conversations}
            getRowKey={(row) => row.conversationId}
            columns={[
              { key: "status", title: "Status", render: (row) => row.status },
              {
                key: "updated",
                title: "Updated",
                render: (row) => row.updatedAt,
              },
              {
                key: "open",
                title: "",
                render: (row) => (
                  <Button
                    onClick={() => void openConversation(row.conversationId)}
                  >
                    Open
                  </Button>
                ),
              },
            ]}
          />
        )}
        {conversation && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <StatusTag tone="primary">
              {conversation.conversation.status}
            </StatusTag>
            {conversation.messages.map((message) => (
              <div key={message.messageId}>
                <strong>{message.senderType}</strong>:{" "}
                {message.textContent || "Image"}
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
              Send via REST fallback
            </Button>
          </div>
        )}
      </Card>
      <Card
        title="My tickets"
        actions={
          <Button disabled={busy} onClick={() => void loadList()}>
            Refresh
          </Button>
        }
      >
        {ui.busy === "list" && tickets.length === 0 ? (
          <LoadingState title="Loading tickets" />
        ) : tickets.length === 0 ? (
          <EmptyState title="No support tickets" />
        ) : (
          <Table
            rows={tickets}
            getRowKey={(row) => row.ticketId}
            columns={[
              {
                key: "subject",
                title: "Subject",
                render: (row) => row.subject,
              },
              {
                key: "status",
                title: "Status",
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
                    {row.status}
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
                    View
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      {detail && (
        <Card
          title={`Ticket · ${detail.ticket.subject}`}
          actions={<StatusTag tone="primary">{detail.ticket.status}</StatusTag>}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0 }}>{detail.ticket.description}</p>
            <small>
              Type: {detail.ticket.type} · Priority: {detail.ticket.priority} ·
              Updated: {detail.ticket.updatedAt}
            </small>
            {detail.ticket.linkedAftersaleComplaintId && (
              <p style={{ margin: 0 }}>
                Linked aftersale complaint:{" "}
                <strong>{detail.ticket.linkedAftersaleComplaintId}</strong>{" "}
                (view only)
              </p>
            )}
            {detail.events.length === 0 ? (
              <EmptyState title="No ticket events" />
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
                    {event.content || "Status updated"}
                  </p>
                  <small>
                    {event.actorType} · {event.createdAt}
                  </small>
                </div>
              ))
            )}
            <FormField label="Add message">
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
                Send message
              </Button>
              <Button
                disabled={busy || detail.ticket.status !== "resolved"}
                onClick={() => void reopen()}
              >
                Reopen
              </Button>
              {detail.ticket.status === "closed" && <Button disabled={busy} onClick={() => void api.submitCsat(detail.ticket.ticketId,{score:5,idempotencyKey:requestKey("customer-csat")})}>Rate support 5/5</Button>}
            </div>
          </div>
        </Card>
      )}
    </CustomerRouteShell>
  );
}
