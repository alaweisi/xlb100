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
const featureRoot = join(root, "apps/customer/src/features/review");

function featureSource(): string {
  return readdirSync(featureRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx|css)$/u.test(entry.name))
    .map((entry) => readFileSync(join(featureRoot, entry.name), "utf8"))
    .join("\n");
}

describe("Customer CSL-14 Review security boundaries", () => {
  const source = featureSource();

  it("uses only the formal Customer API client and never bypasses actor/city scope", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain("/api/internal/");
    expect(source).not.toContain("/api/admin/");
    expect(source).not.toContain("/api/worker/");
    expect(source).toContain("customerApi.forClient");
    expect(source).toContain('"x-xlb-city-code"');
    expect(source).toContain("shell.expireSession()");
  });

  it("does not persist review, appeal, visibility or PII facts locally", () => {
    expect(source).not.toMatch(/localStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/sessionStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(
      /\bconsole\.(?:log|info|warn|error|debug)\b/u,
    );
    expect(source).not.toContain("navigator.clipboard");
    expect(source).not.toContain("customerId}");
    expect(source).not.toContain("workerId}");
    expect(source).not.toContain("fulfillmentId}");
  });

  it("keeps operational Manifest forbidden and final route assembly out of the slice", () => {
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
    expect(app).not.toContain("customerReviewFeatureRouteModule");
    expect(app).not.toContain("CustomerReviewRoute");
  });

  it("never infers visibility or advances appeal status in the frontend", () => {
    expect(source).toContain('"pending_moderation"');
    expect(source).toContain('"visible"');
    expect(source).toContain('"hidden"');
    expect(source).toContain('"open"');
    expect(source).toContain('"upheld"');
    expect(source).toContain('"rejected"');
    expect(source).toContain('"withdrawn"');
    expect(source).not.toMatch(/visibility\s*:\s*"visible"/u);
    expect(source).not.toMatch(/status\s*:\s*"upheld"/u);
    expect(source).not.toMatch(/status\s*:\s*"rejected"/u);
    expect(source).not.toMatch(/status\s*:\s*"withdrawn"/u);
  });
});
