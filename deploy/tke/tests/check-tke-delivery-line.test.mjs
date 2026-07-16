import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkRepository, validateDeploymentValues } from "../../../scripts/check-tke-delivery-line.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const production = readFileSync(path.join(root, "deploy/environments/tke/values-production.yaml"), "utf8");
const ready = production
  .replaceAll("xlb-placeholder", "xlb-approved")
  .replaceAll("mysql-production.placeholder.internal", "mysql-production.internal")
  .replaceAll("redis-production.placeholder.internal", "redis-production.internal")
  .replaceAll("example.invalid", "example.com")
  .replaceAll("placeholder", "approved")
  .replaceAll("0000000000000000000000000000000000000000000000000000000000000000", "a".repeat(64));

test("repository TKE delivery artifacts obey static safety rules", () => {
  assert.doesNotThrow(() => checkRepository(root));
});

test("reviewed production values with immutable images pass", () => {
  assert.doesNotThrow(() => validateDeploymentValues(ready, "production"));
});

test("production rejects a missing digest", () => {
  const invalid = ready.replace(/digest:\s*sha256:[a-f0-9]{64}/i, 'digest: ""');
  assert.throws(() => validateDeploymentValues(invalid, "production"), /four immutable image digests/);
});

test("production rejects a mutable tag", () => {
  const invalid = ready.replace('tag: ""', "tag: latest");
  assert.throws(() => validateDeploymentValues(invalid, "production"), /latest tag|must not use tags/);
});

test("production rejects placeholders and localhost", () => {
  assert.throws(() => validateDeploymentValues(production, "production"), /placeholder/);
  assert.throws(
    () => validateDeploymentValues(ready.replace("mysql-production.internal", "localhost"), "production"),
    /localhost/,
  );
});

test("production requires external Secret references", () => {
  assert.throws(
    () => validateDeploymentValues(ready.replace(/existingSecret:\s*\S+/, 'existingSecret: ""'), "production"),
    /runtimeSecrets\.existingSecret/,
  );
  assert.throws(
    () => validateDeploymentValues(ready.replace(/secretName:\s*\S+/, 'secretName: ""'), "production"),
    /TLS Secret reference/,
  );
});

test("production requires the COS double switch", () => {
  assert.throws(
    () => validateDeploymentValues(ready.replace("externalExecutionEnabled: true", "externalExecutionEnabled: false"), "production"),
    /external execution switch/,
  );
});

test("values environment must match the requested environment", () => {
  assert.throws(() => validateDeploymentValues(ready, "staging"), /does not match/);
});
