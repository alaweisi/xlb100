import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = process.cwd();

describe("Phase11 historical Customer/Worker boundary", () => {
  it("accepts the committed Unit A tree through exact later-UI authorization", () => {
    expect(runPowerShellGate("check-phase11-forbidden-zone.ps1")).toContain(
      "check-phase11-forbidden-zone: passed",
    );
    expect(runPowerShellGate("check-phase12-forbidden-zone.ps1")).toContain(
      "check-phase12-forbidden-zone: passed",
    );
  }, 20_000);

  it("rejects unauthorized Customer/Worker files and broad paths", () => {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(root, "scripts", "check-phase11-forbidden-zone.ps1"),
        "-SelfTest",
      ],
      { cwd: root, encoding: "utf8", timeout: 20_000, windowsHide: true },
    );

    expect(output).toContain("exact Unit A authorization passed");
    expect(output).toContain("unauthorized Customer/Worker files rejected");
    expect(output).toContain("broad paths rejected");
  });

  it("keeps a machine-readable exact-file manifest with no wildcard entries", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "governance", "phase11-later-ui-authorizations.json"), "utf8"),
    ) as {
      schemaVersion: number;
      policy: string;
      authorizations: Array<{
        authorizationId: string;
        decision: string;
        scope: string;
        requiredPhaseStates: Array<{ phaseId: string; status: string; tag: string }>;
        files: string[];
      }>;
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.policy).toBe("phase11-later-ui-exact-file-authorization");
    expect(manifest.authorizations).toHaveLength(4);
    expect(manifest.authorizations[0]).toMatchObject({
      authorizationId: "unit-a-customer-ui-gate-remediation",
      decision: "human-approved",
      scope: "post-phase11-ui-only",
      requiredPhaseStates: [
        {
          phaseId: "Phase 14",
          status: "ENGINEERING REMEDIATION LOCKED / PRODUCTION BLOCKED",
          tag: "xlb-stage5-engineering-remediation-v1",
        },
        {
          phaseId: "Phase 25",
          status: "LOCKED",
          tag: "xlb-phase25-ui-standardization-v1.0",
        },
      ],
    });
    const authorizationIds = manifest.authorizations.map(({ authorizationId }) => authorizationId);
    const authorizedFiles = manifest.authorizations.flatMap(({ files }) => files);
    expect(new Set(authorizationIds).size).toBe(authorizationIds.length);
    expect(new Set(authorizedFiles).size).toBe(authorizedFiles.length);
    for (const authorization of manifest.authorizations) {
      expect(authorization).toMatchObject({
        decision: "human-approved",
        scope: "post-phase11-ui-only",
      });
      expect(authorization.files.length).toBeGreaterThan(0);
      expect(authorization.files.length).toBeLessThanOrEqual(16);
      expect(authorization.requiredPhaseStates.length).toBeGreaterThan(0);
    }
    expect(authorizedFiles).toEqual(
      expect.arrayContaining([
        "apps/customer/package.json",
        "apps/customer/src/pages/CustomerHomePage.tsx",
        "apps/customer/src/pages/CustomerOrdersPage.tsx",
        "apps/customer/src/pages/CustomerServicesPage.tsx",
        "apps/customer/src/pages/customer-order-create.css",
        "apps/customer/index.html",
        "apps/customer/public/manifest.webmanifest",
        "apps/worker/index.html",
        "apps/worker/public/icons/worker-icon-192.svg",
        "apps/worker/public/manifest.webmanifest",
        "apps/worker/src/pages/TaskPages.tsx",
      ]),
    );
    expect(JSON.stringify(manifest)).not.toMatch(/[?*]/);
  });
});
