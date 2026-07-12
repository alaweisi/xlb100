import type { SupportTicketStatus } from "@xlb/types";

const TRANSITIONS: Readonly<Record<SupportTicketStatus, readonly SupportTicketStatus[]>> = {
  open: ["processing", "escalated"],
  processing: ["waiting_requester", "escalated", "resolved"],
  waiting_requester: ["processing", "escalated"],
  escalated: ["processing", "resolved"],
  resolved: ["processing", "closed"],
  closed: [],
};

export class InvalidSupportTicketTransitionError extends Error {
  constructor(from: SupportTicketStatus, to: SupportTicketStatus) {
    super(`invalid support ticket transition: ${from} -> ${to}`);
    this.name = "InvalidSupportTicketTransitionError";
  }
}

export function assertSupportTicketTransition(
  from: SupportTicketStatus,
  to: SupportTicketStatus,
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new InvalidSupportTicketTransitionError(from, to);
  }
}
