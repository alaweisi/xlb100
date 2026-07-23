import {
  addAftersaleTimelineNoteRequestSchema,
  createAftersaleComplaintRequestSchema,
} from "@xlb/validators";
import {
  CustomerAftersaleCoordinator,
  type CustomerAftersaleMutationResult,
} from "./CustomerAftersaleCoordinator.js";
import {
  isSafeCustomerAftersaleIdentifier,
  type CustomerAftersaleComplaintDraft,
  type CustomerAftersaleDraftErrors,
  type CustomerAftersaleScope,
} from "./aftersaleTypes.js";

export type CustomerAftersaleActionResult =
  | CustomerAftersaleMutationResult
  | {
      readonly status: "validation_error";
      readonly errors: CustomerAftersaleDraftErrors;
    };

export interface CustomerAftersaleNavigation {
  back(): void;
  openComplaint(complaintId: string): void;
}

export function createComplaintIdempotencyKey(): string {
  const suffix = typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-complaint-${suffix}`;
}

export class CustomerAftersaleActionController {
  readonly #coordinator: CustomerAftersaleCoordinator;
  readonly #navigation: CustomerAftersaleNavigation;
  #mutationInFlight = false;

  constructor(
    coordinator: CustomerAftersaleCoordinator,
    navigation: CustomerAftersaleNavigation,
  ) {
    this.#coordinator = coordinator;
    this.#navigation = navigation;
  }

  back(): void {
    this.#navigation.back();
  }

  openComplaint(complaintId: string): void {
    if (isSafeCustomerAftersaleIdentifier(complaintId)) {
      this.#navigation.openComplaint(complaintId);
    }
  }

  async create(
    orderId: string,
    draft: CustomerAftersaleComplaintDraft,
    scope: CustomerAftersaleScope,
  ): Promise<CustomerAftersaleActionResult> {
    if (!isSafeCustomerAftersaleIdentifier(orderId)) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({
          description: "订单引用格式不正确。",
        }),
      });
    }
    const parsed = createAftersaleComplaintRequestSchema.safeParse({
      orderId,
      category: draft.category,
      priority: draft.priority,
      description: draft.description,
      idempotencyKey: createComplaintIdempotencyKey(),
    });
    if (!parsed.success) {
      const errors: {
        category?: string;
        priority?: string;
        description?: string;
      } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "category") {
          errors.category ??= "请选择正式投诉类别。";
        } else if (field === "priority") {
          errors.priority ??= "请选择正式优先级。";
        } else if (field === "description") {
          errors.description ??= "问题描述需为 5–2000 个字符。";
        }
      }
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze(errors),
      });
    }
    return this.#run(() => this.#coordinator.create(parsed.data, scope));
  }

  async addNote(
    complaintId: string,
    content: string,
  ): Promise<CustomerAftersaleActionResult> {
    if (!isSafeCustomerAftersaleIdentifier(complaintId)) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({
          description: "投诉引用格式不正确。",
        }),
      });
    }
    const parsed = addAftersaleTimelineNoteRequestSchema.safeParse({ content });
    if (!parsed.success) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({
          description: "补充说明需为 1–1000 个字符。",
        }),
      });
    }
    return this.#run(() =>
      this.#coordinator.addNote(complaintId, parsed.data.content)
    );
  }

  async #run(
    task: () => Promise<CustomerAftersaleMutationResult>,
  ): Promise<CustomerAftersaleMutationResult> {
    if (this.#mutationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    this.#mutationInFlight = true;
    try {
      return await task();
    } finally {
      this.#mutationInFlight = false;
    }
  }
}
