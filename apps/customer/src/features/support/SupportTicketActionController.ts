import type {
  SupportTicket,
  SubmitSupportCsatRequest,
} from "@xlb/types";
import {
  addSupportTicketCommentRequestSchema,
  createSupportTicketRequestSchema,
  reopenSupportTicketRequestSchema,
  submitSupportCsatRequestSchema,
} from "@xlb/validators";
import {
  SupportTicketCoordinator,
  type CustomerSupportTicketScope,
  type SupportTicketMutationResult,
} from "./SupportTicketCoordinator.js";
import type {
  CustomerSupportTicketDraft,
  CustomerSupportTicketDraftErrors,
  CustomerSupportTicketDraftField,
} from "./supportTicketTypes.js";
import {
  isSafeCustomerSupportIdentifier,
} from "./supportTicketTypes.js";

export type SupportTicketActionResult =
  | SupportTicketMutationResult
  | {
      readonly status: "validation_error";
      readonly errors: CustomerSupportTicketDraftErrors;
      readonly message: string;
    };

export interface CustomerSupportTicketNavigation {
  back(): void;
  openTickets(references: {
    readonly orderId: string | null;
    readonly complaintId: string | null;
  }): void;
  openTicket(ticketId: string): void;
}

export function createSupportTicketIdempotencyKey(
  action: "create" | "comment" | "reopen" | "csat",
): string {
  const suffix = typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-support-${action}-${suffix}`;
}

function fieldErrors(
  issues: readonly {
    readonly path: readonly PropertyKey[];
  }[],
): CustomerSupportTicketDraftErrors {
  const errors: Partial<Record<CustomerSupportTicketDraftField, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === "type" || field === "priority") {
      errors[field] ??= "请选择正式支持范围内的选项。";
    } else if (field === "subject") {
      errors.subject ??= "主题需为 1–160 个字符。";
    } else if (field === "description") {
      errors.description ??= "问题描述需为 1–10000 个字符。";
    } else if (field === "relatedOrderId") {
      errors.orderId ??= "订单引用格式不正确。";
    } else if (field === "linkedAftersaleComplaintId") {
      errors.complaintId ??= "售后引用必须合法且同时提供订单引用。";
    }
  }
  return Object.freeze(errors);
}

export class SupportTicketActionController {
  readonly #coordinator: SupportTicketCoordinator;
  readonly #navigation: CustomerSupportTicketNavigation;
  #operationInFlight = false;

  constructor(
    coordinator: SupportTicketCoordinator,
    navigation: CustomerSupportTicketNavigation,
  ) {
    this.#coordinator = coordinator;
    this.#navigation = navigation;
  }

  back(): void {
    this.#navigation.back();
  }

  openTickets(references: {
    readonly orderId: string | null;
    readonly complaintId: string | null;
  }): void {
    this.#navigation.openTickets(references);
  }

  openTicket(ticketId: string): void {
    this.#navigation.openTicket(ticketId);
  }

  async create(
    draft: CustomerSupportTicketDraft,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketActionResult> {
    const unsafeReferences: Partial<
      Record<CustomerSupportTicketDraftField, string>
    > = {};
    if (
      draft.orderId.trim() !== "" &&
      !isSafeCustomerSupportIdentifier(draft.orderId.trim())
    ) {
      unsafeReferences.orderId = "订单引用格式不正确。";
    }
    if (
      draft.complaintId.trim() !== "" &&
      !isSafeCustomerSupportIdentifier(draft.complaintId.trim())
    ) {
      unsafeReferences.complaintId = "售后引用格式不正确。";
    }
    if (Object.keys(unsafeReferences).length > 0) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze(unsafeReferences),
        message: "业务引用未通过安全校验。",
      });
    }
    const request = createSupportTicketRequestSchema.safeParse({
      type: draft.type,
      priority: draft.priority,
      subject: draft.subject,
      description: draft.description,
      ...(draft.orderId.trim() === ""
        ? {}
        : { relatedOrderId: draft.orderId.trim() }),
      ...(draft.complaintId.trim() === ""
        ? {}
        : { linkedAftersaleComplaintId: draft.complaintId.trim() }),
      idempotencyKey: createSupportTicketIdempotencyKey("create"),
    });
    if (!request.success) {
      return Object.freeze({
        status: "validation_error",
        errors: fieldErrors(request.error.issues),
        message: "请修正工单信息后再提交。",
      });
    }
    return this.#run(() => this.#coordinator.create(scope, request.data));
  }

  async comment(
    ticket: SupportTicket,
    content: string,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketActionResult> {
    if (ticket.status === "closed") {
      return Object.freeze({
        status: "conflict",
        reasonCode: "support_ticket_changed",
      });
    }
    const request = addSupportTicketCommentRequestSchema.safeParse({
      content,
      idempotencyKey: createSupportTicketIdempotencyKey("comment"),
    });
    if (!request.success) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({}),
        message: "留言需为 1–10000 个字符。",
      });
    }
    return this.#run(() => this.#coordinator.comment(
      ticket.ticketId,
      request.data.content,
      request.data.idempotencyKey,
      scope,
    ));
  }

  async reopen(
    ticket: SupportTicket,
    reason: string,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketActionResult> {
    if (ticket.status !== "resolved") {
      return Object.freeze({
        status: "conflict",
        reasonCode: "support_ticket_changed",
      });
    }
    const request = reopenSupportTicketRequestSchema.safeParse({
      ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
      idempotencyKey: createSupportTicketIdempotencyKey("reopen"),
    });
    if (!request.success) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({}),
        message: "重开说明不得超过 2000 个字符。",
      });
    }
    return this.#run(() => this.#coordinator.reopen(
      ticket.ticketId,
      request.data.reason ?? null,
      request.data.idempotencyKey,
      scope,
    ));
  }

  async submitCsat(
    ticket: SupportTicket,
    score: 1 | 2 | 3 | 4 | 5 | null,
    comment: string,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketActionResult> {
    if (ticket.status !== "closed") {
      return Object.freeze({
        status: "conflict",
        reasonCode: "support_ticket_changed",
      });
    }
    const request = submitSupportCsatRequestSchema.safeParse({
      score,
      ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
      idempotencyKey: createSupportTicketIdempotencyKey("csat"),
    });
    if (!request.success) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({}),
        message: "请选择 1–5 分；评价说明不得超过 1000 个字符。",
      });
    }
    return this.#run(() => this.#coordinator.submitCsat(
      ticket.ticketId,
      request.data as SubmitSupportCsatRequest,
      scope,
    ));
  }

  async #run(
    operation: () => Promise<SupportTicketMutationResult>,
  ): Promise<SupportTicketMutationResult> {
    if (this.#operationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    this.#operationInFlight = true;
    try {
      return await operation();
    } finally {
      this.#operationInFlight = false;
    }
  }
}
