import {
  CustomerComponentRegistry,
} from "@xlb/customer-components";
import {
  CustomerSupportChannelChoice,
  CustomerSupportHeader,
  CustomerSupportHelpSlot,
  CustomerSupportNotice,
  CustomerSupportTicketCsat,
  CustomerSupportTicketDetail,
  CustomerSupportTicketFollowup,
  CustomerSupportTicketForm,
  CustomerSupportTicketList,
  CustomerSupportTicketReopen,
  CustomerSupportTicketTimeline,
  type CustomerSupportHelpSlotProps,
  type CustomerSupportTicketComponentProps,
} from "./supportTicketComponents.js";

export const CUSTOMER_SUPPORT_TICKET_CORE_COMPONENTS = [
  "header",
  "notice",
  "channel-choice",
  "ticket-form",
  "ticket-list",
  "ticket-detail",
  "ticket-timeline",
  "ticket-followup",
  "ticket-reopen",
  "ticket-csat",
] as const;

export type CustomerSupportTicketCoreComponent =
  typeof CUSTOMER_SUPPORT_TICKET_CORE_COMPONENTS[number];

export interface CustomerSupportHelpPresentationSlot {
  readonly type: "faq" | "help-note";
  readonly position: "hub-after-channels" | "tickets-after-form";
  readonly title: string;
  readonly body: string;
  readonly items: readonly string[];
}

export interface CustomerSupportTicketPresentationPlan {
  readonly slots: readonly CustomerSupportHelpPresentationSlot[];
}

const ROOT_KEYS = new Set(["slots"]);
const SLOT_KEYS = new Set(["type", "position", "title", "body", "items"]);

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= maximum ? text : null;
}

/**
 * The L2 plan can add presentation-only help copy. Unknown keys invalidate the
 * whole plan so status, priority, type, visibility, routes and write actions
 * can never be smuggled into the fixed ticket component plan.
 */
export function parseCustomerSupportTicketPresentationPlan(
  input: unknown,
): CustomerSupportTicketPresentationPlan {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !hasOnlyKeys(input as Readonly<Record<string, unknown>>, ROOT_KEYS)
  ) {
    return Object.freeze({ slots: Object.freeze([]) });
  }
  const slots = (input as { readonly slots?: unknown }).slots;
  if (!Array.isArray(slots) || slots.length > 2) {
    return Object.freeze({ slots: Object.freeze([]) });
  }

  const parsed: CustomerSupportHelpPresentationSlot[] = [];
  for (const value of slots) {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !hasOnlyKeys(value as Readonly<Record<string, unknown>>, SLOT_KEYS)
    ) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    const slot = value as Readonly<Record<string, unknown>>;
    if (
      (slot.type !== "faq" && slot.type !== "help-note") ||
      (
        slot.position !== "hub-after-channels" &&
        slot.position !== "tickets-after-form"
      )
    ) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    const title = safeText(slot.title, 80);
    const body = safeText(slot.body, 500);
    if (title === null || body === null) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    const rawItems = slot.items === undefined ? [] : slot.items;
    if (!Array.isArray(rawItems) || rawItems.length > 6) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    const items = rawItems.map((item) => safeText(item, 160));
    if (items.some((item) => item === null)) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    if (parsed.some((item) => item.position === slot.position)) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    parsed.push(Object.freeze({
      type: slot.type,
      position: slot.position,
      title,
      body,
      items: Object.freeze(items as string[]),
    }));
  }
  return Object.freeze({ slots: Object.freeze(parsed) });
}

export function createCustomerSupportTicketComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerSupportTicketCoreComponent,
    CustomerSupportTicketComponentProps
  >()
    .register("header", CustomerSupportHeader)
    .register("notice", CustomerSupportNotice)
    .register("channel-choice", CustomerSupportChannelChoice)
    .register("ticket-form", CustomerSupportTicketForm)
    .register("ticket-list", CustomerSupportTicketList)
    .register("ticket-detail", CustomerSupportTicketDetail)
    .register("ticket-timeline", CustomerSupportTicketTimeline)
    .register("ticket-followup", CustomerSupportTicketFollowup)
    .register("ticket-reopen", CustomerSupportTicketReopen)
    .register("ticket-csat", CustomerSupportTicketCsat);
}

export function createCustomerSupportHelpComponentRegistry() {
  return new CustomerComponentRegistry<
    "faq" | "help-note",
    CustomerSupportHelpSlotProps
  >()
    .register("faq", CustomerSupportHelpSlot)
    .register("help-note", CustomerSupportHelpSlot);
}
