import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  AftersaleComplaint,
  AftersaleComplaintDetail,
  CreateAftersaleComplaintRequest,
} from "@xlb/types";
import {
  aftersaleComplaintSchema,
  createAftersaleComplaintRequestSchema,
} from "@xlb/validators";
import {
  requesterVisibleAftersaleTimeline,
  type CustomerAftersaleDetailView,
  type CustomerAftersaleScope,
} from "./aftersaleTypes.js";

export type CustomerAftersaleApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  | "createAftersaleComplaint"
  | "listAftersaleComplaints"
  | "getAftersaleComplaint"
  | "addAftersaleComplaintNote"
>;

type CustomerAftersaleFailure =
  | {
      readonly status: "safe_not_found";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.aftersale";
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "aftersale_load_failed"
        | "aftersale_response_invalid";
      readonly retryable: boolean;
    };

export type CustomerAftersaleListResult =
  | {
      readonly status: "ready";
      readonly complaints: readonly AftersaleComplaint[];
    }
  | CustomerAftersaleFailure;

export type CustomerAftersaleDetailResult =
  | {
      readonly status: "ready";
      readonly detail: CustomerAftersaleDetailView;
    }
  | CustomerAftersaleFailure;

export type CustomerAftersaleMutationResult =
  | {
      readonly status: "success";
      readonly idempotent: boolean;
      readonly complaint: AftersaleComplaint | null;
    }
  | {
      readonly status: "validation_error";
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "aftersale_changed" | "request_in_flight";
    }
  | CustomerAftersaleFailure;

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

function failure(error: unknown): CustomerAftersaleFailure {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({ status: "safe_not_found" });
    }
    if (error.kind === "http" && error.status === 501) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.aftersale",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "aftersale_response_invalid"
        : "aftersale_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "aftersale_response_invalid",
    retryable: false,
  });
}

function mutationFailure(error: unknown): CustomerAftersaleMutationResult {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 400) {
      return Object.freeze({ status: "validation_error" });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "aftersale_changed",
      });
    }
  }
  return failure(error);
}

function complaintInScope(
  complaint: AftersaleComplaint,
  scope: CustomerAftersaleScope,
  orderId?: string,
  complaintId?: string,
): boolean {
  return complaint.cityCode === scope.cityCode &&
    complaint.customerId === scope.actorId &&
    (orderId === undefined || complaint.orderId === orderId) &&
    (complaintId === undefined || complaint.complaintId === complaintId);
}

function parseComplaint(value: unknown): AftersaleComplaint | null {
  const parsed = aftersaleComplaintSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function detailMatchesScope(
  detail: AftersaleComplaintDetail,
  complaintId: string,
  scope: CustomerAftersaleScope,
): boolean {
  const complaint = parseComplaint(detail.complaint);
  if (
    complaint === null ||
    !complaintInScope(complaint, scope, undefined, complaintId)
  ) return false;
  const matches = (value: {
    readonly cityCode: string;
    readonly orderId: string;
    readonly complaintId: string;
  }) =>
    value.cityCode === scope.cityCode &&
    value.orderId === complaint.orderId &&
    value.complaintId === complaintId;
  return Array.isArray(detail.repairOrders) &&
    detail.repairOrders.every(matches) &&
    (
      detail.liabilityDecision === null ||
      matches(detail.liabilityDecision)
    ) &&
    Array.isArray(detail.compensationIntents) &&
    detail.compensationIntents.every((intent) =>
      matches(intent) &&
      intent.providerExecutionStatus === "not_executed"
    ) &&
    Array.isArray(detail.timeline) &&
    detail.timeline.every((event) =>
      event.cityCode === scope.cityCode &&
      event.orderId === complaint.orderId &&
      event.complaintId === complaintId
    );
}

export class CustomerAftersaleCoordinator {
  readonly #api: CustomerAftersaleApi;

  constructor(api: CustomerAftersaleApi) {
    this.#api = api;
  }

  async loadList(
    orderId: string,
    scope: CustomerAftersaleScope,
  ): Promise<CustomerAftersaleListResult> {
    try {
      const response = await this.#api.listAftersaleComplaints(orderId);
      if (
        response.ok !== true ||
        !Array.isArray(response.complaints)
      ) return failure(new Error("invalid complaint list"));
      const complaints = response.complaints.map(parseComplaint);
      if (
        complaints.some((complaint) => complaint === null) ||
        complaints.some((complaint) =>
          complaint !== null &&
          !complaintInScope(complaint, scope, orderId)
        )
      ) return failure(new Error("complaint list scope violation"));
      return Object.freeze({
        status: "ready",
        complaints: Object.freeze(
          complaints.filter(
            (complaint): complaint is AftersaleComplaint => complaint !== null,
          ),
        ),
      });
    } catch (error) {
      return failure(error);
    }
  }

  async loadDetail(
    complaintId: string,
    scope: CustomerAftersaleScope,
  ): Promise<CustomerAftersaleDetailResult> {
    try {
      const response = await this.#api.getAftersaleComplaint(complaintId);
      if (
        response.ok !== true ||
        typeof response.detail !== "object" ||
        response.detail === null ||
        !detailMatchesScope(
          response.detail as AftersaleComplaintDetail,
          complaintId,
          scope,
        )
      ) return failure(new Error("complaint detail scope violation"));
      const detail = response.detail as AftersaleComplaintDetail;
      return Object.freeze({
        status: "ready",
        detail: Object.freeze({
          ...detail,
          timeline: requesterVisibleAftersaleTimeline(detail.timeline),
        }),
      });
    } catch (error) {
      return failure(error);
    }
  }

  async create(
    request: CreateAftersaleComplaintRequest,
    scope: CustomerAftersaleScope,
  ): Promise<CustomerAftersaleMutationResult> {
    const parsed = createAftersaleComplaintRequestSchema.safeParse(request);
    if (!parsed.success) {
      return Object.freeze({ status: "validation_error" });
    }
    try {
      const response = await this.#api.createAftersaleComplaint(parsed.data);
      const complaint = parseComplaint(response.complaint);
      if (
        response.ok !== true ||
        typeof response.idempotent !== "boolean" ||
        complaint === null ||
        !complaintInScope(complaint, scope, parsed.data.orderId)
      ) return failure(new Error("complaint create response invalid"));
      return Object.freeze({
        status: "success",
        idempotent: response.idempotent,
        complaint,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async addNote(
    complaintId: string,
    content: string,
  ): Promise<CustomerAftersaleMutationResult> {
    try {
      const response = await this.#api.addAftersaleComplaintNote(
        complaintId,
        content,
      );
      if (response.ok !== true) {
        return failure(new Error("complaint note response invalid"));
      }
      return Object.freeze({
        status: "success",
        idempotent: false,
        complaint: null,
      });
    } catch (error) {
      return mutationFailure(error);
    }
  }
}
