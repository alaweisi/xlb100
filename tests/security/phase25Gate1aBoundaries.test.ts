import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("Phase 25 Gate 1A token-contract boundaries", () => {
  it("passes the executable Gate 1A boundary and no-new-hardcodes gate", () => {
    const output = execFileSync("node", ["scripts/check-phase25-gate1a.mjs"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(output).toContain("[phase25-gate1a] PASS");
  }, 15_000);

  it("keeps page, backend, database, API-client, and App-root integration blocked", () => {
    const gate = source("scripts/check-phase25-gate1a.mjs");

    for (const boundary of [
      '"apps/"',
      '"backend/"',
      '"db/"',
      '"packages/api-client/"',
      '"packages/ui/src/tokens/"',
      "ThemeProvider",
      "RuntimeThemeEnvelope",
      "resolveThemeTokens",
      "migration 054",
    ]) {
      expect(gate).toContain(boundary);
    }
  });

  it("uses a machine-readable, non-increasing hardcode baseline", () => {
    const inventory = source(
      "docs/design/ui/phase25/PHASE25_GATE1A_HARDCODE_INVENTORY.md",
    );
    const match = inventory.match(
      /<!-- PHASE25_HARDCODE_BASELINE_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- PHASE25_HARDCODE_BASELINE_END -->/,
    );

    expect(match).not.toBeNull();
    const baseline = JSON.parse(match![1]) as Record<string, Record<string, number>>;
    expect(Object.keys(baseline)).toEqual(["customer", "worker", "admin"]);
    for (const counters of Object.values(baseline)) {
      expect(Object.values(counters).every(Number.isInteger)).toBe(true);
      expect(Object.values(counters).every((value) => value >= 0)).toBe(true);
    }

    const actual = JSON.parse(
      execFileSync("node", ["scripts/check-phase25-gate1a.mjs", "--print-hardcodes"], {
        cwd: root,
        encoding: "utf8",
      }),
    ) as Record<string, Record<string, number>>;
    for (const app of Object.keys(actual)) {
      for (const category of Object.keys(actual[app])) {
        expect(actual[app][category]).toBeLessThanOrEqual(baseline[app][category]);
      }
    }
  });
});
