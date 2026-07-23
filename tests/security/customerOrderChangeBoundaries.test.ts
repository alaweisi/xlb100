import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = process.cwd();
const featureRoot = join(
  root,
  "apps/customer/src/features/order-change",
);

function featureSource(): string {
  return readdirSync(featureRoot, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() && /\.(?:ts|tsx|css)$/u.test(entry.name)
    )
    .map((entry) => readFileSync(join(featureRoot, entry.name), "utf8"))
    .join("\n");
}

describe("Customer CSL-11 Order Change security boundaries", () => {
  const source = featureSource();

  it("uses only the formal Customer API client with session and city scope", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain("/api/internal/");
    expect(source).not.toContain("/api/admin/");
    expect(source).not.toContain("/api/worker/");
    expect(source).toContain("customerApi.forClient");
    expect(source).toContain('"x-xlb-city-code"');
    expect(source).toContain("shell.expireSession()");
    expect(source).toContain("getOrder");
    expect(source).toContain("listOrderReverseRequests");
    expect(source).toContain("createOrderReverseRequest");
  });

  it("does not persist or log order, reverse, PII or idempotency facts", () => {
    expect(source).not.toMatch(/localStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/sessionStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(
      /\bconsole\.(?:log|info|warn|error|debug)\b/u,
    );
    expect(source).not.toContain("navigator.clipboard");
    expect(source).not.toContain("detailAddress}");
    expect(source).not.toContain("contactPhone}");
    expect(source).not.toContain("customerId}");
    expect(source).not.toContain("idempotencyKey}");
  });

  it("keeps L1 Manifest forbidden and final route assembly out of scope", () => {
    expect(source).toContain('operationalManifest: "forbidden"');
    expect(source).toContain(
      'guards: ["session", "city", "protected-route"]',
    );
    expect(source).toContain('routePatterns: ["/orders/:orderId/change"]');
    expect(source).not.toContain("CustomerFeatureRouteRegistry().register(");
    expect(source).not.toContain("App.tsx");
    const app = readFileSync(
      join(root, "apps/customer/src/app/App.tsx"),
      "utf8",
    );
    expect(app).not.toContain("customerOrderChangeFeatureRouteModule");
    expect(app).not.toContain("CustomerOrderChangeRoute");
  });

  it("allows only formal reverse types and never mutates order state locally", () => {
    for (const value of [
      '"cancel"',
      '"reschedule"',
      '"reassign"',
      '"requested"',
      '"approved"',
      '"rejected"',
      '"applied"',
    ]) {
      expect(source).toContain(value);
    }
    expect(source).not.toMatch(
      /(?:setOrderStatus|markPaid|approveRefund|approveComplaint)\s*\(/u,
    );
    expect(source).not.toMatch(
      /order\s*:\s*\{[^}]*status\s*:/su,
    );
    expect(source).toContain("fulfillment_start_fact_missing");
  });
});
