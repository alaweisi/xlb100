import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REQUIRED_ENGINEERING_IDS = ["ENG-001", "ENG-002", "ENG-003", "ENG-004", "ENG-005"];
const BLOCKING_STATUSES = new Set(["BLOCKED_INTERNAL", "BLOCKED_EXTERNAL", "NOT_RUN"]);
const ALLOWED_STATUSES = new Set([
  "PASS",
  "BLOCKED_INTERNAL",
  "BLOCKED_EXTERNAL",
  "NOT_RUN",
  "DEFERRED",
]);

export function validateReadinessMatrix(matrix, options = {}) {
  const root = options.root ?? process.cwd();
  const fileExists = options.fileExists ?? existsSync;
  const errors = [];

  if (!matrix || typeof matrix !== "object") return ["matrix must be an object"];
  if (matrix.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (matrix.stage !== "REPAIR_STAGE_5") errors.push("stage must be REPAIR_STAGE_5");

  const decisions = matrix.decisions ?? {};
  if (decisions.engineeringAudit !== "PASS_WITH_BLOCKERS") {
    errors.push("engineeringAudit must truthfully remain PASS_WITH_BLOCKERS");
  }
  if (decisions.localPreproductionSimulation !== "PASS") {
    errors.push("localPreproductionSimulation must be PASS");
  }
  if (decisions.stagingRelease !== "NO_GO" || decisions.productionRelease !== "NO_GO") {
    errors.push("stagingRelease and productionRelease must remain NO_GO while blockers exist");
  }
  if (decisions.productionActivationAllowed !== false) {
    errors.push("productionActivationAllowed must be false");
  }

  const evidence = Array.isArray(matrix.evidence) ? matrix.evidence : [];
  const ids = new Set();
  for (const item of evidence) {
    if (!item?.id || ids.has(item.id)) {
      errors.push(`evidence id is missing or duplicated: ${item?.id ?? "<missing>"}`);
      continue;
    }
    ids.add(item.id);
    if (!ALLOWED_STATUSES.has(item.status)) {
      errors.push(`${item.id} has unsupported status ${item.status}`);
    }
    if (item.category === "engineering" && item.status !== "PASS") {
      errors.push(`${item.id} engineering evidence must be PASS`);
    }
    if (item.evidencePath) {
      const normalized = item.evidencePath.replaceAll("\\", "/");
      if (normalized.endsWith("/audit_report.md") || normalized === "audit_report.md") {
        errors.push(`${item.id} must not depend on ignored audit_report.md`);
      }
      if (!fileExists(path.resolve(root, item.evidencePath))) {
        errors.push(`${item.id} evidence path does not exist: ${item.evidencePath}`);
      }
    }
  }

  for (const id of REQUIRED_ENGINEERING_IDS) {
    if (!ids.has(id)) errors.push(`required engineering evidence is missing: ${id}`);
  }

  const blockers = evidence.filter(item => BLOCKING_STATUSES.has(item.status));
  if (blockers.length === 0) errors.push("at least one truthful production blocker is required");
  if (blockers.length > 0 && decisions.productionRelease === "GO") {
    errors.push("productionRelease cannot be GO while blockers exist");
  }

  return errors;
}

function verifyStage4Ancestry(matrix, root) {
  const commit = matrix?.baseline?.stage4Commit;
  if (!commit) return "baseline.stage4Commit is required";
  const result = spawnSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status === 0) return null;
  return `Stage 4 baseline is not an ancestor of HEAD: ${commit}`;
}

export function runAudit(options = {}) {
  const root = options.root ?? process.cwd();
  const matrixPath = path.resolve(
    root,
    options.matrixPath ?? "docs/release/STAGE5_ENGINEERING_READINESS_MATRIX.json",
  );
  const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
  const errors = validateReadinessMatrix(matrix, { root });
  const ancestryError = verifyStage4Ancestry(matrix, root);
  if (ancestryError) errors.push(ancestryError);

  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`[stage5] FAIL ${error}\n`);
    return { ok: false, matrix, errors };
  }

  const blockers = matrix.evidence.filter(item => BLOCKING_STATUSES.has(item.status));
  process.stdout.write(
    `[stage5] audit matrix valid: ${matrix.evidence.length} items, ${blockers.length} blockers\n`,
  );
  return { ok: true, matrix, blockers };
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const modeIndex = process.argv.indexOf("--mode");
  const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : "audit";
  const result = runAudit();
  if (!result.ok) process.exit(1);

  if (mode === "release") {
    process.stderr.write("[stage5] PRODUCTION_NO_GO: unresolved blockers prevent release\n");
    for (const blocker of result.blockers) {
      process.stderr.write(`[stage5] ${blocker.id} ${blocker.status}: ${blocker.summary}\n`);
    }
    process.exit(2);
  }
  if (mode !== "audit") {
    process.stderr.write(`[stage5] unsupported mode: ${mode}\n`);
    process.exit(1);
  }

  process.stdout.write("[stage5] ENGINEERING_AUDIT_READY / PRODUCTION_NO_GO\n");
}
