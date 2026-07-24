import type {
  CustomerL1TemplateProps,
} from "../../platform/slices/index.js";
import {
  CUSTOMER_CONVERSATION_COMPONENTS,
  createCustomerConversationComponentRegistry,
  type CustomerConversationComponentType,
} from "./CustomerConversationComponentRegistry.js";
import type {
  CustomerConversationComponentProps,
} from "./CustomerConversationComponents.js";
import {
  parseCustomerConversationRouteInput,
} from "./CustomerConversationTypes.js";

function renderRegistered(
  type: CustomerConversationComponentType,
  props: CustomerConversationComponentProps,
) {
  const Component = createCustomerConversationComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Conversation component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerConversationTemplate({
  route,
  state,
}: CustomerL1TemplateProps) {
  const routeInput = parseCustomerConversationRouteInput(route);
  const reasonCode = routeInput === null ||
      state.status !== "unavailable" ||
      state.reasonCode !== "blocked_by_gap_07"
    ? "invalid_conversation_route"
    : "blocked_by_gap_07";
  const props = Object.freeze({ routeInput, reasonCode });

  return (
    <main className="xlb-conversation-shell">
      {CUSTOMER_CONVERSATION_COMPONENTS.map((type) =>
        renderRegistered(type, props)
      )}
    </main>
  );
}
