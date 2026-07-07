export type WorkflowActor = "customer" | "worker" | "admin";

export type WorkflowActionSource = "backend" | "api-derived" | "not-wired";

export type WorkflowBackendSourceStatus =
  | "wired"
  | "partial"
  | "not-wired"
  | "read-only"
  | "design-source-missing";

export type WorkflowStateSource =
  | "backend"
  | "api-contract"
  | "frontend-derived-from-api"
  | "not-wired-policy";

export type WorkflowDisabledReason =
  | "API_NOT_AVAILABLE"
  | "WORKFLOW_NOT_IMPLEMENTED"
  | "DESIGN_SOURCE_MISSING"
  | "PHASE_BOUNDARY"
  | "CITY_SCOPE_REQUIRED"
  | "IDENTITY_REQUIRED"
  | "AUDIT_REQUIRED"
  | "EXECUTION_DISABLED"
  | "PERMISSION_DENIED"
  | "STATE_NOT_ACTIONABLE"
  | "IDEMPOTENCY_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "BACKEND_ERROR";

export type WorkflowUiSlot =
  | "pageHero"
  | "summaryCard"
  | "primaryActionDock"
  | "secondaryActions"
  | "workflowTimeline"
  | "stateBadge"
  | "guardrail"
  | "notWired"
  | "apiError"
  | "emptyState"
  | "adminToolbar"
  | "tableActions"
  | "bottomNav"
  | "themeSurface";

export type WorkflowFigmaBindingKind =
  | "exact"
  | "partial"
  | "derived"
  | "DESIGN_SOURCE_MISSING";

export type WorkflowHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface WorkflowBackendSource {
  contractDocs: string[];
  endpoints: string[];
  modules?: string[];
  status: WorkflowBackendSourceStatus;
}

export interface WorkflowCustomerAnswer {
  currentStep: string;
  nextAvailableStep: string;
  blockedReason?: string;
  estimatedTime?: string;
  recoveryPath?: string;
}

export interface WorkflowWorkerAnswer {
  canAcceptOrder: boolean;
  serviceCity?: string;
  certificationPassed?: boolean;
  blockedReason?: string;
  nextStep: string;
  walletWired: boolean;
}

export interface WorkflowState {
  stateId: string;
  label: string;
  source: WorkflowStateSource;
  terminal?: boolean;
  customerAnswer?: WorkflowCustomerAnswer;
  workerAnswer?: WorkflowWorkerAnswer;
}

export interface WorkflowActionContract {
  actionId: string;
  label: string;
  enabled: boolean;
  disabledReasonCode: WorkflowDisabledReason | null;
  source: WorkflowActionSource;
  danger: boolean;
  confirmRequired: boolean;
  idempotencyRequired: boolean;
  auditRequired: boolean;
  cityScopeRequired: boolean;
  endpoint?: string;
  method?: WorkflowHttpMethod;
}

export interface WorkflowFacingCopy {
  title: string;
  body?: string;
  primaryCta?: string;
  secondaryCta?: string;
}

export interface WorkflowFigmaBinding {
  kind: WorkflowFigmaBindingKind;
  frameName?: string;
  nodeId?: string;
  localPng?: string;
  notes?: string;
}

export interface WorkflowNotWiredPolicy {
  reasonCode: WorkflowDisabledReason;
  userCopy: string;
  allowedUi: "empty" | "read-only-shell" | "disabled-action" | "guardrail";
  forbiddenClaims: string[];
  allowedActions: WorkflowActionContract[];
}

export interface WorkflowRuntimeThemeTokens {
  activeThemeId: "default" | "customer-default" | "worker-default" | "admin-default" | string;
  source: "default" | "cityConfig" | "adminConfig" | "remoteConfig" | "localFallback";
  affects: "visual-only";
  tokenRefs: string[];
}

export interface WorkflowUiBinding {
  workflowName: string;
  actor: WorkflowActor;
  route: string;
  backendSource: WorkflowBackendSource;
  state: WorkflowState;
  availableActions: WorkflowActionContract[];
  disabledReasons: WorkflowDisabledReason[];
  customerFacingCopy?: WorkflowFacingCopy;
  workerFacingCopy?: WorkflowFacingCopy;
  uiSlots: WorkflowUiSlot[];
  figmaBinding: WorkflowFigmaBinding;
  packagesUiComponents: string[];
  runtimeThemeTokens: WorkflowRuntimeThemeTokens;
  notWiredPolicy?: WorkflowNotWiredPolicy;
}
