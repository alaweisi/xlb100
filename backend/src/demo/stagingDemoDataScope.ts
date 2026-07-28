import {
  INVESTOR_DEMO_IDENTITIES,
  type RequestContext,
} from "@xlb/types";

export type InvestorDemoDataScope = Readonly<{
  cityCode: typeof INVESTOR_DEMO_IDENTITIES.cityCode;
  customerId: typeof INVESTOR_DEMO_IDENTITIES.customer.id;
  workerId: typeof INVESTOR_DEMO_IDENTITIES.worker.id;
  adminId: typeof INVESTOR_DEMO_IDENTITIES.admin.id;
}>;

const INVESTOR_DEMO_SCOPE: InvestorDemoDataScope = Object.freeze({
  cityCode: INVESTOR_DEMO_IDENTITIES.cityCode,
  customerId: INVESTOR_DEMO_IDENTITIES.customer.id,
  workerId: INVESTOR_DEMO_IDENTITIES.worker.id,
  adminId: INVESTOR_DEMO_IDENTITIES.admin.id,
});

/**
 * Demo scope is carried by the signed token and then preserved in RequestContext.
 * Entity access is constrained by immutable ownership relationships, never by UI
 * state or by city scope alone.
 */
export function investorDemoDataScope(
  context: RequestContext,
): InvestorDemoDataScope | null {
  return context.demo === "investor" ? INVESTOR_DEMO_SCOPE : null;
}

export function assertInvestorDemoIdentityScope(context: RequestContext): void {
  const scope = investorDemoDataScope(context);
  if (!scope) return;
  const expectedUserId = context.appType === "customer"
    ? scope.customerId
    : context.appType === "worker"
      ? scope.workerId
      : context.appType === "admin"
        ? scope.adminId
        : null;
  if (
    !expectedUserId
    || context.userId !== expectedUserId
    || context.cityCode !== scope.cityCode
  ) {
    throw new Error("staging demo token identity/data scope mismatch");
  }
}

export function investorDemoCustomerId(
  context: RequestContext,
): string | null {
  const scope = investorDemoDataScope(context);
  if (!scope) return null;
  assertInvestorDemoIdentityScope(context);
  return scope.customerId;
}

export function investorDemoWorkerId(
  context: RequestContext,
): string | null {
  const scope = investorDemoDataScope(context);
  if (!scope) return null;
  assertInvestorDemoIdentityScope(context);
  return scope.workerId;
}
