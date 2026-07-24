import type {
  CustomerOrderReviewView,
  ReviewAppeal,
} from "@xlb/types";

export type CustomerReviewRouteInput =
  | {
      readonly kind: "order";
      readonly orderId: string;
      readonly reviewId: null;
    }
  | {
      readonly kind: "appeal";
      readonly orderId: string | null;
      readonly reviewId: string;
    };

export type CustomerReviewOperation =
  | "creating-review"
  | "appealing"
  | "withdrawing";

export interface CustomerReviewFieldErrors {
  readonly rating?: string;
  readonly comment?: string;
  readonly appealReason?: string;
}

export interface CustomerReviewDraft {
  readonly rating: number | null;
  readonly comment: string;
  readonly appealReason: string;
}

export interface CustomerReviewNotice {
  readonly kind: "success" | "error" | "conflict" | "safe";
  readonly message: string;
}

export interface CustomerReviewViewModel {
  readonly routeInput: CustomerReviewRouteInput;
  readonly review: CustomerOrderReviewView | null;
  readonly draft: CustomerReviewDraft;
  readonly errors: CustomerReviewFieldErrors;
  readonly operation: CustomerReviewOperation | null;
  readonly refreshing: boolean;
  readonly notice: CustomerReviewNotice | null;
}

export interface CustomerReviewActions {
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly onOpenAppeal: () => void;
  readonly onRatingChange: (rating: number) => void;
  readonly onCommentChange: (comment: string) => void;
  readonly onAppealReasonChange: (reason: string) => void;
  readonly onCreateReview: () => void;
  readonly onCreateAppeal: () => void;
  readonly onWithdrawAppeal: () => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerReviewTemplateReadyData {
  readonly viewModel: CustomerReviewViewModel;
  readonly actions: CustomerReviewActions;
}

export function currentCustomerOpenAppeal(
  view: CustomerOrderReviewView,
): ReviewAppeal | null {
  return view.appeals.find((appeal) =>
    appeal.subjectType === "customer" &&
    appeal.status === "open" &&
    appeal.moderationVersion === view.visibility.moderationVersion
  ) ?? null;
}
