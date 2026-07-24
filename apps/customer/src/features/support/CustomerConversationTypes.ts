import type {
  CustomerTemplateRouteContext,
} from "../../platform/slices/index.js";

const SAFE_CONVERSATION_IDENTIFIER =
  /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export const CUSTOMER_CONVERSATION_BLOCKED_CAPABILITIES = Object.freeze([
  Object.freeze({
    key: "conversation-list",
    label: "会话列表",
    description: "当前不能读取或确认任何会话列表。",
  }),
  Object.freeze({
    key: "conversation-detail",
    label: "会话详情与历史",
    description: "当前不能读取详情、消息历史或关闭后记录。",
  }),
  Object.freeze({
    key: "conversation-create",
    label: "创建会话",
    description: "当前不会创建会话，也不会生成本地会话占位。",
  }),
  Object.freeze({
    key: "conversation-send-read",
    label: "发送与已读",
    description: "当前不会发送消息、标记已读或展示乐观成功。",
  }),
  Object.freeze({
    key: "conversation-live",
    label: "实时连接",
    description: "当前不会建立实时连接、轮询或降级发送通道。",
  }),
  Object.freeze({
    key: "conversation-csat",
    label: "客服满意度",
    description: "当前不能提交会话满意度，页面不会伪造提交结果。",
  }),
] as const);

export type CustomerConversationBlockedCapability =
  typeof CUSTOMER_CONVERSATION_BLOCKED_CAPABILITIES[number];

export type CustomerConversationRouteInput =
  | {
      readonly view: "list";
      readonly conversationId: null;
      readonly linkedTicketId: string | null;
    }
  | {
      readonly view: "detail";
      readonly conversationId: string;
      readonly linkedTicketId: string | null;
    };

export function isSafeCustomerConversationIdentifier(
  value: string,
): boolean {
  return SAFE_CONVERSATION_IDENTIFIER.test(value);
}

function parseOptionalIdentifier(value: string | undefined):
string | null | undefined {
  if (value === undefined) return null;
  if (
    value.length === 0 ||
    value !== value.trim() ||
    !isSafeCustomerConversationIdentifier(value)
  ) {
    return undefined;
  }
  return value;
}

export function parseCustomerConversationRouteInput(
  route: CustomerTemplateRouteContext,
): CustomerConversationRouteInput | null {
  if (
    Object.keys(route.query).some((key) => key !== "linkedTicketId")
  ) {
    return null;
  }
  const linkedTicketId = parseOptionalIdentifier(
    route.query.linkedTicketId,
  );
  if (linkedTicketId === undefined) return null;

  if (
    route.pattern === "/support/conversations" &&
    route.pathname === "/support/conversations" &&
    Object.keys(route.params).length === 0
  ) {
    return Object.freeze({
      view: "list",
      conversationId: null,
      linkedTicketId,
    });
  }

  if (
    route.pattern !== "/support/conversations/:conversationId" ||
    Object.keys(route.params).length !== 1
  ) {
    return null;
  }
  const conversationId = route.params.conversationId;
  if (
    conversationId === undefined ||
    !isSafeCustomerConversationIdentifier(conversationId) ||
    route.pathname !== `/support/conversations/${conversationId}`
  ) {
    return null;
  }
  return Object.freeze({
    view: "detail",
    conversationId,
    linkedTicketId,
  });
}
