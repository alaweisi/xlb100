import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const accountRoot = join(root, "apps/customer/src/features/account");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(?:ts|tsx)$/u.test(path));
}

describe("Customer CSL-19 Profile security boundaries", () => {
  const sources = sourceFiles(accountRoot)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  it("does not bypass the API client, log PII, or persist Profile facts locally", () => {
    expect(sources).not.toMatch(/\bfetch\s*\(/u);
    expect(sources).not.toMatch(
      /\bconsole\.(?:log|info|warn|error|debug)\b/u,
    );
    expect(sources).not.toMatch(
      /localStorage\.(?:setItem|removeItem)\s*\(/u,
    );
    expect(sources).not.toMatch(
      /sessionStorage\.(?:setItem|removeItem)\s*\(/u,
    );
    expect(sources).not.toContain("navigator.clipboard");
    expect(sources).not.toContain("/api/internal/");
    expect(sources).not.toContain("/api/worker/");
    expect(sources).not.toContain("/api/admin/");
  });

  it("does not expose avatar upload or operational Manifest control", () => {
    expect(sources).not.toMatch(/uploadAvatar|avatar\.upload|avatar-upload/u);
    expect(sources).not.toContain("input type=\"file\"");
    expect(sources).not.toContain('operationalManifest: "sdui"');
    expect(sources).not.toContain('operationalManifest: "limited"');
    expect(sources).toContain('operationalManifest: "forbidden"');
  });

  it("calls the B1A session lifecycle for both logout and 401 expiry", () => {
    expect(sources).toContain("shell.logout()");
    expect(sources).toContain("shell.expireSession()");
    expect(sources).not.toContain('removeItem("xlb.customer.token")');
    expect(sources).not.toContain("clearCustomerScopedBrowserCaches");
  });

  it("owns only the account feature directory and does not assemble App routes", () => {
    expect(sources).toContain(
      'ownedDirectories: ["apps/customer/src/features/account"]',
    );
    const app = readFileSync(
      join(root, "apps/customer/src/app/App.tsx"),
      "utf8",
    );
    expect(app).not.toContain("customerProfileRouteModule");
    expect(app).not.toContain("CustomerProfileRoute");
  });
});
