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
const featureRoot = join(root, "apps/customer/src/features/aftersale");

function featureSource(): string {
  return readdirSync(featureRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx|css)$/u.test(entry.name))
    .map((entry) => readFileSync(join(featureRoot, entry.name), "utf8"))
    .join("\n");
}

describe("Customer CSL-13 Aftersale security boundaries", () => {
  const source = featureSource();

  it("uses only formal Customer APIs with actor and city scope", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain("/api/internal/");
    expect(source).not.toContain("/api/admin/");
    expect(source).not.toContain("/api/worker/");
    expect(source).toContain("customerApi.forClient");
    expect(source).toContain('"x-xlb-city-code"');
    expect(source).toContain("scope.actorId");
    expect(source).toContain("scope.cityCode");
    expect(source).toContain("shell.expireSession()");
  });

  it("does not persist aftersale, identity, amount or timeline facts locally", () => {
    expect(source).not.toMatch(/localStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/sessionStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/\bconsole\.(?:log|info|warn|error|debug)\b/u);
    expect(source).not.toContain("navigator.clipboard");
    expect(source).not.toContain("actorId}");
    expect(source).not.toContain("customerId}");
    expect(source).not.toContain("workerId}");
    expect(source).not.toContain("assignedAdminId}");
  });

  it("keeps operational Manifest forbidden and final route assembly outside the slice", () => {
    expect(source).toContain('operationalManifest: "forbidden"');
    expect(source).toContain(
      'guards: ["session", "city", "protected-route"]',
    );
    expect(source).not.toContain("CustomerFeatureRouteRegistry().register(");
    expect(source).not.toContain("App.tsx");
    const app = readFileSync(
      join(root, "apps/customer/src/app/App.tsx"),
      "utf8",
    );
    expect(app).not.toContain("customerAftersaleFeatureRouteModule");
    expect(app).not.toContain("CustomerAftersaleRoute");
  });

  it("never implements refund or advances protected domain status locally", () => {
    expect(source).not.toContain("createRefundRequest");
    expect(source).not.toContain("/api/aftersale/refunds");
    expect(source).not.toMatch(/complaint\s*:\s*\{[^}]*status\s*:/su);
    expect(source).not.toMatch(/order\s*:\s*\{[^}]*status\s*:/su);
    expect(source).not.toContain("payment");
    expect(source).not.toContain("ledger");
    expect(source).not.toContain("settlement");
  });

  it("locks GAP-12 to compensation intent and not_executed", () => {
    expect(source).toContain('providerExecutionStatus === "not_executed"');
    expect(source).toContain("补偿意向 · 尚未执行");
    expect(source).toContain("Provider 执行状态：尚未执行");
    expect(source).not.toContain("providerExecutionStatus: \"executed\"");
    expect(source).not.toContain("到账");
    expect(source).not.toContain("退款成功");
    expect(source).not.toContain("赔付完成");
  });

  it("filters non-customer notes and never projects raw actor or payload fields", () => {
    expect(source).toContain('event.actorType !== "customer"');
    expect(source).toContain("requesterVisibleAftersaleTimeline");
    expect(source).not.toContain("payload: event.payload");
    expect(source).not.toContain("actorId: event.actorId");
  });
});
