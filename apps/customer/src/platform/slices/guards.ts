import type { CityCode } from "@xlb/types";

export type CustomerSessionSnapshot =
  | {
      readonly status: "anonymous";
    }
  | {
      readonly status: "authenticated";
      readonly actor: {
        readonly appType: "customer";
        readonly role: "customer";
        readonly userId: string;
      };
    };

export type CustomerCitySnapshot =
  | {
      readonly status: "unresolved";
    }
  | {
      readonly status: "resolved";
      readonly cityCode: CityCode;
    };

export interface CustomerRouteGuardContext {
  readonly sliceId: string;
  readonly pathname: string;
  readonly safeReturnUrl: string;
  readonly routeParams: Readonly<Record<string, string>>;
  readonly session: CustomerSessionSnapshot;
  readonly city: CustomerCitySnapshot;
}

export type CustomerRouteGuardDecision =
  | {
      readonly outcome: "allow";
    }
  | {
      readonly outcome: "redirect";
      readonly route: "/auth/login" | "/location";
      readonly reason: "session_required" | "city_required";
    }
  | {
      readonly outcome: "deny";
      readonly reason: "wrong_actor" | "forbidden" | "not_found";
    };

export interface CustomerSessionGuard {
  readonly kind: "session";
  evaluate(
    context: CustomerRouteGuardContext,
  ): CustomerRouteGuardDecision | Promise<CustomerRouteGuardDecision>;
}

export interface CustomerCityGuard {
  readonly kind: "city";
  evaluate(
    context: CustomerRouteGuardContext,
  ): CustomerRouteGuardDecision | Promise<CustomerRouteGuardDecision>;
}

export interface CustomerProtectedRouteGuard {
  readonly kind: "protected-route";
  evaluate(
    context: CustomerRouteGuardContext,
  ): CustomerRouteGuardDecision | Promise<CustomerRouteGuardDecision>;
}

export interface CustomerGuardAssembly {
  readonly session: CustomerSessionGuard;
  readonly city: CustomerCityGuard;
  readonly protectedRoute: CustomerProtectedRouteGuard;
}

export function defineCustomerGuardAssembly(
  assembly: CustomerGuardAssembly,
): Readonly<CustomerGuardAssembly> {
  if (assembly.session.kind !== "session") {
    throw new Error("Customer guard assembly requires a session guard");
  }
  if (assembly.city.kind !== "city") {
    throw new Error("Customer guard assembly requires a city guard");
  }
  if (assembly.protectedRoute.kind !== "protected-route") {
    throw new Error("Customer guard assembly requires a protected-route guard");
  }
  return Object.freeze({ ...assembly });
}
