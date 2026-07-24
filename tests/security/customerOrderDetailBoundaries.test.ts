import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = process.cwd();
const files = [
  "CustomerOrderDetailTypes.ts",
  "CustomerOrderDetailCoordinator.ts",
  "CustomerOrderDetailActionController.ts",
  "CustomerOrderDetailComponents.tsx",
  "CustomerOrderDetailComponentRegistry.tsx",
  "CustomerOrderDetailTemplate.tsx",
  "CustomerOrderDetailRoute.tsx",
  "customerOrderDetailModule.ts",
  "customer-order-detail.css",
];
const source = files
  .map((file) => readFileSync(
    join(root, "apps/customer/src/features/orders", file),
    "utf8",
  ))
  .join("\n");

describe("Customer Order Detail source boundaries", () => {
  it("uses formal Customer APIs without local or mock business facts", () => {
    expect(source).toContain("this.#api.getOrder(orderId)");
    expect(source).toContain("this.#api.getOrderFulfillmentEvidence(orderId)");
    expect(source).toContain("this.#api.listOrderReverseRequests(orderId)");
    expect(source).toContain("this.#api.listAftersaleComplaints(orderId)");
    expect(source).toContain("this.#api.getOrderReview(orderId)");
    expect(source).not.toMatch(/\blocalStorage\b|\bsessionStorage\b/u);
    expect(source).not.toMatch(/mockPaySuccess|payments\/mock-webhook/u);
  });

  it("does not create payments, refunds, reverse requests, complaints or reviews", () => {
    expect(source).not.toMatch(
      /createPaymentOrder|createRefundRequest|createOrderReverseRequest|createAftersaleComplaint|createOrderReview/u,
    );
    expect(source).not.toMatch(
      /setOrderStatus|markPaid|approveRefund|approveComplaint/u,
    );
  });

  it("never consumes object keys, storage URIs or unsafe media schemes", () => {
    expect(source).not.toMatch(
      /mediaAsset\.storage\.(?:objectKey|storageUri)/u,
    );
    expect(source).toContain('url.protocol !== "https:"');
    expect(source).toContain("allowedOrigins.includes(url.origin)");
    expect(source).toContain("GAP-11");
  });

  it("keeps pending_payment unreachable and Manifest forbidden", () => {
    expect(source).toContain("GAP-10");
    expect(source).toContain('operationalManifest: "forbidden"');
    expect(source).toContain('guards: ["session", "city", "protected-route"]');
    expect(source).not.toMatch(
      /status\s*[:=]\s*["']pending_payment["']/u,
    );
  });

  it("keeps responsive safety and 44px touch targets", () => {
    const css = readFileSync(
      join(
        root,
        "apps/customer/src/features/orders/customer-order-detail.css",
      ),
      "utf8",
    );
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (max-width: 340px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
