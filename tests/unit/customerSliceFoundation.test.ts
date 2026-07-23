import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ORCHESTRATION_LEVELS,
  CUSTOMER_SLICE_COMMON_STATE_KINDS,
  CustomerTemplateRegistry,
  defineCustomerGuardAssembly,
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerGuardAssembly,
  type CustomerL1TemplateProps,
  type CustomerTemplateRegistration,
} from "../../apps/customer/src/platform/slices/index.js";

const FixedTemplate = (_props: CustomerL1TemplateProps) => null;

function fixedSlice() {
  return defineCustomerSlice({
    id: "CSL-07",
    featureId: "checkout",
    routePatterns: ["/checkout/:skuId"],
    orchestration: orchestrationPolicy("L1"),
    templateId: "CustomerCheckoutStepperTemplate",
    guards: ["session", "city", "protected-route"],
  });
}

describe("Customer B0 slice foundation", () => {
  it("defines the three orchestration levels and shared boundary states", () => {
    expect(CUSTOMER_ORCHESTRATION_LEVELS).toEqual(["L1", "L2", "L3"]);
    expect(CUSTOMER_SLICE_COMMON_STATE_KINDS).toEqual([
      "loading",
      "empty",
      "error",
      "conflict",
      "unavailable",
    ]);
    expect(orchestrationPolicy("L1")).toEqual({
      level: "L1",
      operationalManifest: "forbidden",
    });
    expect(orchestrationPolicy("L2")).toEqual({
      level: "L2",
      operationalManifest: "limited",
    });
    expect(orchestrationPolicy("L3")).toEqual({
      level: "L3",
      operationalManifest: "sdui",
    });
  });

  it("creates an immutable slice definition with the common state contract", () => {
    const slice = fixedSlice();

    expect(slice.id).toBe("CSL-07");
    expect(slice.commonStates).toBe(CUSTOMER_SLICE_COMMON_STATE_KINDS);
    expect(Object.isFrozen(slice)).toBe(true);
    expect(Object.isFrozen(slice.routePatterns)).toBe(true);
    expect(Object.isFrozen(slice.guards)).toBe(true);
  });

  it("rejects legacy routes and incomplete protected guard plans", () => {
    expect(() => defineCustomerSlice({
      id: "CSL-05",
      featureId: "service",
      routePatterns: ["/customer/service"],
      orchestration: orchestrationPolicy("L2"),
      templateId: "CustomerDiscoveryTemplate",
      guards: ["session"],
    })).toThrow(/Legacy Customer route prefix/);

    expect(() => defineCustomerSlice({
      id: "CSL-10",
      featureId: "orders",
      routePatterns: ["/orders/:orderId"],
      orchestration: orchestrationPolicy("L1"),
      templateId: "CustomerOrderDetailTemplate",
      guards: ["protected-route"],
    })).toThrow(/session guard/);
  });

  it("registers sealed bundled templates and matches slice orchestration", () => {
    const registry = new CustomerTemplateRegistry()
      .register({
        templateId: "CustomerCheckoutStepperTemplate",
        orchestrationLevel: "L1",
        operationalManifest: "forbidden",
        component: FixedTemplate,
      })
      .seal();

    expect(registry.resolveForSlice(fixedSlice())?.orchestrationLevel).toBe("L1");
    expect(registry.list()).toEqual(["CustomerCheckoutStepperTemplate"]);
    expect(() => registry.register({
      templateId: "CustomerPaymentTemplate",
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
      component: FixedTemplate,
    })).toThrow(/sealed/);
  });

  it("rejects an operational Manifest policy on an L1 transaction template", () => {
    const invalid = {
      templateId: "CustomerPaymentTemplate",
      orchestrationLevel: "L1",
      operationalManifest: "sdui",
      component: FixedTemplate,
    } as unknown as CustomerTemplateRegistration;

    expect(() => new CustomerTemplateRegistry().register(invalid)).toThrow(
      /invalid orchestration policy/,
    );
  });

  it("exposes explicit Session, City and Protected Route guard seams", () => {
    const allow = () => ({ outcome: "allow" as const });
    const assembly: CustomerGuardAssembly = {
      session: { kind: "session", evaluate: allow },
      city: { kind: "city", evaluate: allow },
      protectedRoute: { kind: "protected-route", evaluate: allow },
    };

    const result = defineCustomerGuardAssembly(assembly);

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.session.kind).toBe("session");
    expect(result.city.kind).toBe("city");
    expect(result.protectedRoute.kind).toBe("protected-route");
  });
});
