export const CUSTOMER_SLICE_COMMON_STATE_KINDS = [
  "loading",
  "empty",
  "error",
  "conflict",
  "unavailable",
] as const;

export type CustomerSliceCommonStateKind =
  typeof CUSTOMER_SLICE_COMMON_STATE_KINDS[number];

export interface CustomerSliceRecoveryAction {
  readonly actionKey: string;
  readonly labelKey: string;
}

export interface CustomerSliceLoadingState {
  readonly status: "loading";
  readonly requestKey: string | null;
  /** A new actor must never see data retained from the previous actor. */
  readonly previousActorDataVisible: false;
}

export interface CustomerSliceEmptyState {
  readonly status: "empty";
  readonly reasonCode: string;
  readonly recovery: CustomerSliceRecoveryAction | null;
}

export interface CustomerSliceErrorState {
  readonly status: "error";
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly recovery: CustomerSliceRecoveryAction | null;
}

export interface CustomerSliceConflictState {
  readonly status: "conflict";
  readonly conflictCode: string;
  /** Conflict recovery always starts by re-reading authoritative facts. */
  readonly refreshRequired: true;
  readonly recovery: CustomerSliceRecoveryAction;
}

export interface CustomerSliceUnavailableState {
  readonly status: "unavailable";
  readonly capability: string;
  readonly reasonCode: string;
  readonly recovery: CustomerSliceRecoveryAction | null;
}

export interface CustomerSliceReadyState<TData> {
  readonly status: "ready";
  readonly data: TData;
}

export type CustomerSliceCommonState =
  | CustomerSliceLoadingState
  | CustomerSliceEmptyState
  | CustomerSliceErrorState
  | CustomerSliceConflictState
  | CustomerSliceUnavailableState;

export type CustomerSliceState<TData = unknown> =
  | CustomerSliceCommonState
  | CustomerSliceReadyState<TData>;
