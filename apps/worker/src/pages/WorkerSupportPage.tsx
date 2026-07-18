import { useCallback, useEffect, useState } from "react";
import type {
  AddSupportTicketCommentRequest, CreateSupportConversationRequest, CreateSupportTicketRequest, ReopenSupportTicketRequest,
  SendSupportMessageRequest, SupportConversationDetailResponse, SupportConversationListResponse, SupportConversationResponse,
  SupportMessageResponse, SupportTicketDetailResponse, SupportTicketListFilters, SupportTicketListResponse,
  SupportTicketMutationResponse, SupportTicketPriority, SupportTicketResponse, SupportTicketType,
} from "@xlb/types";
import { Button, Card, EmptyState, FormField, Input, LoadingState, Select, StatusTag, Table, Textarea } from "@xlb/ui";
import { formatWorkerApiError } from "../app/workerFeedback";
import { formatDateTime, helperText, mutedBoxStyle, statusTone, workerPanelStyle } from "./pageShared";

export type WorkerSupportApi = {
  createTicket(input: CreateSupportTicketRequest): Promise<SupportTicketResponse>;
  listTickets(filters?: SupportTicketListFilters): Promise<SupportTicketListResponse>;
  getTicket(ticketId: string): Promise<SupportTicketDetailResponse>;
  addComment(ticketId: string, input: AddSupportTicketCommentRequest): Promise<SupportTicketMutationResponse>;
  reopenTicket(ticketId: string, input: ReopenSupportTicketRequest): Promise<SupportTicketMutationResponse>;
  submitCsat(ticketId: string, input: { score: 5; idempotencyKey: string }): Promise<unknown>;
  createConversation(input: CreateSupportConversationRequest): Promise<SupportConversationResponse>;
  listConversations(): Promise<SupportConversationListResponse>;
  getConversation(conversationId: string): Promise<SupportConversationDetailResponse>;
  sendConversationMessage(conversationId: string, input: SendSupportMessageRequest): Promise<SupportMessageResponse>;
};

const requestKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ticketStatus: Record<string, string> = { open: "待受理", processing: "处理中", waiting_requester: "等待我回复", resolved: "已解决", closed: "已关闭" };
const eventLabels: Record<string, string> = { created: "工单已创建", commented: "新增留言", assigned: "客服已受理", escalated: "已升级处理", resolved: "已解决", reopened: "已重新打开", closed: "已关闭" };

