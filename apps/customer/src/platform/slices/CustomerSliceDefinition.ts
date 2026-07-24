import {
  CUSTOMER_SLICE_COMMON_STATE_KINDS,
  type CustomerSliceCommonStateKind,
} from "./sliceState.js";
import type {
  CustomerOrchestrationPolicy,
  OrchestrationLevel,
} from "./orchestration.js";

export type CustomerSliceId = `CSL-${number}`;
export type CustomerTemplateId = `${string}Template`;
export type CustomerRoutePattern = "/" | `/${string}`;
export type CustomerSliceGuardKey = "session" | "city" | "protected-route";

export interface CustomerSliceDefinition<
  TLevel extends OrchestrationLevel = OrchestrationLevel,
> {
  readonly id: CustomerSliceId;
  readonly featureId: string;
  readonly routePatterns: readonly CustomerRoutePattern[];
  readonly orchestration: Extract<CustomerOrchestrationPolicy, { readonly level: TLevel }>;
  readonly templateId: CustomerTemplateId;
  readonly guards: readonly CustomerSliceGuardKey[];
  readonly commonStates: readonly CustomerSliceCommonStateKind[];
}

export type CustomerSliceDefinitionInput<
  TLevel extends OrchestrationLevel,
> = Omit<CustomerSliceDefinition<TLevel>, "commonStates">;

const ROUTE_PATTERN =
  /^\/(?:[a-z][a-z0-9-]*|:[a-z][a-zA-Z0-9]*)(?:\/(?:[a-z][a-z0-9-]*|:[a-z][a-zA-Z0-9]*))*$/u;
const FEATURE_ID = /^[a-z][a-z0-9-]*$/u;

function assertRoutePattern(pattern: CustomerRoutePattern): void {
  if (pattern === "/") return;
  if (!ROUTE_PATTERN.test(pattern)) {
    throw new Error(`Invalid Customer route pattern: ${pattern}`);
  }
  if (pattern === "/customer" || pattern.startsWith("/customer/")) {
    throw new Error(`Legacy Customer route prefix is forbidden: ${pattern}`);
  }
}

function assertGuardPlan(guards: readonly CustomerSliceGuardKey[]): void {
  if (new Set(guards).size !== guards.length) {
    throw new Error("Customer slice guard plan contains duplicates");
  }
  if (guards.includes("protected-route") && !guards.includes("session")) {
    throw new Error("A protected Customer route must also require the session guard");
  }
  if (guards.includes("city") && !guards.includes("session")) {
    throw new Error("A city-scoped Customer route must also require the session guard");
  }
}

export function defineCustomerSlice<TLevel extends OrchestrationLevel>(
  input: CustomerSliceDefinitionInput<TLevel>,
): CustomerSliceDefinition<TLevel> {
  if (!/^CSL-\d{2}$/u.test(input.id)) {
    throw new Error(`Invalid Customer slice id: ${input.id}`);
  }
  if (!FEATURE_ID.test(input.featureId)) {
    throw new Error(`Invalid Customer feature id: ${input.featureId}`);
  }
  if (input.routePatterns.length === 0) {
    throw new Error(`Customer slice ${input.id} must own at least one route`);
  }
  if (new Set(input.routePatterns).size !== input.routePatterns.length) {
    throw new Error(`Customer slice ${input.id} contains duplicate route patterns`);
  }
  input.routePatterns.forEach(assertRoutePattern);
  assertGuardPlan(input.guards);

  return Object.freeze({
    ...input,
    routePatterns: Object.freeze([...input.routePatterns]),
    guards: Object.freeze([...input.guards]),
    commonStates: CUSTOMER_SLICE_COMMON_STATE_KINDS,
  });
}
