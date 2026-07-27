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

  it("constructs absolute file URIs portably", () => {
    const nonPortable: string[] = [];

    for (const file of powerShellFiles(join(process.cwd(), "scripts"))) {
      const content = readFileSync(file, "utf8");
      if (/\(\[System\.Uri\]\$[A-Za-z]\w*\)\.AbsoluteUri/u.test(content)) {
        nonPortable.push(relative(process.cwd(), file).replaceAll("\\", "/"));
      }
    }

    expect(nonPortable).toEqual([]);
  });

  it("does not invoke Windows-only node command shims", () => {
    const nonPortable: string[] = [];

    for (const file of powerShellFiles(join(process.cwd(), "scripts"))) {
      const content = readFileSync(file, "utf8");
      if (/node_modules[\\/]\.bin[\\/][^"'\\\s]+\.cmd/u.test(content)) {
        nonPortable.push(relative(process.cwd(), file).replaceAll("\\", "/"));
      }
    }

    expect(nonPortable).toEqual([]);
  });

  it("uses the cross-platform system temp path API", () => {
    const nonPortable: string[] = [];

    for (const file of powerShellFiles(join(process.cwd(), "scripts"))) {
      const content = readFileSync(file, "utf8");
      if (/\$env:TEMP\b/u.test(content)) {
        nonPortable.push(relative(process.cwd(), file).replaceAll("\\", "/"));
      }
    }

    expect(nonPortable).toEqual([]);
  });

  it("does not resolve bare workspace imports from a system temp runner", () => {
    const nonPortable: string[] = [];
    const systemTempRunner =
      /\$RunnerPath\s*=\s*Join-Path\s+(?:\$env:TEMP|\(\[System\.IO\.Path\]::GetTempPath\(\)\))/u;

    for (const file of powerShellFiles(join(process.cwd(), "scripts"))) {
      const content = readFileSync(file, "utf8");
      if (/import\(["']@xlb\//u.test(content) && systemTempRunner.test(content)) {
        nonPortable.push(relative(process.cwd(), file).replaceAll("\\", "/"));
      }
    }

    expect(nonPortable).toEqual([]);
  });

  it("uses portable executable names in active preflight gates", () => {
    const root = process.cwd();
    const preflight = readFileSync(
      join(root, "scripts/preflight-architecture.ps1"),
      "utf8",
    );
    const gateNames = [
      ...preflight.matchAll(/Invoke-PreflightGate\s+["']([^"']+)["']/gu),
    ]
      .map((match) => match[1])
      .filter((name): name is string => Boolean(name));
    const nonPortable: string[] = [];

    for (const name of gateNames) {
      const content = readFileSync(join(root, "scripts", name), "utf8");
      if (/\b(?:git|node|pnpm|pnpx|npx)\.(?:exe|cmd)\b/iu.test(content)) {
        nonPortable.push(name);
      }
    }

    expect(nonPortable).toEqual([]);
  });

  it("keeps pre-migration Phase 9D and 9E gates database-independent", () => {
    for (const gate of [
      "check-phase9d-no-backend-db-ui.ps1",
      "check-phase9e-no-backend-db.ps1",
    ]) {
      const content = readFileSync(
        join(process.cwd(), "scripts", gate),
        "utf8",
      );

      expect(content).toContain("operatorHeadersWithoutCity");
      expect(content).not.toContain("expectOkJson");
      expect(content).not.toContain("expected: [200]");
    }
  });
});
