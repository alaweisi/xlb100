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
  initialWorkerSupportUiState,
  workerSupportUiReducer,
} from "../features/support/reducer";
import { helperText, mutedBoxStyle, workerPanelStyle } from "./pageShared";

export type WorkerSupportApi = {
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

export function WorkerSupportPage({ api }: { api: WorkerSupportApi }) {
  const [ui, dispatch] = useReducer(
    workerSupportUiReducer,
    initialWorkerSupportUiState,
  );
  const [tickets, setTickets] = useState<SupportTicketListResponse["tickets"]>(
    [],
  );
  const [detail, setDetail] = useState<
    SupportTicketDetailResponse["detail"] | null
  >(null);
  const [type, setType] = useState<SupportTicketType>("withdrawal_issue");
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [comment, setComment] = useState("");
  const [conversations, setConversations] = useState<
    SupportConversationListResponse["conversations"]
  >([]);
  const [conversation, setConversation] =
    useState<SupportConversationDetailResponse | null>(null);
  const [chatText, setChatText] = useState("");
  const load = useCallback(async () => {
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
            : "Unable to load worker tickets",
      });
    }
  }, [api]);
  const open = useCallback(
    async (id: string) => {
      dispatch({ type: "started", operation: `detail:${id}` });
      try {
        setDetail((await api.getTicket(id)).detail);
        dispatch({ type: "succeeded" });
      } catch (error) {
        dispatch({
          type: "failed",
          message:
            error instanceof Error ? error.message : "Unable to load ticket",
        });
      }
    },
    [api],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    if (subject.trim().length < 3 || description.trim().length < 5) return;
    dispatch({ type: "started", operation: "create" });
    try {
      const created = await api.createTicket({
        type,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        relatedOrderId: orderId.trim() || undefined,
        idempotencyKey: requestKey("worker-ticket"),
      });
      const [list, selected] = await Promise.all([
        api.listTickets(),
        api.getTicket(created.ticket.ticketId),
      ]);
      setTickets(list.tickets);
      setDetail(selected.detail);
      setSubject("");
      setDescription("");
      setOrderId("");
      dispatch({ type: "succeeded", message: "Support ticket created" });
    } catch (error) {
      dispatch({
        type: "failed",
        message:
          error instanceof Error ? error.message : "Unable to create ticket",
      });
    }
  }
  async function send() {
    if (!detail || !comment.trim()) return;
    dispatch({ type: "started", operation: "comment" });
    try {
      await api.addComment(detail.ticket.ticketId, {
        content: comment.trim(),
        idempotencyKey: requestKey("worker-comment"),
      });
      setDetail((await api.getTicket(detail.ticket.ticketId)).detail);
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
        reason: "Worker needs more help",
        idempotencyKey: requestKey("worker-reopen"),
      });
      const [list, selected] = await Promise.all([
        api.listTickets(),
        api.getTicket(detail.ticket.ticketId),
      ]);
      setTickets(list.tickets);
      setDetail(selected.detail);
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
        idempotencyKey: requestKey("worker-conversation"),
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
    const key = requestKey("worker-chat");
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
    <>
      <Card
        title="Worker Support"
        actions={<StatusTag tone="success">Real API</StatusTag>}
        style={workerPanelStyle}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="Issue type">
            <Select
              value={type}
              onChange={(event) =>
                setType(event.target.value as SupportTicketType)
              }
            >
              <option value="withdrawal_issue">Withdrawal issue</option>
              <option value="order_dispute">Task / order dispute</option>
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
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            />
          </FormField>
          <Button
            variant="primary"
            disabled={
              busy || subject.trim().length < 3 || description.trim().length < 5
            }
            onClick={() => void create()}
          >
            Submit issue
          </Button>
        </div>
      </Card>
      {ui.error && (
        <Card title="Support request failed" style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{ui.error}</p>
        </Card>
      )}
      {ui.notice && (
        <Card title="Updated" style={workerPanelStyle}>
          <p style={helperText}>{ui.notice}</p>
        </Card>
      )}
      <Card
        title="Live support conversations"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => void loadConversations()}>Refresh</Button>
            <Button variant="primary" onClick={() => void startConversation()}>
              Start
            </Button>
          </div>
        }
        style={workerPanelStyle}
      >
        {conversations.length === 0 ? (
          <EmptyState title="No conversations loaded" />
        ) : (
          conversations.map((item) => (
            <Button
              key={item.conversationId}
              onClick={() => void openConversation(item.conversationId)}
            >
              {item.status} · {item.updatedAt}
            </Button>
          ))
        )}
        {conversation && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {conversation.messages.map((message) => (
              <div key={message.messageId} style={mutedBoxStyle}>
                {message.senderType}: {message.textContent || "Image"}
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
          <Button disabled={busy} onClick={() => void load()}>
            Refresh
          </Button>
        }
        style={workerPanelStyle}
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
              { key: "status", title: "Status", render: (row) => row.status },
              {
                key: "open",
                title: "",
                render: (row) => (
                  <Button
                    disabled={busy}
                    onClick={() => void open(row.ticketId)}
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
          style={workerPanelStyle}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <p style={helperText}>{detail.ticket.description}</p>
            {detail.ticket.linkedAftersaleComplaintId && (
              <div style={mutedBoxStyle}>
                Linked aftersale complaint:{" "}
                <strong>{detail.ticket.linkedAftersaleComplaintId}</strong>
                <span style={helperText}>
                  View-only reference; aftersale actions remain in the aftersale
                  workflow.
                </span>
              </div>
            )}
            {detail.events.map((event) => (
              <div key={event.ticketEventId} style={mutedBoxStyle}>
                <strong>{event.eventType}</strong>
                <span style={helperText}>
                  {event.content || "Status updated"} · {event.createdAt}
                </span>
              </div>
            ))}
            <FormField label="Add message">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </FormField>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="primary"
                disabled={busy || !comment.trim()}
                onClick={() => void send()}
              >
                Send
              </Button>
              <Button
                disabled={busy || detail.ticket.status !== "resolved"}
                onClick={() => void reopen()}
              >
                Reopen
              </Button>
              {detail.ticket.status === "closed" && <Button disabled={busy} onClick={() => void api.submitCsat(detail.ticket.ticketId,{score:5,idempotencyKey:requestKey("worker-csat")})}>Rate support 5/5</Button>}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
