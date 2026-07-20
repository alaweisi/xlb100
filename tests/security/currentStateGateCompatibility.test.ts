import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const helper = join(root, "scripts", "lib", "current-state.ps1");

function verifyPhase14(state: string) {
  const encoded = Buffer.from(state, "utf8").toString("base64");
  return spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `. '${helper}'; $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); Assert-XlbPhase14ProductionBlocked -CurrentStateText $text | Out-Null`,
    ],
    { encoding: "utf8", timeout: 15_000, windowsHide: true },
  );
}

function verifyPhaseStatus(state: string, phaseId: string, allowedStatuses: string[]) {
  const encoded = Buffer.from(state, "utf8").toString("base64");
  const allowed = allowedStatuses.map((status) => `'${status.replaceAll("'", "''")}'`).join(",");
  return spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `. '${helper}'; $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $entry=Get-XlbPhaseTableEntry -CurrentStateText $text -PhaseId '${phaseId}'; Assert-XlbPhaseStatusIn -Entry $entry -AllowedStatuses @(${allowed}) | Out-Null`,
    ],
    { encoding: "utf8", timeout: 15_000, windowsHide: true },
  );
}

describe("CURRENT_STATE Phase 14 compatibility gate", () => {
  it.each([
    ["legacy", "| Phase 14 | IN PROGRESS | - | readiness |\nstaging/production `NO-GO`"],
    ["remediated", "| Phase 14 | ENGINEERING REMEDIATION LOCKED / PRODUCTION BLOCKED | tag | readiness |"],
  ])("accepts the production-blocked %s state", (_label, state) => {
    const result = verifyPhase14(state);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it.each([
    ["ready", "| Phase 14 | READY | tag | readiness |"],
    ["locked pending", "| Phase 14 | ENGINEERING REMEDIATION LOCKED_PENDING / PRODUCTION BLOCKED | tag | readiness |"],
    ["contradictory ready", "| Phase 14 | ENGINEERING REMEDIATION LOCKED / PRODUCTION BLOCKED / PRODUCTION READY | tag | readiness |"],
    ["unrelated no-go with production go", "| Phase 14 | IN PROGRESS | - | readiness |\nhistorical item remains NO-GO\nstaging/production `GO`"],
    ["missing", "| Phase 13 | COMPLETE | tag | readiness |"],
    ["duplicate", "| Phase 14 | IN PROGRESS | - | readiness |\n| Phase 14 | IN PROGRESS | - | duplicate |\nNO-GO"],
  ])("fails closed for a %s state", (_label, state) => {
    const result = verifyPhase14(state);
    expect(result.status).not.toBe(0);
  });

  it("uses exact Phase status allowlists instead of LOCKED substrings", () => {
    const locked = "| Phase 27 | LOCKED | tag | notifications |";
    expect(verifyPhaseStatus(locked, "Phase 27", ["LOCKED"]).status).toBe(0);

    for (const status of ["INTEGRATED_UNLOCKED", "LOCKED_PENDING", "NOT LOCKED"]) {
      const result = verifyPhaseStatus(
        `| Phase 27 | ${status} | tag | notifications |`,
        "Phase 27",
        ["LOCKED"],
      );
      expect(result.status, status).not.toBe(0);
    }
  });
});
