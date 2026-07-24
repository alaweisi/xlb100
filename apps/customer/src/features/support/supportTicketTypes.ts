import type {
  SupportCsat,
  SupportTicket,
  SupportTicketEvent,
  SupportTicketPriority,
  SupportTicketType,
} from "@xlb/types";

const SAFE_SUPPORT_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export function isSafeCustomerSupportIdentifier(value: string): boolean {
  return SAFE_SUPPORT_IDENTIFIER.test(value);
}

export interface CustomerSupportBusinessReferences {
  readonly orderId: string | null;
  readonly complaintId: string | null;
}

export type CustomerSupportTicketRouteInput =
  | {
      readonly view: "hub";
      readonly references: CustomerSupportBusinessReferences;
    }
  | {
      readonly view: "tickets";
      readonly references: CustomerSupportBusinessReferences;
      readonly cursor: string | null;
    }
  | {
      readonly view: "detail";
      readonly ticketId: string;
    };

export interface CustomerSupportTicketDraft {
  readonly type: SupportTicketType;
  readonly priority: SupportTicketPriority;
  readonly subject: string;
  readonly description: string;
  readonly orderId: string;
  readonly complaintId: string;
}

export type CustomerSupportTicketDraftField =
  | "type"
  | "priority"
  | "subject"
  | "description"
  | "orderId"
  | "complaintId";

export type CustomerSupportTicketDraftErrors = Readonly<
  Partial<Record<CustomerSupportTicketDraftField, string>>
>;

export type CustomerSupportTicketOperation =
  | "creating"
  | "commenting"
  | "reopening"
  | "rating";

export interface CustomerSupportTicketNotice {
  readonly kind: "success" | "conflict" | "error" | "safe";
  readonly message: string;
}

export interface CustomerSupportTicketViewModel {
  readonly route: CustomerSupportTicketRouteInput;
  readonly tickets: readonly SupportTicket[];
  readonly nextCursor: string | null;
  readonly detail: {
    readonly ticket: SupportTicket;
    readonly events: readonly SupportTicketEvent[];
  } | null;
  readonly refreshing: boolean;
  readonly loadingMore: boolean;
  readonly operation: CustomerSupportTicketOperation | null;
  readonly notice: CustomerSupportTicketNotice | null;
  readonly draft: CustomerSupportTicketDraft;
  readonly draftErrors: CustomerSupportTicketDraftErrors;
  readonly comment: string;
  readonly reopenReason: string;
  readonly csatScore: 1 | 2 | 3 | 4 | 5 | null;
  readonly csatComment: string;
  readonly csatReceipt: SupportCsat | null;
  readonly csatServerDecided: boolean;
}

export interface CustomerSupportTicketActions {
  readonly onBack: () => void;
  readonly onOpenTickets: () => void;
  readonly onOpenTicket: (ticketId: string) => void;
  readonly onRefresh: () => void;
  readonly onLoadMore: () => void;
  readonly onDraftChange: (
    field: CustomerSupportTicketDraftField,
    value: string,
  ) => void;
  readonly onCreate: () => void;
  readonly onCommentChange: (value: string) => void;
  readonly onComment: () => void;
  readonly onReopenReasonChange: (value: string) => void;
  readonly onReopen: () => void;
  readonly onCsatScoreChange: (score: 1 | 2 | 3 | 4 | 5) => void;
  readonly onCsatCommentChange: (value: string) => void;
  readonly onSubmitCsat: () => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerSupportTicketTemplateReadyData {
  readonly viewModel: CustomerSupportTicketViewModel;
  readonly actions: CustomerSupportTicketActions;
}

export function emptyCustomerSupportTicketDraft(
  references: CustomerSupportBusinessReferences = {
    orderId: null,
    complaintId: null,
  },
): CustomerSupportTicketDraft {
  return Object.freeze({
    type: "order_question",
    priority: "normal",
    subject: "",
    description: "",
    orderId: references.orderId ?? "",
    complaintId: references.complaintId ?? "",
  });
}

export function mergeSupportTicketPages(
  current: readonly SupportTicket[],
  incoming: readonly SupportTicket[],
): readonly SupportTicket[] {
  const merged = new Map(current.map((ticket) => [ticket.ticketId, ticket]));
  for (const ticket of incoming) {
    const existing = merged.get(ticket.ticketId);
    if (
      existing === undefined ||
      ticket.version > existing.version ||
      (
        ticket.version === existing.version &&
        Date.parse(ticket.updatedAt) > Date.parse(existing.updatedAt)
      )
    ) {
      merged.set(ticket.ticketId, ticket);
    }
  }
  return Object.freeze([...merged.values()]);
}

export function requesterVisibleSupportTicketEvents(
  events: readonly SupportTicketEvent[],
): readonly SupportTicketEvent[] {
  return Object.freeze(events.filter(
    (event) => event.visibility === "requester" || event.visibility === "all",
  ));
}
