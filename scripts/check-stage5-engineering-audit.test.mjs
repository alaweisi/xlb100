import assert from "node:assert/strict";
import test from "node:test";
import { validateReadinessMatrix } from "./check-stage5-engineering-audit.mjs";

function fixture() {
  return {
    schemaVersion: 1,
    stage: "REPAIR_STAGE_5",
    decisions: {
      engineeringAudit: "PASS_WITH_BLOCKERS",
      localPreproductionSimulation: "PASS",
      stagingRelease: "NO_GO",
      productionRelease: "NO_GO",
      productionActivationAllowed: false,
    },
    evidence: [
      ...["ENG-001", "ENG-002", "ENG-003", "ENG-004", "ENG-005"].map(id => ({
        id,
        category: "engineering",
        status: "PASS",
        evidencePath: `evidence/${id}.md`,
      })),
      {
        id: "EXT-001",
        category: "external_blocker",
        status: "BLOCKED_EXTERNAL",
        summary: "external prerequisite is unavailable",
      },
    ],
  };
}

const options = { root: "C:/fixture", fileExists: () => true };

test("accepts a truthful engineering-pass production-no-go matrix", () => {
  assert.deepEqual(validateReadinessMatrix(fixture(), options), []);
});

test("rejects production activation while blockers remain", () => {
  const matrix = fixture();
  matrix.decisions.productionRelease = "GO";
  matrix.decisions.productionActivationAllowed = true;
  assert.match(validateReadinessMatrix(matrix, options).join("\n"), /NO_GO|false|cannot be GO/u);
});

test("rejects missing required engineering evidence", () => {
  const matrix = fixture();
  matrix.evidence = matrix.evidence.filter(item => item.id !== "ENG-004");
  assert.match(validateReadinessMatrix(matrix, options).join("\n"), /ENG-004/u);
});

test("rejects ignored third-party audit evidence", () => {
  const matrix = fixture();
  matrix.evidence[0].evidencePath = "audit_report.md";
  assert.match(validateReadinessMatrix(matrix, options).join("\n"), /must not depend/u);
});
