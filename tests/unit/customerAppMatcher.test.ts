import { describe, expect, it } from "vitest";
import { matchCustomerRoute } from "../../apps/customer/src/routes/customerRouteMatcher.js";

describe("Customer App route matcher", () => {
  it("matches exact static and dynamic segments with static precedence", () => {
    expect(matchCustomerRoute("/service")?.route).toMatchObject({
      pattern: "/service",
      params: {},
    });
    expect(matchCustomerRoute("/service/safe-id")?.route).toMatchObject({
      pattern: "/service/:skuId",
      params: { skuId: "safe-id" },
    });
    expect(matchCustomerRoute("/profile/addresses/new")?.route.pattern)
      .toBe("/profile/addresses/new");
    expect(matchCustomerRoute("/profile/addresses/address-7/edit")?.route.params)
      .toEqual({ addressId: "address-7" });
    expect(matchCustomerRoute("/profile/addresses/new/edit")?.route.pattern)
      .toBe("/profile/addresses/:addressId/edit");
  });

  it("constructs decoded params and untrusted string query values", () => {
    const match = matchCustomerRoute(
      "/orders/order%20safe",
      "?view=active&amount=999&role=admin&view=last",
    );

    expect(match?.route).toEqual({
      pathname: "/orders/order%20safe",
      pattern: "/orders/:orderId",
      params: { orderId: "order safe" },
      query: {
        view: "last",
        amount: "999",
        role: "admin",
      },
    });
  });

  it("rejects malformed, encoded-separator and non-exact paths as not-found", () => {
    for (const pathname of [
      "/orders/%",
      "/orders/%2Fadmin",
      "/orders/%5Cadmin",
      "/orders/..",
      "/orders//safe",
      "/orders/safe/",
      "/orders/safe/extra",
      "/customer/orders",
      "https://evil.example/orders",
    ]) {
      expect(matchCustomerRoute(pathname)).toBeNull();
    }
  });
});
