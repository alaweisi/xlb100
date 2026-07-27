import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const trackedRoots = [
  "apps",
  "backend",
  "packages",
  "db",
  "infra",
  "deploy",
  "tests",
  "docs",
  "scripts",
] as const;

const trackedPathPattern = new RegExp(
  `["']((?:${trackedRoots.join("|")})[\\\\/][^"'\\\`$*?]+?\\.(?:ts|tsx|js|mjs|cjs|json|sql|md|ps1|yml|yaml))["']`,
  "g",
);

function powerShellFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return powerShellFiles(path);
    return entry.isFile() && entry.name.endsWith(".ps1") ? [path] : [];
  });
}

describe("PowerShell gate tracked paths", () => {
  it("uses exact Git-tracked path casing on every platform", () => {
    const root = process.cwd();
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: root,
      encoding: "utf8",
    })
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((path) => path.replaceAll("\\", "/"));
    const actualByFoldedPath = new Map(
      tracked.map((path) => [path.toLocaleLowerCase("en-US"), path]),
    );
    const mismatches: string[] = [];

    for (const file of powerShellFiles(join(root, "scripts"))) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(trackedPathPattern)) {
        const candidate = match[1]?.replaceAll("\\", "/");
        if (!candidate) continue;
        const actual = actualByFoldedPath.get(
          candidate.toLocaleLowerCase("en-US"),
        );
        if (actual && actual !== candidate) {
          mismatches.push(
            `${relative(root, file).replaceAll("\\", "/")}: ${candidate} should be ${actual}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