export function WorkerSupportPage({ api, networkOnline = true }: { api: WorkerSupportApi; networkOnline?: boolean }) {
  const [tickets, setTickets] = useState<SupportTicketListResponse["tickets"]>([]);
  const [detail, setDetail] = useState<SupportTicketDetailResponse["detail"] | null>(null);
  const [type, setType] = useState<SupportTicketType>("withdrawal_issue");
  const [priority, setPriority] = useState<SupportTicketPriority>("normal");
  const [subject, setSubject] = useState(""); const [description, setDescription] = useState(""); const [orderId, setOrderId] = useState(""); const [comment, setComment] = useState("");
  const [conversations, setConversations] = useState<SupportConversationListResponse["conversations"]>([]);
  const [conversation, setConversation] = useState<SupportConversationDetailResponse | null>(null);
  const [chatText, setChatText] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);

  const fail = (cause: unknown, fallback: string, mutation = false) => setError(formatWorkerApiError(cause, fallback, mutation ? "mutation" : "read"));
  const load = useCallback(async () => { setBusy("list"); setError(null); try { setTickets((await api.listTickets()).tickets); } catch (cause) { fail(cause, "客服工单加载失败，请稍后重试。"); } finally { setBusy(null); } }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function open(id: string) { setBusy(`detail:${id}`); setError(null); try { setDetail((await api.getTicket(id)).detail); } catch (cause) { fail(cause, "工单详情加载失败，请稍后重试。"); } finally { setBusy(null); } }
  async function create() {
    if (!networkOnline || subject.trim().length < 3 || description.trim().length < 5) return;
    setBusy("create"); setError(null); setNotice(null);
    try {
      const created = await api.createTicket({ type, priority, subject: subject.trim(), description: description.trim(), relatedOrderId: orderId.trim() || undefined, idempotencyKey: requestKey("worker-ticket") });
      const [list, selected] = await Promise.all([api.listTickets(), api.getTicket(created.ticket.ticketId)]);
      setTickets(list.tickets); setDetail(selected.detail); setSubject(""); setDescription(""); setOrderId(""); setNotice("客服工单已创建，平台已返回真实工单编号。");
    } catch (cause) { fail(cause, "客服工单结果暂时未知，请刷新列表确认后再重试。", true); } finally { setBusy(null); }
  }
  async function send() {
    if (!detail || !comment.trim() || !networkOnline) return;
    setBusy("comment"); setError(null); setNotice(null);
    try { const result = await api.addComment(detail.ticket.ticketId, { content: comment.trim(), idempotencyKey: requestKey("worker-comment") }); setDetail((await api.getTicket(detail.ticket.ticketId)).detail); setComment(""); setNotice(result.idempotent ? "重复留言已安全处理，未重复写入。" : "留言已发送。"); }
    catch (cause) { fail(cause, "留言结果暂时未知，请刷新工单确认后再重试。", true); } finally { setBusy(null); }
  }
  async function reopen() {
    if (!detail || !networkOnline) return; setBusy("reopen"); setError(null); setNotice(null);
    try { const result = await api.reopenTicket(detail.ticket.ticketId, { reason: "师傅仍需平台协助", idempotencyKey: requestKey("worker-reopen") }); const [list, selected] = await Promise.all([api.listTickets(), api.getTicket(detail.ticket.ticketId)]); setTickets(list.tickets); setDetail(selected.detail); setNotice(result.idempotent ? "重复重开请求已安全处理。" : "工单已重新打开。"); }
    catch (cause) { fail(cause, "工单重开结果暂时未知，请刷新确认。", true); } finally { setBusy(null); }
  }
  async function loadConversations() { setBusy("conversations"); setError(null); try { setConversations((await api.listConversations()).conversations); } catch (cause) { fail(cause, "在线会话加载失败，请稍后重试。"); } finally { setBusy(null); } }
  async function startConversation() { if (!networkOnline) return; setBusy("start-conversation"); setError(null); try { const created = await api.createConversation({ idempotencyKey: requestKey("worker-conversation") }); setConversation(await api.getConversation(created.conversation.conversationId)); await loadConversations(); } catch (cause) { fail(cause, "在线会话创建结果暂时未知，请刷新会话确认。", true); } finally { setBusy(null); } }
  async function openConversation(id: string) { setBusy(`conversation:${id}`); try { setConversation(await api.getConversation(id)); } catch (cause) { fail(cause, "会话详情加载失败，请稍后重试。"); } finally { setBusy(null); } }
  async function sendChat() {
    if (!conversation || !chatText.trim() || !networkOnline) return; const key = requestKey("worker-chat"); setBusy("chat"); setError(null); setNotice(null);
    try { const result = await api.sendConversationMessage(conversation.conversation.conversationId, { clientMessageId: key, messageType: "text", textContent: chatText.trim(), idempotencyKey: key }); setConversation(await api.getConversation(conversation.conversation.conversationId)); setChatText(""); setNotice(result.idempotent ? "重复会话消息已安全处理。" : "会话消息已发送。"); }
    catch (cause) { fail(cause, "会话消息结果暂时未知，请刷新会话确认。", true); } finally { setBusy(null); }
  }

  return <>
    {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>客服写操作已关闭；恢复网络后先刷新工单和会话，避免重复提交。</span></div>}
    {error && <Card title="客服操作未完成" actions={<StatusTag tone="danger">请核对</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{error}</p></Card>}
    {notice && <Card title="客服状态已更新" actions={<StatusTag tone="success">已同步</StatusTag>} style={workerPanelStyle}><p style={helperText}>{notice}</p></Card>}
    <Card title="联系平台客服" actions={<StatusTag tone={networkOnline ? "success" : "danger"}>{networkOnline ? "已连接" : "已离线"}</StatusTag>} style={workerPanelStyle}>
      <div className="worker-stack-list">
        <FormField label="问题类型"><Select value={type} onChange={(e) => setType(e.target.value as SupportTicketType)}><option value="withdrawal_issue">提现问题</option><option value="order_dispute">任务或订单争议</option><option value="service_complaint">服务投诉</option><option value="account_issue">账户问题</option><option value="safety">安全问题</option><option value="other">其他问题</option></Select></FormField>
        <FormField label="紧急程度"><Select value={priority} onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}><option value="normal">一般</option><option value="high">较高</option><option value="urgent">紧急</option><option value="critical">严重安全事件</option></Select></FormField>
        <FormField label="问题标题"><Input maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} /></FormField>
        <FormField label="问题说明"><Textarea maxLength={2_000} value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
        <FormField label="关联订单（选填）"><Input value={orderId} onChange={(e) => setOrderId(e.target.value)} /></FormField>
        <Button variant="primary" disabled={!networkOnline || busy !== null || subject.trim().length < 3 || description.trim().length < 5} onClick={() => void create()}>{busy === "create" ? "正在提交" : "提交客服工单"}</Button>
        <p className="worker-contract-note">提交成功以平台返回工单编号为准；若网络中断或结果未知，请先刷新列表确认，避免重复提交。</p>
      </div>
    </Card>

    <Card title="在线客服会话" actions={<div className="worker-card-actions"><Button disabled={!networkOnline || busy !== null} onClick={() => void loadConversations()}>刷新会话</Button><Button disabled={!networkOnline || busy !== null} variant="primary" onClick={() => void startConversation()}>发起会话</Button></div>} style={workerPanelStyle}>
      {conversations.length === 0 ? <EmptyState title="暂无已加载会话" description="点击刷新读取历史会话，或发起新的客服会话。" /> : <div className="worker-card-actions">{conversations.map((item) => <Button key={item.conversationId} onClick={() => void openConversation(item.conversationId)}>{item.status === "closed" ? "已关闭" : "处理中"} · {formatDateTime(item.updatedAt)}</Button>)}</div>}
      {conversation && <div className="worker-stack-list">{conversation.messages.map((message) => <div key={message.messageId} style={mutedBoxStyle}><strong>{message.senderType === "worker" ? "我" : "客服"}</strong><span style={helperText}>{message.textContent || "图片消息"}</span></div>)}<Textarea aria-label="会话消息" value={chatText} onChange={(e) => setChatText(e.target.value)} /><Button variant="primary" disabled={!networkOnline || busy !== null || !chatText.trim() || conversation.conversation.status === "closed"} onClick={() => void sendChat()}>{busy === "chat" ? "正在发送" : "发送消息"}</Button></div>}
    </Card>

    <Card title="我的客服工单" actions={<Button disabled={!networkOnline || busy !== null} onClick={() => void load()}>刷新工单</Button>} style={workerPanelStyle}>
      {busy === "list" && tickets.length === 0 ? <LoadingState title="正在加载工单" /> : tickets.length === 0 ? <EmptyState title="暂无客服工单" /> : <Table rows={tickets} getRowKey={(row) => row.ticketId} columns={[{ key: "subject", title: "问题", render: (row) => row.subject }, { key: "status", title: "状态", render: (row) => ticketStatus[row.status] ?? "未知状态" }, { key: "open", title: "", render: (row) => <Button disabled={busy !== null} onClick={() => void open(row.ticketId)}>查看</Button> }]} />}
    </Card>

    {detail && <Card title={`工单 · ${detail.ticket.subject}`} actions={<StatusTag tone={statusTone(detail.ticket.status)}>{ticketStatus[detail.ticket.status] ?? "未知状态"}</StatusTag>} style={workerPanelStyle}><div className="worker-stack-list"><p style={helperText}>{detail.ticket.description}</p>{detail.ticket.linkedAftersaleComplaintId && <div style={mutedBoxStyle}><strong>关联售后投诉：{detail.ticket.linkedAftersaleComplaintId}</strong><span style={helperText}>此处仅供查看；售后操作仍需在售后返工流程中完成。</span></div>}{detail.events.map((event) => <div key={event.ticketEventId} style={mutedBoxStyle}><strong>{eventLabels[event.eventType] ?? "工单状态更新"}</strong><span style={helperText}>{event.content || "状态已更新"} · {formatDateTime(event.createdAt)}</span></div>)}<FormField label="补充留言"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></FormField><div className="worker-card-actions"><Button variant="primary" disabled={!networkOnline || busy !== null || !comment.trim()} onClick={() => void send()}>{busy === "comment" ? "正在发送" : "发送留言"}</Button><Button disabled={!networkOnline || busy !== null || detail.ticket.status !== "resolved"} onClick={() => void reopen()}>重新打开</Button>{detail.ticket.status === "closed" && <Button disabled={!networkOnline || busy !== null} onClick={() => void api.submitCsat(detail.ticket.ticketId, { score: 5, idempotencyKey: requestKey("worker-csat") })}>评价客服 5 分</Button>}</div></div></Card>}
  </>;
}
