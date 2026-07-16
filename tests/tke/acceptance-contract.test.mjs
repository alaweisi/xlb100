import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runner = readFileSync(path.join(root, "tests/tke/run-local-acceptance.ps1"), "utf8");
const values = readFileSync(path.join(root, "tests/tke/values-acceptance.yaml"), "utf8");
const tools = JSON.parse(readFileSync(path.join(root, "tests/tke/tool-versions.json"), "utf8"));

test("acceptance uses an isolated local database and pinned kind inputs", () => {
  assert.match(values, /database:\s+xlb_tke_acceptance/);
  assert.match(values, /port:\s+13306/);
  assert.match(values, /port:\s+16379/);
  assert.match(tools.kind.version, /^v\d+\.\d+\.\d+$/);
  assert.match(tools.nodeImage, /@sha256:[a-f0-9]{64}$/);
  assert.match(tools.prometheusImage, /@sha256:[a-f0-9]{64}$/);
});

test("one-click runner covers the N6 runtime contract", () => {
  for (const marker of [
    "DEPLOY-XLB-LOCAL",
    "MIGRATE-XLB-LOCAL",
    "SMOKE-XLB-LOCAL",
    "ROLLBACK-XLB-LOCAL",
    "verify-runtime.mjs",
    "Pod restart recovery passed",
    "schema_migrations",
    "config.auth.otpLockSeconds=901",
    "/bin/promtool",
  ]) assert.ok(runner.includes(marker), `missing N6 marker: ${marker}`);
});

test("acceptance runner cannot invoke cloud infrastructure operations", () => {
  assert.doesNotMatch(runner, /terraform\s+(?:plan|apply)/i);
  assert.doesNotMatch(runner, /cloud\.tencent|tencentcloud|TENCENTCLOUD_/i);
});
