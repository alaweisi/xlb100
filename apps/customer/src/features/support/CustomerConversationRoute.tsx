import {
  useEffect,
  useMemo,
} from "react";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  CUSTOMER_CONVERSATION_BACK_EVENT,
  CUSTOMER_CONVERSATION_TICKETS_EVENT,
  CustomerConversationActionController,
  createBrowserCustomerConversationNavigation,
  type CustomerConversationNavigation,
} from "./CustomerConversationActionController.js";
import { CustomerConversationTemplate } from "./CustomerConversationTemplate.js";
import {
  parseCustomerConversationRouteInput,
} from "./CustomerConversationTypes.js";
import "./CustomerConversation.css";

export {
  parseCustomerConversationRouteInput as parseCustomerConversationRoute,
} from "./CustomerConversationTypes.js";

export interface CustomerConversationPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly navigation?: CustomerConversationNavigation;
}

export function CustomerConversationPage({
  slice,
  route,
  navigation: providedNavigation,
}: CustomerConversationPageProps) {
  const routeInput = useMemo(
    () => parseCustomerConversationRouteInput(route),
    [route],
  );
  const navigation = useMemo(
    () => providedNavigation ??
      createBrowserCustomerConversationNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => new CustomerConversationActionController(navigation),
    [navigation],
  );

  useEffect(() => {
    const back = () => controller.backToSupport();
    const tickets = () => controller.openTickets();
    window.addEventListener(CUSTOMER_CONVERSATION_BACK_EVENT, back);
    window.addEventListener(CUSTOMER_CONVERSATION_TICKETS_EVENT, tickets);
    return () => {
      window.removeEventListener(CUSTOMER_CONVERSATION_BACK_EVENT, back);
      window.removeEventListener(CUSTOMER_CONVERSATION_TICKETS_EVENT, tickets);
    };
  }, [controller]);

  const state: CustomerSliceState = Object.freeze({
    status: "unavailable",
    capability: "customer.support.conversations",
    reasonCode: routeInput === null
      ? "invalid_conversation_route"
      : "blocked_by_gap_07",
    recovery: null,
  });

  return (
    <CustomerConversationTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerConversationPage;
