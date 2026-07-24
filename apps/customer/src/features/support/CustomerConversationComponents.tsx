import {
  CustomerButton,
  GlassCard,
} from "@xlb/customer-components";
import {
  CUSTOMER_CONVERSATION_BACK_EVENT,
  CUSTOMER_CONVERSATION_TICKETS_EVENT,
} from "./CustomerConversationActionController.js";
import {
  CUSTOMER_CONVERSATION_BLOCKED_CAPABILITIES,
  type CustomerConversationRouteInput,
} from "./CustomerConversationTypes.js";

export interface CustomerConversationComponentProps {
  readonly routeInput: CustomerConversationRouteInput | null;
  readonly reasonCode: "blocked_by_gap_07" | "invalid_conversation_route";
}

function dispatchAction(eventName: string): void {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function CustomerConversationHeader() {
  return (
    <header className="xlb-conversation-header">
      <CustomerButton
        className="xlb-conversation-header__back"
        variant="quiet"
        type="button"
        onClick={() => dispatchAction(CUSTOMER_CONVERSATION_BACK_EVENT)}
      >
        返回
      </CustomerButton>
      <div>
        <p>喜乐帮 · 客服中心</p>
        <h1>在线会话</h1>
      </div>
      <span aria-hidden="true" />
    </header>
  );
}

export function CustomerConversationGapStatus({
  routeInput,
  reasonCode,
}: CustomerConversationComponentProps) {
  const invalid = reasonCode === "invalid_conversation_route";
  return (
    <section
      className="xlb-conversation-status"
      aria-labelledby="conversation-gap-title"
      role="status"
    >
      <div className="xlb-conversation-status__mark" aria-hidden="true">
        07
      </div>
      <div>
        <p className="xlb-conversation-eyebrow">
          {invalid ? "安全边界已拦截" : "GAP-07 · capability unavailable"}
        </p>
        <h2 id="conversation-gap-title">
          {invalid ? "会话标识无法安全使用" : "实时会话暂不可用"}
        </h2>
        <p>
          {invalid
            ? "链接参数未通过严格校验。页面不会据此查询、确认或猜测任何会话是否存在。"
            : "会话读写与消息响应契约尚未完整对齐。当前页面只说明边界，不连接、不补数据，也不进入完成态。"}
        </p>
        <span className="xlb-conversation-status__badge">
          {routeInput?.view === "detail" ? "详情入口已安全阻断" : "会话入口已安全阻断"}
        </span>
      </div>
    </section>
  );
}

export function CustomerConversationReferenceSeam({
  routeInput,
}: CustomerConversationComponentProps) {
  if (routeInput === null) return null;
  const hasConversationId = routeInput.conversationId !== null;
  const hasLinkedTicketId = routeInput.linkedTicketId !== null;
  return (
    <section
      className="xlb-conversation-reference"
      aria-labelledby="conversation-reference-title"
    >
      <p className="xlb-conversation-eyebrow">已验证的边界输入</p>
      <h2 id="conversation-reference-title">仅保留未来衔接位置</h2>
      <div className="xlb-conversation-reference__items">
        <span data-present={hasConversationId}>
          会话标识：{hasConversationId ? "格式有效，未查询" : "未提供"}
        </span>
        <span data-present={hasLinkedTicketId}>
          关联工单：{hasLinkedTicketId ? "格式有效，未查询" : "未提供"}
        </span>
      </div>
      <p>
        标识只用于描述边界，不代表对象存在、属于当前顾客或可在当前城市访问。
      </p>
    </section>
  );
}

export function CustomerConversationCapabilityList() {
  return (
    <section
      className="xlb-conversation-capabilities"
      aria-labelledby="conversation-capabilities-title"
    >
      <div>
        <p className="xlb-conversation-eyebrow">当前缺口范围</p>
        <h2 id="conversation-capabilities-title">以下能力全部保持关闭</h2>
      </div>
      <ul>
        {CUSTOMER_CONVERSATION_BLOCKED_CAPABILITIES.map((capability) => (
          <li key={capability.key}>
            <span aria-hidden="true">—</span>
            <div>
              <strong>{capability.label}</strong>
              <p>{capability.description}</p>
            </div>
            <em>不可用</em>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CustomerConversationCsatBoundary() {
  return (
    <GlassCard
      as="section"
      className="xlb-conversation-csat"
      aria-labelledby="conversation-csat-title"
    >
      <div>
        <p className="xlb-conversation-eyebrow">客服满意度</p>
        <h2 id="conversation-csat-title">当前不可提交</h2>
      </div>
      <p>
        会话尚未形成可验证的关闭事实，页面不会显示评分控件或本地成功回执。
      </p>
      <CustomerButton type="button" disabled>
        GAP-07 关闭后开放
      </CustomerButton>
    </GlassCard>
  );
}

export function CustomerConversationFallbackActions() {
  return (
    <nav
      className="xlb-conversation-actions"
      aria-label="可用的客服替代方式"
    >
      <div>
        <p className="xlb-conversation-eyebrow">仍可获得帮助</p>
        <h2>使用正式工单继续</h2>
        <p>工单能力保持可用，并由服务端确认创建与处理状态。</p>
      </div>
      <div className="xlb-conversation-actions__buttons">
        <CustomerButton
          type="button"
          variant="secondary"
          onClick={() => dispatchAction(CUSTOMER_CONVERSATION_BACK_EVENT)}
        >
          返回客服中心
        </CustomerButton>
        <CustomerButton
          type="button"
          onClick={() => dispatchAction(CUSTOMER_CONVERSATION_TICKETS_EVENT)}
        >
          前往客服工单
        </CustomerButton>
      </div>
    </nav>
  );
}
