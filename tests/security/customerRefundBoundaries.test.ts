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
const featureRoot = join(root, "apps/customer/src/features/refund");

function featureSource(): string {
  return readdirSync(featureRoot, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() && /\.(?:ts|tsx|css)$/u.test(entry.name)
    )
    .map((entry) => readFileSync(join(featureRoot, entry.name), "utf8"))
    .join("\n");
}

describe("Customer CSL-12 Refund security boundaries", () => {
  const source = featureSource();
  const components = readFileSync(
    join(featureRoot, "refundComponents.tsx"),
    "utf8",
  );

  it("uses only formal Customer order-read and refund-create APIs", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain("/api/internal/");
    expect(source).not.toContain("/api/admin/");
    expect(source).not.toContain("/api/worker/");
    expect(source).not.toContain("mockPaySuccess");
    expect(source).not.toContain("approveRefund");
    expect(source).toContain("customerApi.forClient");
    expect(source).toContain('"x-xlb-city-code"');
    expect(source).toContain("getOrder");
    expect(source).toContain("createRefundRequest");
    expect(source).not.toMatch(
      /\b(?:get|list)(?:Customer)?Refund(?:Request|Requests)?\b/u,
    );
  });

  it("keeps the L1 route, guards and Manifest boundary fixed", () => {
    expect(source).toContain('id: "CSL-12"');
    expect(source).toContain('templateId: "CustomerRefundTemplate"');
    expect(source).toContain('routePatterns: ["/orders/:orderId/refund"]');
    expect(source).toContain(
      'guards: ["session", "city", "protected-route"]',
    );
    expect(source).toContain('operationalManifest: "forbidden"');
    expect(source).not.toContain("CustomerFeatureRouteRegistry().register(");
    expect(source).not.toContain("App.tsx");
    const app = readFileSync(
      join(root, "apps/customer/src/app/App.tsx"),
      "utf8",
    );
    expect(app).not.toContain("customerRefundFeatureRouteModule");
    expect(app).not.toContain("CustomerRefundRoute");
  });

  it("does not persist, log or locally recover refund facts", () => {
    expect(source).not.toMatch(/localStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/sessionStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/\bindexedDB\b/u);
    expect(source).not.toMatch(
      /\bconsole\.(?:log|info|warn|error|debug)\b/u,
    );
    expect(source).not.toContain("navigator.clipboard");
    expect(source).not.toContain("RefundTimeline");
    expect(source).not.toContain("refund-history");
  });

  it("keeps amount immutable and the request body free of an amount field", () => {
    expect(components).not.toMatch(
      /<(?:input|textarea)[^>]*(?:name|id)=["'][^"']*amount/iu,
    );
    expect(components).not.toMatch(/onAmountChange/u);
    expect(source).toContain("amount is intentionally absent");
    expect(source).toContain("Full-refund authority stays on the server");
    expect(source).not.toMatch(/order\.totalAmount\s*[-+*/]/u);
    expect(source).not.toMatch(/refund\.amount\s*=/u);
  });

  it("does not render admin identity, Customer PII or an internal approval action", () => {
    expect(components).not.toContain("approvedByAdminId");
    expect(components).not.toContain("customerId");
    expect(components).not.toContain("contactPhone");
    expect(components).not.toContain("detailAddress");
    expect(components).not.toMatch(
      /\b(?:approveRefund|onApprove|approveRequest)\b/u,
    );
    expect(components).not.toContain("审核按钮");
  });

  it("preserves actor, city and response-schema checks before display", () => {
    expect(source).toContain("refundRequestSchema.safeParse");
    expect(source).toContain("parsed.data.customerId !== scope.actorId");
    expect(source).toContain("parsed.data.cityCode !== scope.cityCode");
    expect(source).toContain("parsedRefund.data.customerId !== scope.actorId");
    expect(source).toContain("parsedRefund.data.cityCode !== scope.cityCode");
    expect(source).toContain("shell.expireSession()");
  });

  it("documents GAP-03 honestly without claiming payout or refund completion", () => {
    expect(components).toContain("Customer 当前没有退款 GET、列表或状态查询 API");
    expect(components).toContain("只在内存保留");
    expect(components).toContain("不代表款项到账或退款已经完成");
    expect(components).not.toContain("退款成功");
    expect(components).not.toContain("已到账");
  });

  it("keeps the approved Customer palette, xlb100 logo seam and mobile targets", () => {
    expect(source.toLowerCase()).toContain("#cfeff0");
    expect(source.toLowerCase()).toContain("#ff6a00");
    expect(source.toLowerCase()).toContain("#1f2d2d");
    expect(source).toContain("<BrandLogo");
    expect(source).toContain("2.75rem");
    expect(source).toContain("@media (max-width: 360px)");
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
