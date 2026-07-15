import assert from "node:assert/strict";
import test from "node:test";
import {
  advisoriesAtOrAbove,
  buildBulkPayload,
  bulkAdvisoryUrl,
  collectDependencyVersions,
} from "./audit-dependencies.mjs";

test("collects and deduplicates installed dependency versions", () => {
  const versions = collectDependencyVersions([
    {
      dependencies: {
        alpha: {
          version: "1.0.0",
          dependencies: { beta: { version: "2.0.0" } },
        },
      },
      devDependencies: { alpha: { version: "1.1.0" } },
    },
  ]);

  assert.deepEqual(buildBulkPayload(versions), {
    alpha: ["1.0.0", "1.1.0"],
    beta: ["2.0.0"],
  });
});

test("filters advisories at the configured severity and deduplicates ids", () => {
  const response = {
    alpha: [
      { id: 1, severity: "high", title: "high advisory" },
      { id: 2, severity: "critical", title: "critical advisory" },
    ],
    beta: [{ id: 2, severity: "critical", title: "duplicate advisory" }],
  };

  assert.equal(advisoriesAtOrAbove(response, "critical").length, 1);
  assert.equal(advisoriesAtOrAbove(response, "high").length, 2);
});

test("builds the npm Bulk Advisory endpoint without losing registry paths", () => {
  assert.equal(
    bulkAdvisoryUrl("https://registry.example.test/npm"),
    "https://registry.example.test/npm/-/npm/v1/security/advisories/bulk",
  );
});
