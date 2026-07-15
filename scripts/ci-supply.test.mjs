import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => readFileSync(path.join(rootDir, relativePath), "utf8");

test("all hosted workflows use frozen pnpm installs", () => {
  const workflowsDir = path.join(rootDir, ".github", "workflows");
  const workflowFiles = readdirSync(workflowsDir).filter(file => /\.ya?ml$/.test(file));

  for (const file of workflowFiles) {
    const workflow = read(path.relative(rootDir, path.join(workflowsDir, file)));
    for (const installLine of workflow.matchAll(/run:\s+pnpm install([^\r\n]*)/g)) {
      assert.match(installLine[1], /--frozen-lockfile/, `${file} must use a frozen lockfile`);
    }
  }
});

test("main CI enforces lint, the canonical test runner, and dependency audit", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /run: pnpm lint/);
  assert.match(workflow, /run: pnpm test\s*$/m);
  assert.match(workflow, /run: pnpm audit:critical/);
});

test("security workflow provisions runtime dependencies before the focused suite", () => {
  const workflow = read(".github/workflows/security-scope-check.yml");
  assert.match(workflow, /mysql:\s*\n\s+image: mysql:8/);
  assert.match(workflow, /redis:\s*\n\s+image: redis:7/);
  assert.match(workflow, /src\/dal\/migrateCli\.ts/);
  assert.match(workflow, /src\/dal\/seedCli\.ts/);
  assert.match(workflow, /run: pnpm test:security/);
});

test("contract workflow runs the executable contract gate", () => {
  const workflow = read(".github/workflows/contract-check.yml");
  const compatibilityWrapper = read("scripts/check-contracts.ps1");
  assert.match(workflow, /run: pnpm check:contracts/);
  assert.match(compatibilityWrapper, /node scripts\/check-contracts\.mjs/);
  assert.doesNotMatch(compatibilityWrapper, /placeholder/i);
});

test("critical audit uses the Bulk Advisory implementation", () => {
  const manifest = JSON.parse(read("package.json"));
  assert.equal(
    manifest.scripts["audit:critical"],
    "node scripts/audit-dependencies.mjs --audit-level critical",
  );
});
