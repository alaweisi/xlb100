import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const composePath = path.join(root, "deploy", "compose", "docker-compose.staging.yml");
const examplePath = path.join(root, ".env.staging.example");
const composeText = fs.readFileSync(composePath, "utf8");
const exampleText = fs.readFileSync(examplePath, "utf8");
const demoIdentities = JSON.parse(fs.readFileSync(
  path.join(root, "packages", "types", "src", "investorDemoIdentities.json"),
  "utf8",
));
const investorNames = [
  "STAGING_INVESTOR_DEMO_AUTH_ENABLED",
  "STAGING_DEMO_WORKER_ID",
  "STAGING_DEMO_WORKER_PHONE",
  "STAGING_DEMO_ADMIN_USER_ID",
  "STAGING_DEMO_ADMIN_USERNAME",
  "STAGING_DEMO_CITY_CODE",
  "STAGING_DEMO_TOKEN_TTL_SECONDS",
];
const resetNames = [
  "STAGING_DEMO_RESET_ENABLED",
  "STAGING_DEMO_RESET_CONFIRMATION",
  "STAGING_DEMO_RESET_EXPECTED_HOST",
  "STAGING_DEMO_RESET_EXPECTED_DATABASE",
  "STAGING_DEMO_RESET_MODE",
];

test("staging Compose wires Worker/Admin Demo and a fail-closed reset profile", () => {
  for (const name of [...investorNames, ...resetNames]) {
    assert.match(composeText, new RegExp(`${name}:`, "u"));
    assert.match(exampleText, new RegExp(`^${name}=`, "mu"));
  }
  assert.match(composeText, /demo-reset:\s*\n\s+profiles:\s*\["demo-reset"\]/u);
  assert.match(composeText, /dist\/demo\/stagingDemoBootstrapCli\.js/u);
  assert.match(composeText, /STAGING_DEMO_RESET_MODE:---dry-run/u);
  assert.match(composeText, /STAGING_INVESTOR_DEMO_AUTH_ENABLED:-false/u);
  assert.match(exampleText, /^STAGING_INVESTOR_DEMO_AUTH_ENABLED=false$/mu);
  assert.match(exampleText, /^STAGING_DEMO_CUSTOMER_PHONE=$/mu);
  assert.match(composeText, /STAGING_DEMO_CUSTOMER_PHONE:-\}/u);
  assert.match(exampleText, /^STAGING_DEMO_RESET_ENABLED=false$/mu);
  assert.match(exampleText, /^STAGING_DEMO_RESET_MODE=--dry-run$/mu);
  for (const name of [
    "STAGING_DEMO_WORKER_ID",
    "STAGING_DEMO_WORKER_PHONE",
    "STAGING_DEMO_ADMIN_USER_ID",
    "STAGING_DEMO_ADMIN_USERNAME",
    "STAGING_DEMO_RESET_CONFIRMATION",
    "STAGING_DEMO_RESET_EXPECTED_HOST",
    "STAGING_DEMO_RESET_EXPECTED_DATABASE",
  ]) {
    assert.match(exampleText, new RegExp(`^${name}=$`, "mu"));
  }
});

const dockerAvailable = spawnSync("docker", ["compose", "version"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
}).status === 0;

test("docker compose config exposes Demo variables to backend and reset tool", {
  skip: !dockerAvailable,
}, () => {
  const environment = {
    ...process.env,
    MYSQL_ROOT_PASSWORD: "fixture-mysql-root-password-32",
    MYSQL_PASSWORD: "fixture-mysql-password-32",
    REDIS_PASSWORD: "fixture-redis-password-32",
    JWT_SECRET: "fixture-jwt-secret-at-least-32-characters",
    AUTH_PHONE_HASH_SECRET: "fixture-phone-hash-at-least-32-characters",
    AUTH_OTP_PEPPER: "fixture-otp-pepper-at-least-32-characters",
    STAGING_DEMO_CUSTOMER_AUTH_ENABLED: "true",
    STAGING_DEMO_CUSTOMER_PHONE: demoIdentities.customer.phone,
    STAGING_INVESTOR_DEMO_AUTH_ENABLED: "true",
    STAGING_DEMO_WORKER_ID: "investor-demo-worker-hz",
    STAGING_DEMO_WORKER_PHONE: "13800000011",
    STAGING_DEMO_ADMIN_USER_ID: "investor-demo-admin-hz",
    STAGING_DEMO_ADMIN_USERNAME: "investor_demo_hz",
    STAGING_DEMO_CITY_CODE: "hangzhou",
    STAGING_DEMO_TOKEN_TTL_SECONDS: "900",
    STAGING_DEMO_RESET_ENABLED: "true",
    STAGING_DEMO_RESET_CONFIRMATION: "RESET_XLB_INVESTOR_DEMO_V1",
    STAGING_DEMO_RESET_EXPECTED_HOST: "mysql",
    STAGING_DEMO_RESET_EXPECTED_DATABASE: "xlb_staging",
  };
  const result = spawnSync("docker", [
    "compose",
    "--env-file",
    examplePath,
    "-f",
    composePath,
    "--profile",
    "demo-reset",
    "config",
    "--format",
    "json",
  ], { cwd: root, encoding: "utf8", windowsHide: true, env: environment });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const config = JSON.parse(result.stdout);
  for (const name of investorNames) {
    assert.equal(config.services.backend.environment[name], environment[name]);
    assert.equal(config.services["demo-reset"].environment[name], environment[name]);
  }
  for (const name of resetNames.filter((name) => name !== "STAGING_DEMO_RESET_MODE")) {
    assert.equal(config.services["demo-reset"].environment[name], environment[name]);
  }
  assert.equal(config.services["demo-reset"].environment.STAGING_DEMO_RESET_MODE, "--dry-run");
});
