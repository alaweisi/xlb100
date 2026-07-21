import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const customerRoutePages = [
  ["home", "CustomerHomePage.tsx"],
  ["services", "CustomerServicesPage.tsx"],
  ["createOrder", "CustomerOrderCreatePage.tsx"],
  ["orders", "CustomerOrdersPage.tsx"],
  ["aftersale", "CustomerAfterSalePage.tsx"],
  ["support", "CustomerSupportPage.tsx"],
  ["notifications", "CustomerNotificationsPage.tsx"],
  ["coupons", "CustomerCouponsPage.tsx"],
  ["profile", "CustomerProfilePage.tsx"],
] as const;

describe("customer route shell coverage", () => {
  it.each(customerRoutePages)("keeps the %s route inside CustomerRouteShell", (route, fileName) => {
    const source = readFileSync(resolve("apps/customer/src/pages", fileName), "utf8");
    expect(source).toContain("<CustomerRouteShell");
    expect(source).toContain(`currentRoute="${route}"`);
  });
});
