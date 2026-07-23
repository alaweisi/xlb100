import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  CreateSupportTicketRequest,
  SupportCsat,
  SupportTicket,
  SupportTicketEvent,
  SubmitSupportCsatRequest,
} from "@xlb/types";
import {
  supportTicketDetailResponseSchema,
  supportTicketListResponseSchema,
  supportTicketMutationResponseSchema,
  supportTicketResponseSchema,
} from "@xlb/validators";
import {
  requesterVisibleSupportTicketEvents,
} from "./supportTicketTypes.js";

export type CustomerSupportTicketApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  | "createSupportTicket"
  | "listSupportTickets"
  | "getSupportTicket"
  | "addSupportTicketComment"
  | "reopenSupportTicket"
  | "submitSupportTicketCsat"
>;

export interface CustomerSupportTicketScope {
  readonly cityCode: CityCode;
  readonly actorId: string;
}

type SupportTicketReadFailure =
  | {
      readonly status: "error";
      readonly errorCode:
        | "support_ticket_load_failed"
        | "support_ticket_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "not_found";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.support.tickets";
      readonly reasonCode:
        | "support_ticket_api_unavailable"
        | "support_ticket_access_unavailable"
        | "support_ticket_scope_violation"
        | "support_ticket_visibility_violation";
    };

export type SupportTicketListLoadResult =
  | {
      readonly status: "ready";
      readonly tickets: readonly SupportTicket[];
      readonly nextCursor: string | null;
    }
  | SupportTicketReadFailure;

export type SupportTicketDetailLoadResult =
  | {
      readonly status: "ready";
      readonly ticket: SupportTicket;
      readonly events: readonly SupportTicketEvent[];
    }
  | SupportTicketReadFailure;

export type SupportTicketMutationResult =
  | {
      readonly status: "success";
      readonly ticket: SupportTicket | null;
      readonly event: SupportTicketEvent | null;
      readonly idempotent: boolean;
      readonly csat: SupportCsat | null;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "support_ticket_changed" | "request_in_flight";
    }
  | {
      readonly status: "not_found";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.support.tickets";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "support_ticket_mutation_failed"
        | "support_ticket_response_invalid";
      readonly retryable: boolean;
    };

function isRetryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (
      error.kind === "http" &&
      (
        error.status === 408 ||
        error.status === 425 ||
        error.status === 429 ||
        (error.status !== undefined && error.status >= 500)
      )
    );
}

function readFailure(error: unknown, detail: boolean): SupportTicketReadFailure {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return detail
        ? Object.freeze({ status: "not_found" })
        : Object.freeze({
            status: "unavailable",
            capability: "customer.support.tickets",
            reasonCode: "support_ticket_access_unavailable",
          });
    }
    if (error.kind === "http" && error.status === 501) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.support.tickets",
        reasonCode: "support_ticket_api_unavailable",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "support_ticket_response_invalid"
        : "support_ticket_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "support_ticket_response_invalid",
    retryable: false,
  });
}

function mutationFailure(error: unknown): SupportTicketMutationResult {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "support_ticket_changed",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({ status: "not_found" });
    }
    if (error.kind === "http" && error.status === 501) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.support.tickets",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "support_ticket_response_invalid"
        : "support_ticket_mutation_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "support_ticket_response_invalid",
    retryable: false,
  });
}

function belongsToScope(
  ticket: SupportTicket,
  scope: CustomerSupportTicketScope,
): boolean {
  return ticket.source === "customer" &&
    ticket.cityCode === scope.cityCode &&
    ticket.requesterId === scope.actorId;
}

function scopeViolation(): SupportTicketReadFailure {
  return Object.freeze({
    status: "unavailable",
    capability: "customer.support.tickets",
    reasonCode: "support_ticket_scope_violation",
  });
}

export class SupportTicketCoordinator {
  readonly #api: CustomerSupportTicketApi;

  constructor(api: CustomerSupportTicketApi) {
    this.#api = api;
  }

