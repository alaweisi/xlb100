import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const registryPath = join(root, "docs", "governance", "phase-registry.json");
const currentStatePath = join(root, "docs", "CURRENT_STATE.md");
const migrationsDir = join(root, "db", "migrations");

const allowedStatuses = new Set([
  "LOCKED",
  "EXITED",
  "COMPLETE_UNTAGGED",
  "NOT_IMPLEMENTED",
  "HISTORICAL_INCOMPLETE",
  "INTEGRATED_UNLOCKED",
  "SUPERSEDED",
  "RESERVED",
]);

function fail(message) {
  process.stderr.write(`[phase-governance] FAIL ${message}\n`);
  process.exitCode = 1;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (!existsSync(registryPath)) {
  fail("missing docs/governance/phase-registry.json");
} else {
  const registry = readJson(registryPath);
  const phases = Array.isArray(registry.phases) ? registry.phases : [];
  const ids = new Set();
  const tags = new Set(git(["tag", "-l", "xlb-phase*"]).split(/\r?\n/).filter(Boolean));

  if (registry.nextFormalPhase !== "Phase 25") {
    fail(`expected nextFormalPhase to be Phase 25, got ${registry.nextFormalPhase}`);
  }

  if (registry.lastLockedPhase !== "Phase 24F") {
    fail(`expected lastLockedPhase to be Phase 24F, got ${registry.lastLockedPhase}`);
  }

  if (!registry.rules?.doNotReuseMigration024) {
    fail("registry must permanently reserve migration 024");
  }

  if (!registry.migrationNumbering?.reservedPermanentGaps?.includes("024")) {
    fail("registry migrationNumbering.reservedPermanentGaps must include 024");
  }

  for (const phase of phases) {
    if (!phase.id || ids.has(phase.id)) {
      fail(`duplicate or missing phase id: ${phase.id ?? "(missing)"}`);
      continue;
    }
    ids.add(phase.id);

    if (!allowedStatuses.has(phase.status)) {
      fail(`${phase.id} has unsupported status ${phase.status}`);
    }

    if (phase.status === "LOCKED") {
      if (!phase.tag) {
        fail(`${phase.id} is LOCKED but has no tag`);
      } else if (!tags.has(phase.tag)) {
        fail(`${phase.id} references missing tag ${phase.tag}`);
      }
    }
  }

  for (const required of ["Phase 9F", "Phase 12", "Phase 13", "Phase 14", "Phase 15", "Phase 16", "Phase 24F"]) {
    if (!ids.has(required)) {
      fail(`registry missing required historical entry ${required}`);
    }
  }

  const phase9f = phases.find(phase => phase.id === "Phase 9F");
  if (phase9f?.status !== "NOT_IMPLEMENTED") {
    fail("Phase 9F must remain NOT_IMPLEMENTED");
  }

  const phase15 = phases.find(phase => phase.id === "Phase 15");
  if (phase15?.status !== "INTEGRATED_UNLOCKED") {
    fail("Phase 15 must remain INTEGRATED_UNLOCKED");
  }
}

if (existsSync(migrationsDir)) {
  const forbidden024 = readdirSync(migrationsDir).filter(name => /^024[_-].*\.sql$/i.test(name));
  if (forbidden024.length > 0) {
    fail(`migration 024 is reserved but files exist: ${forbidden024.join(", ")}`);
  }
}

if (existsSync(currentStatePath)) {
  const currentState = readFileSync(currentStatePath, "utf8");
  if (!currentState.includes("xlb-phase24-customer-support-closure")) {
    fail("CURRENT_STATE.md must reference the Phase 24 closure tag");
  }
  if (/Phase 25\s*\|\s*(LOCKED|IN PROGRESS|COMPLETE)/i.test(currentState)) {
    fail("Phase 25 must not be entered by the Phase 24 governance closeout");
  }
}

const closureTarget = git(["rev-list", "-n", "1", "xlb-phase24-customer-support-closure"]);
const mainHead = git(["rev-parse", "main"]);
try {
  git(["merge-base", "--is-ancestor", closureTarget, mainHead]);
} catch {
  fail("Phase 24 closure tag must be reachable from current main");
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

process.stdout.write("[phase-governance] PASS Phase registry, historical gaps, migration 024, and Phase 24 closure tag verified\n");
