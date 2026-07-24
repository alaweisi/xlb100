import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = process.cwd();
const featureRoot = join(
  root,
  "apps/customer/src/features/payment",
);
const sourceFiles = [
  "CustomerPaymentTypes.ts",
  "CustomerPaymentActionController.ts",
  "CustomerPaymentComponents.tsx",
  "CustomerPaymentComponentRegistry.tsx",
  "CustomerPaymentTemplate.tsx",
  "CustomerPaymentRoute.tsx",
  "customerPaymentModule.ts",
  "index.ts",
];
const source = sourceFiles
  .map((file) => readFileSync(join(featureRoot, file), "utf8"))
  .join("\n");

describe("Customer Payment source boundaries", () => {
  it("keeps every payment API, mock provider and realtime path unreachable", () => {
    expect(source).not.toMatch(
      /@xlb\/api-client|createPaymentOrder|mockPaySuccess|payments\/orders|payments\/mock-webhook/u,
    );
    expect(source).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|setInterval/u,
    );
  });

  it("does not persist, infer or render sensitive payment facts", () => {
    expect(source).not.toMatch(
      /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u,
    );
    expect(source).not.toMatch(
      /\bPaymentOrder\b|\bproviderTradeNo\b|\bamount\b|\bcurrency\b/u,
    );
    expect(source).not.toMatch(
      /支付成功|重试支付|模拟支付|付款成功/u,
    );
  });

  it("declares the fixed protected route and the open GAP-02 boundary", () => {
    expect(source).toContain('routePatterns: ["/payment/:paymentOrderId"]');
    expect(source).toContain('operationalManifest: "forbidden"');
    expect(source).toContain(
      'guards: ["session", "city", "protected-route"]',
    );
    expect(source).toContain('"blocked_by_gap_02"');
    expect(source).toContain('capability: CUSTOMER_PAYMENT_CAPABILITY');
  });

  it("allows the controller to navigate only to the order center", () => {
    const controller = readFileSync(
      join(featureRoot, "CustomerPaymentActionController.ts"),
      "utf8",
    );
    expect(controller).toContain('route: "/orders"');
    expect(controller).not.toMatch(
      /\/orders\/\$\{|\/payment\/|openRoute|window\.location/u,
    );
  });

  it("uses the approved responsive shell and accessible touch targets", () => {
    const css = readFileSync(
      join(featureRoot, "customer-payment.css"),
      "utf8",
    );
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 340px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
