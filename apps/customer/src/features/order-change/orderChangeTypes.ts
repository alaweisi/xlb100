import type {
  Order,
  OrderReverseRequest,
  OrderReverseType,
  ScheduledTimeSlot,
} from "@xlb/types";

export interface CustomerOrderChangeRouteInput {
  readonly orderId: string;
  readonly reverseType: OrderReverseType | null;
}

export interface CustomerOrderChangeAggregate {
  readonly order: Order;
  readonly reverseRequests: readonly OrderReverseRequest[];
}

export interface CustomerOrderChangeDraft {
  readonly reverseType: OrderReverseType;
  readonly reason: string;
  readonly requestedScheduledAt: string;
  readonly requestedTimeSlot: ScheduledTimeSlot;
}

export interface CustomerOrderChangeFieldErrors {
  readonly reverseType?: string;
  readonly reason?: string;
  readonly requestedScheduledAt?: string;
  readonly requestedTimeSlot?: string;
}

export type CustomerOrderChangeNotice = {
  readonly kind: "success" | "conflict";
  readonly message: string;
} | null;

export interface CustomerOrderChangeEligibility {
  readonly enabled: boolean;
  readonly reasonCode:
    | "server_will_decide"
    | "order_status_not_eligible"
    | "fulfillment_start_fact_missing";
}

export interface CustomerOrderChangeViewModel {
  readonly routeInput: CustomerOrderChangeRouteInput;
  readonly aggregate: CustomerOrderChangeAggregate;
  readonly draft: CustomerOrderChangeDraft;
  readonly errors: CustomerOrderChangeFieldErrors;
  readonly eligibility: Readonly<Record<OrderReverseType, CustomerOrderChangeEligibility>>;
  readonly refreshing: boolean;
  readonly notice: CustomerOrderChangeNotice;
}

export interface CustomerOrderChangeActions {
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly onSelectType: (reverseType: OrderReverseType) => void;
  readonly onReasonChange: (reason: string) => void;
  readonly onScheduledAtChange: (scheduledAt: string) => void;
  readonly onTimeSlotChange: (slot: ScheduledTimeSlot) => void;
  readonly onSubmit: () => void;
}

export interface CustomerOrderChangeTemplateData {
  readonly viewModel: CustomerOrderChangeViewModel;
  readonly actions: CustomerOrderChangeActions;
}

type DataStateStatus =
  | "ready"
  | "empty"
  | "submitting"
  | "validation_error"
  | "conflict";

export type CustomerOrderChangeTemplateState =
  | {
      readonly status: "loading";
    }
  | {
      readonly status: DataStateStatus;
      readonly data: CustomerOrderChangeTemplateData;
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
