export const CUSTOMER_CONVERSATION_BACK_EVENT =
  "xlb:customer-conversation-back";
export const CUSTOMER_CONVERSATION_TICKETS_EVENT =
  "xlb:customer-conversation-open-tickets";

export interface CustomerConversationNavigation {
  readonly backToSupport: () => void;
  readonly openTickets: () => void;
}

function changeBrowserRoute(path: "/support" | "/support/tickets"): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerConversationNavigation():
Readonly<CustomerConversationNavigation> {
  return Object.freeze({
    backToSupport() {
      changeBrowserRoute("/support");
    },
    openTickets() {
      changeBrowserRoute("/support/tickets");
    },
  });
}

export class CustomerConversationActionController {
  constructor(
    private readonly navigation: CustomerConversationNavigation,
  ) {}

  backToSupport(): void {
    this.navigation.backToSupport();
  }

  openTickets(): void {
    this.navigation.openTickets();
  }
}
