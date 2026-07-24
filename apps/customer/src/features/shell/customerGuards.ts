import {
  defineCustomerGuardAssembly,
  type CustomerGuardAssembly,
  type CustomerRouteGuardContext,
  type CustomerRouteGuardDecision,
  type CustomerSliceGuardKey,
} from "../../platform/slices/index.js";

function hasCustomerActor(context: CustomerRouteGuardContext): boolean {
  if (context.session.status !== "authenticated") return false;
  const actor = context.session.actor as {
    readonly appType?: unknown;
    readonly role?: unknown;
    readonly userId?: unknown;
  };
  return actor.appType === "customer" &&
    actor.role === "customer" &&
    typeof actor.userId === "string" &&
    actor.userId.length > 0;
}

export function createCustomerEntryGuardAssembly(): Readonly<CustomerGuardAssembly> {
  return defineCustomerGuardAssembly({
    session: {
      kind: "session",
      evaluate(context) {
        if (context.session.status === "anonymous") {
          return {
            outcome: "redirect",
            route: "/auth/login",
            reason: "session_required",
          };
        }
        return hasCustomerActor(context)
          ? { outcome: "allow" }
          : { outcome: "deny", reason: "wrong_actor" };
      },
    },
    city: {
      kind: "city",
      evaluate(context) {
        if (!hasCustomerActor(context)) {
          return context.session.status === "anonymous"
            ? {
                outcome: "redirect",
                route: "/auth/login",
                reason: "session_required",
              }
            : { outcome: "deny", reason: "wrong_actor" };
        }
        return context.city.status === "resolved"
          ? { outcome: "allow" }
          : {
              outcome: "redirect",
              route: "/location",
              reason: "city_required",
            };
      },
    },
    protectedRoute: {
      kind: "protected-route",
      evaluate(context) {
        if (context.session.status === "anonymous") {
          return {
            outcome: "redirect",
            route: "/auth/login",
            reason: "session_required",
          };
        }
        return hasCustomerActor(context)
          ? { outcome: "allow" }
          : { outcome: "deny", reason: "wrong_actor" };
      },
    },
  });
}

export async function evaluateCustomerGuardPlan(
  guards: readonly CustomerSliceGuardKey[],
  context: CustomerRouteGuardContext,
  assembly = createCustomerEntryGuardAssembly(),
): Promise<CustomerRouteGuardDecision> {
  for (const guard of guards) {
    const evaluator = guard === "session"
      ? assembly.session
      : guard === "city"
        ? assembly.city
        : assembly.protectedRoute;
    const decision = await evaluator.evaluate(context);
    if (decision.outcome !== "allow") return decision;
  }
  return { outcome: "allow" };
}
