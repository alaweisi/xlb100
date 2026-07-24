import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const featureRoot = path.resolve(
  process.cwd(),
  "apps/customer/src/features/coupons",
);

function featureSource(): string {
  return fs.readdirSync(featureRoot)
    .filter((file) => /\.(?:ts|tsx|css)$/u.test(file))
    .map((file) => fs.readFileSync(path.join(featureRoot, file), "utf8"))
    .join("\n");
}

describe("Customer Coupon Wallet GAP-04 boundaries", () => {
  it("does not consume forbidden Customer projection or Admin definition facts", () => {
    const source = featureSource();
    for (const forbiddenAccess of [
      ".faceValueMinor",
      ".minSpendMinor",
      ".couponDefinition.name",
      ".marketingCampaign.name",
      "listCouponDefinitions(",
      "getCouponDefinition(",
      "createAdminMarketingApi",
    ]) {
      expect(source).not.toContain(forbiddenAccess);
    }
  });

  it("does not persist coupon or decision business facts in localStorage", () => {
    const source = featureSource();
    expect(source).not.toMatch(/localStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/sessionStorage\s*\.\s*setItem/u);
    expect(source).not.toMatch(/JSON\s*\.\s*stringify\s*\(\s*(?:grant|decision)/u);
  });

  it("keeps operational Manifest forbidden and route assembly out of the slice", () => {
    const source = featureSource();
    expect(source).toContain('operationalManifest: "forbidden"');
    expect(source).toContain('guards: ["session", "city", "protected-route"]');
    expect(source).not.toContain("CustomerFeatureRouteRegistry().register(");
    expect(source).not.toContain("App.tsx");
  });

  it("uses only the seven formal grant states", () => {
    const source = featureSource();
    for (const status of [
      "granted",
      "available",
      "reserved",
      "redeemed",
      "released",
      "expired",
      "revoked",
    ]) {
      expect(source).toContain(`"${status}"`);
    }
    expect(source).not.toContain('"unused"');
    expect(source).not.toContain('"saved"');
  });
});
