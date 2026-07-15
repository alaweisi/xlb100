import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

type CommandResult = { status: number; output: string };

const repositoryRoot = process.cwd();
const fixturePrefix = resolve(tmpdir(), "xlb-lean-governance-");
const disposableRoots: string[] = [];

function run(command: string, args: string[], cwd: string): CommandResult {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function git(root: string, ...args: string[]): CommandResult {
  return run("git", args, root);
}

function powershell(root: string, ...args: string[]): CommandResult {
  return run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], root);
}

function write(root: string, relativePath: string, content: string): void {
  const destination = join(root, relativePath);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  writeFileSync(destination, content, "utf8");
}

function createFixture(): string {
  const root = mkdtempSync(fixturePrefix);
  disposableRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, ".githooks"), { recursive: true });

  copyFileSync(join(repositoryRoot, "scripts/check-lean-risk.ps1"), join(root, "scripts/check-lean-risk.ps1"));
  copyFileSync(join(repositoryRoot, "scripts/check-migration-integrity.ps1"), join(root, "scripts/check-migration-integrity.ps1"));
  copyFileSync(join(repositoryRoot, ".githooks/pre-commit"), join(root, ".githooks/pre-commit"));
  chmodSync(join(root, ".githooks/pre-commit"), 0o755);

  write(root, "docs/CURRENT_STATE.md", "| Phase 29 | LOCKED | xlb-test-lock | fixture |\n");
  write(root, "db/migrations/000_init.sql", "CREATE TABLE fixture_table (id INT PRIMARY KEY);\n");
  write(root, "README.md", "fixture\n");

  expect(git(root, "init").status).toBe(0);
  expect(git(root, "config", "user.name", "XLB Governance Test").status).toBe(0);
  expect(git(root, "config", "user.email", "governance-test@example.invalid").status).toBe(0);
  expect(git(root, "add", ".").status).toBe(0);
  expect(git(root, "commit", "--no-verify", "-m", "fixture baseline").status).toBe(0);
  expect(git(root, "tag", "xlb-test-lock").status).toBe(0);
  expect(git(root, "config", "core.hooksPath", ".githooks").status).toBe(0);
  return root;
}

function dispose(root: string): void {
  const resolved = resolve(root);
  if (!resolved.startsWith(fixturePrefix) || resolved === fixturePrefix) {
    throw new Error(`refusing to delete non-fixture path: ${resolved}`);
  }
  if (existsSync(resolved)) rmSync(resolved, { recursive: true, force: true });
  const index = disposableRoots.indexOf(root);
  if (index >= 0) disposableRoots.splice(index, 1);
}

afterEach(() => {
  for (const root of [...disposableRoots]) dispose(root);
});

describe("lean governance executable behavior", () => {
  it("1. allows an ordinary file through the real pre-commit hook", () => {
    const root = createFixture();
    write(root, "apps/customer/src/ordinaryPage.tsx", "export const ordinary = true;\n");
    expect(git(root, "add", ".").status).toBe(0);

    const committed = git(root, "commit", "-m", "test ordinary change");

    expect(committed.status, committed.output).toBe(0);
    expect(committed.output).toContain("LEAN_RISK ordinary");
  });

  it("2. blocks a sensitive path and prints the Human approval request", () => {
    const root = createFixture();
    write(root, "backend/src/payment/paymentService.ts", "export const sensitive = true;\n");
    expect(git(root, "add", ".").status).toBe(0);

    const committed = git(root, "commit", "-m", "test sensitive change");

    expect(committed.status).not.toBe(0);
    expect(committed.output).toContain("HIGH_RISK path=backend/src/payment/paymentService.ts rule=MONEY");
    expect(committed.output).toContain("HIGH_RISK_CONFIRMATION_REQUIRED");
  });

  it("3. blocks a duplicate migration number", () => {
    const root = createFixture();
    write(root, "db/migrations/000_duplicate.sql", "SELECT 1;\n");
    expect(git(root, "add", ".").status).toBe(0);

    const committed = git(root, "commit", "-m", "test duplicate migration");

    expect(committed.status).not.toBe(0);
    expect(committed.output).toContain("duplicate migration number 000");
  });

  it("4. blocks rewrite and deletion of a locked migration", () => {
    const rewriteRoot = createFixture();
    write(rewriteRoot, "db/migrations/000_init.sql", "CREATE TABLE rewritten (id INT PRIMARY KEY);\n");
    expect(git(rewriteRoot, "add", ".").status).toBe(0);
    const rewritten = git(rewriteRoot, "commit", "-m", "test locked migration rewrite");
    expect(rewritten.status).not.toBe(0);
    expect(rewritten.output).toContain("published migration cannot be rewritten");

    const deletionRoot = createFixture();
    rmSync(join(deletionRoot, "db/migrations/000_init.sql"));
    expect(git(deletionRoot, "add", "-u").status).toBe(0);
    const deleted = git(deletionRoot, "commit", "-m", "test locked migration deletion");
    expect(deleted.status).not.toBe(0);
    expect(deleted.output).toContain("published migration cannot be deleted or renamed");
  });

  it("5. accepts one natural-language approval for later commits on the same paths", () => {
    const root = createFixture();
    const sensitivePath = "backend/src/payment/paymentService.ts";
    write(root, sensitivePath, "export const version = 1;\n");
    expect(git(root, "add", ".").status).toBe(0);
    expect(git(root, "commit", "-m", "must block before approval").status).not.toBe(0);

    const approved = powershell(
      root,
      "-File",
      "scripts/check-lean-risk.ps1",
      "-Action",
      "Approve",
      "-DiffMode",
      "WorkingTree",
      "-Confirmation",
      "continue",
    );
    expect(approved.status, approved.output).toBe(0);
    expect(approved.output).toContain("HIGH_RISK_APPROVAL_RECORDED");

    const firstCommit = git(
      root,
      "commit",
      "-m",
      "test approved high-risk change",
      "-m",
      "XLB-High-Risk-Approval: Human said continue",
    );
    expect(firstCommit.status, firstCommit.output).toBe(0);
    expect(firstCommit.output).toContain("HIGH_RISK_APPROVED");

    write(root, sensitivePath, "export const version = 2;\n");
    expect(git(root, "add", ".").status).toBe(0);
    const secondCommit = git(root, "commit", "-m", "test same approved batch path again");
    expect(secondCommit.status, secondCommit.output).toBe(0);
    expect(secondCommit.output).toContain("HIGH_RISK_APPROVED");

    const approvalLog = readFileSync(join(root, ".git/xlb-high-risk-approvals.jsonl"), "utf8").trim().split(/\r?\n/);
    expect(approvalLog).toHaveLength(1);
  });
});
