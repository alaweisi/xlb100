import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkSurfaceConstitution, SURFACES } from "./check-app-surface-constitution.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("five product surfaces have stable, non-overlapping carriers", () => {
  assert.deepEqual(Object.keys(SURFACES), ["customer", "worker", "admin", "oa", "dashboard"]);
  assert.equal(SURFACES.admin.kind, "mobile-app");
  assert.equal(SURFACES.oa.kind, "desktop-web");
  assert.equal(SURFACES.dashboard.kind, "wallboard");
});

test("repository satisfies the five-surface constitution", () => {
  const result = checkSurfaceConstitution(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.mobileApps, ["customer", "worker", "admin"]);
});
