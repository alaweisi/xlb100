import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkPhase25Readiness } from "./check-phase25-readiness-gates.mjs";

const reportPaths = [
  "docs/reports/PHASE25_GATE6_OA_READINESS_REPORT.md",
  "docs/reports/PHASE25_GATE7_DASHBOARD_READINESS_REPORT.md",
];

function writeFixtureFile(root, path, content = "") {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function createFixture(currentState, runtimeApps = []) {
  const root = mkdtempSync(join(tmpdir(), "xlb-phase25-readiness-"));
  writeFixtureFile(root, "docs/CURRENT_STATE.md", currentState);
  for (const report of reportPaths) {
    writeFixtureFile(root, report, "## Result: BLOCKED\n");
  }
  for (const app of ["oa", "dashboard"]) {
    writeFixtureFile(root, `apps/${app}/README.md`, `# ${app}\n`);
    writeFixtureFile(root, `apps/${app}/package.json`, "{}\n");
    if (runtimeApps.includes(app)) {
      writeFixtureFile(root, `apps/${app}/src/App.tsx`, "export {};\n");
      writeFixtureFile(root, `apps/${app}/design-qa.md`, "`passed`\n");
    }
  }
  return root;
}

test("keeps Phase 25 placeholder applications blocked before later authorization", () => {
  const root = createFixture("| Phase 25 | LOCKED |\n");
  try {
    assert.deepEqual(checkPhase25Readiness(root), [
      "oa=readiness-blocked",
      "dashboard=readiness-blocked",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts OA and Dashboard runtimes after their later completion states", () => {
  const root = createFixture(
    "| OA v1 | COMPLETE — LOCAL |\n| Dashboard v1 | LOCKED |\n",
    ["oa", "dashboard"],
  );
  try {
    assert.deepEqual(checkPhase25Readiness(root), ["oa=authorized", "dashboard=authorized"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("still rejects runtime construction for an application without authorization", () => {
  const root = createFixture("| Dashboard v1 | LOCKED |\n", ["oa", "dashboard"]);
  try {
    assert.throws(
      () => checkPhase25Readiness(root),
      /oa runtime is forbidden before readiness approval/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