  async loadList(
    scope: CustomerSupportTicketScope,
    cursor: string | null = null,
  ): Promise<SupportTicketListLoadResult> {
    try {
      const response = supportTicketListResponseSchema.parse(
        await this.#api.listSupportTickets({
          source: "customer",
          limit: 20,
          ...(cursor === null ? {} : { cursor }),
        }),
      );
      if (response.tickets.some((ticket) => !belongsToScope(ticket, scope))) {
        return scopeViolation();
      }
      return Object.freeze({
        status: "ready",
        tickets: Object.freeze([...response.tickets]),
        nextCursor: response.nextCursor,
      });
    } catch (error) {
      return readFailure(error, false);
    }
  }

  async loadDetail(
    ticketId: string,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketDetailLoadResult> {
    try {
      const response = supportTicketDetailResponseSchema.parse(
        await this.#api.getSupportTicket(ticketId),
      );
      if (
        response.detail.ticket.ticketId !== ticketId ||
        !belongsToScope(response.detail.ticket, scope) ||
        response.detail.events.some((event) =>
          event.ticketId !== ticketId ||
          event.cityCode !== scope.cityCode
        )
      ) {
        return scopeViolation();
      }
      if (response.detail.events.some((event) => event.visibility === "internal")) {
        return Object.freeze({
          status: "unavailable",
          capability: "customer.support.tickets",
          reasonCode: "support_ticket_visibility_violation",
        });
      }
      return Object.freeze({
        status: "ready",
        ticket: response.detail.ticket,
        events: requesterVisibleSupportTicketEvents(response.detail.events),
      });
    } catch (error) {
      return readFailure(error, true);
    }
  }

  async create(
    scope: CustomerSupportTicketScope,
    request: CreateSupportTicketRequest,
  ): Promise<SupportTicketMutationResult> {
    try {
      const response = supportTicketResponseSchema.parse(
        await this.#api.createSupportTicket(request),
      );
      if (!belongsToScope(response.ticket, scope)) {
        return Object.freeze({
          status: "error",
          errorCode: "support_ticket_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        ticket: response.ticket,
        event: null,
        idempotent: false,
        csat: null,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async comment(
    ticketId: string,
    content: string,
    idempotencyKey: string,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketMutationResult> {
    try {
      const response = supportTicketMutationResponseSchema.parse(
        await this.#api.addSupportTicketComment(ticketId, {
          content,
          idempotencyKey,
        }),
      );
      if (
        response.ticket.ticketId !== ticketId ||
        !belongsToScope(response.ticket, scope) ||
        response.event.ticketId !== ticketId ||
        response.event.cityCode !== scope.cityCode ||
        response.event.eventType !== "commented" ||
        response.event.visibility === "internal"
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "support_ticket_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        ticket: response.ticket,
        event: response.event,
        idempotent: response.idempotent,
        csat: null,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async reopen(
    ticketId: string,
    reason: string | null,
    idempotencyKey: string,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketMutationResult> {
    try {
      const response = supportTicketMutationResponseSchema.parse(
        await this.#api.reopenSupportTicket(ticketId, {
          ...(reason === null ? {} : { reason }),
          idempotencyKey,
        }),
      );
      if (
        response.ticket.ticketId !== ticketId ||
        !belongsToScope(response.ticket, scope) ||
        response.event.ticketId !== ticketId ||
        response.event.cityCode !== scope.cityCode ||
        response.event.eventType !== "reopened" ||
        response.event.visibility === "internal"
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "support_ticket_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        ticket: response.ticket,
        event: response.event,
        idempotent: response.idempotent,
        csat: null,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async submitCsat(
    ticketId: string,
    request: SubmitSupportCsatRequest,
    scope: CustomerSupportTicketScope,
  ): Promise<SupportTicketMutationResult> {
    try {
      const response = await this.#api.submitSupportTicketCsat(ticketId, request);
      if (
        response.ok !== true ||
        response.csat.targetType !== "ticket" ||
        response.csat.targetId !== ticketId ||
        response.csat.cityCode !== scope.cityCode ||
        response.csat.score !== request.score
      ) {
        return Object.freeze({
          status: "error",
          errorCode: "support_ticket_response_invalid",
          retryable: false,
        });
      }
      return Object.freeze({
        status: "success",
        ticket: null,
        event: null,
        idempotent: false,
        csat: Object.freeze({ ...response.csat }),
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }
}
