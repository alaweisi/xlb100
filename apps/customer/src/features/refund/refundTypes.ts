import type {
  CityCode,
  Order,
  RefundRequestStatus,
} from "@xlb/types";

export interface CustomerRefundRouteInput {
  readonly orderId: string;
}

export interface CustomerRefundScope {
  readonly actorId: string;
  readonly cityCode: CityCode;
}

/**
 * Deliberately excludes customerId and approvedByAdminId. The coordinator
 * checks the former as an authority boundary; neither belongs in the UI model.
 */
export interface CustomerRefundResult {
  readonly refundId: string;
  readonly orderId: string;
  readonly amount: number;
  readonly currency: "CNY";
  readonly reason: string | null;
  readonly status: RefundRequestStatus;
  readonly requestedAt: string;
  readonly approvedAt: string | null;
}

export interface CustomerRefundEligibility {
  readonly enabled: boolean;
  readonly reasonCode: "paid_order_hint" | "order_not_paid";
}

export interface CustomerRefundFieldErrors {
  readonly reason?: string;
}

export interface CustomerRefundViewModel {
  readonly routeInput: CustomerRefundRouteInput;
  readonly scope: CustomerRefundScope;
  readonly order: Order;
  readonly reason: string;
  readonly errors: CustomerRefundFieldErrors;
  readonly eligibility: CustomerRefundEligibility;
  readonly result: CustomerRefundResult | null;
  readonly idempotent: boolean | null;
  readonly notice: string | null;
}

export interface CustomerRefundActions {
  readonly onBack: () => void;
  readonly onRetry: () => void;
  readonly onReasonChange: (reason: string) => void;
  readonly onSubmit: () => void;
}

export interface CustomerRefundTemplateData {
  readonly viewModel: CustomerRefundViewModel;
  readonly actions: CustomerRefundActions;
}

export type CustomerRefundDataStatus =
  | "eligibility-checking"
  | "requesting"
  | "validation_error"
  | "conflict"
  | "limited-result";

export type CustomerRefundTemplateState =
  | {
      readonly status: "order-loading";
    }
  | {
      readonly status: CustomerRefundDataStatus;
      readonly data: CustomerRefundTemplateData;
    }
  | {
      readonly status: "error";
      readonly errorCode: string;
      readonly retryable: boolean;
    }
  | {
      readonly status: "forbidden_or_not_found";
    }
  | {
      readonly status: "unavailable";
      readonly reasonCode: string;
      readonly retryable: boolean;
    };
