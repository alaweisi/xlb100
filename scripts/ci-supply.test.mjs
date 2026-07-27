import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => readFileSync(path.join(rootDir, relativePath), "utf8");

test("all hosted workflows use frozen pnpm installs", () => {
  const workflowsDir = path.join(rootDir, ".github", "workflows");
  const workflowFiles = readdirSync(workflowsDir).filter(file => /\.ya?ml$/.test(file));

  for (const file of workflowFiles) {
    const workflow = read(path.relative(rootDir, path.join(workflowsDir, file)));
    for (const installLine of workflow.matchAll(/run:\s+pnpm install([^\r\n]*)/g)) {
      assert.match(installLine[1], /--frozen-lockfile/, `${file} must use a frozen lockfile`);
    }
  }
});

test("all hosted workflows declare read-only permissions and pin actions by commit", () => {
  const workflowsDir = path.join(rootDir, ".github", "workflows");
  const workflowFiles = readdirSync(workflowsDir).filter(file => /\.ya?ml$/.test(file));

  for (const file of workflowFiles) {
    const workflow = read(path.relative(rootDir, path.join(workflowsDir, file)));
    assert.match(
      workflow,
      /^permissions:\s*\r?\n\s{2}contents:\s*read\s*$/m,
      `${file} must declare read-only repository permissions`,
    );
    for (const action of workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
      assert.match(
        action[1],
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/u,
        `${file} must pin ${action[1]} to a full commit SHA`,
      );
    }
    for (const checkout of workflow.matchAll(
      /^\s*-\s*uses:\s*actions\/checkout@[a-f0-9]{40}(?:\s+#.*)?\r?\n([\s\S]*?)(?=^\s*-\s*(?:uses|name|run):|(?![\s\S]))/gm,
    )) {
      assert.match(
        checkout[1],
        /persist-credentials:\s*false/u,
        `${file} checkout must not persist repository credentials`,
      );
    }
  }
});

test("staging compose requires strong secret inputs and authenticates Redis", () => {
  const compose = read("deploy/compose/docker-compose.staging.yml");
  const example = read(".env.staging.example");
  const seedHelper = read("scripts/seed-staging.ps1");

  for (const name of [
    "MYSQL_ROOT_PASSWORD",
    "MYSQL_PASSWORD",
    "REDIS_PASSWORD",
    "JWT_SECRET",
    "AUTH_PHONE_HASH_SECRET",
    "AUTH_OTP_PEPPER",
  ]) {
    assert.match(compose, new RegExp(`\\$\\{${name}:\\?`), `${name} must be required`);
  }
  assert.match(compose, /redis-server[^\r\n]+--requirepass/u);
  assert.doesNotMatch(compose, /change-me(?:-in-production)?/u);
  assert.doesNotMatch(example, /=change-me(?:-in-production)?\s*$/mu);
  assert.doesNotMatch(seedHelper, /\.env\.staging\.example/u);
});

test("container contexts exclude secrets and runtime images contain only built artifacts", () => {
  const dockerignore = read(".dockerignore");
  const backend = read("infra/docker/Dockerfile.backend");
  const frontend = read("infra/docker/Dockerfile.frontend");

  assert.match(dockerignore, /^\.env\.\*\s*$/mu);
  assert.match(dockerignore, /^\*\*\/\.env\.\*\s*$/mu);
  assert.match(dockerignore, /^\*\*\/\*\.pem\s*$/mu);
  assert.match(dockerignore, /^\*\*\/\*\.key\s*$/mu);
  assert.match(dockerignore, /^\.artifacts\s*$/mu);
  assert.match(dockerignore, /^\.codex\s*$/mu);
  assert.match(dockerignore, /^\.deepseek\s*$/mu);

  for (const dockerfile of [backend, frontend]) {
    assert.match(
      dockerfile,
      /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml turbo\.json \.pnpmfile\.cjs \.\//u,
    );
    const runtime = dockerfile.split(/FROM node:20-alpine AS runtime/u)[1] ?? "";
    assert.doesNotMatch(runtime, /COPY --from=builder \/app \/app/u);
    assert.doesNotMatch(runtime, /COPY --from=builder [^\r\n]+\/src(?:\s|$)/u);
  }
  assert.match(backend, /COPY --from=builder \/app\/backend\/dist \.\/backend\/dist/u);
  assert.match(frontend, /COPY --from=builder \/app\/apps\/\$\{APP_NAME\}\/dist \/app\/dist/u);
});

test("critical authorization and concurrency regression suites remain present", () => {
  for (const relativePath of [
    "tests/unit/paymentTrustBoundary.test.ts",
    "tests/unit/criticalResourceAuthorization.test.ts",
    "tests/integration/authOtp.test.ts",
    "tests/integration/refundReversalMvp.test.ts",
    "tests/integration/workerWithdrawalStateMachine.test.ts",
  ]) {
    assert.equal(existsSync(path.join(rootDir, relativePath)), true, `${relativePath} is required`);
  }
});

test("main CI executes the immutable engineering RC aggregator", () => {
  const workflow = read(".github/workflows/ci.yml");
  const contract = read("scripts/engineering-rc-contract.mjs");
  assert.match(workflow, /run: pnpm gate:engineering-rc/u);
  assert.match(contract, /\["lint", "--", "--force", "--", "--max-warnings=0"\]/u);
  assert.match(contract, /\["test:engineering-non-tke"\]/u);
  assert.match(contract, /\["audit:critical"\]/u);
});

test("security workflow provisions runtime dependencies before the focused suite", () => {
  const workflow = read(".github/workflows/security-scope-check.yml");
  assert.match(workflow, /mysql:\s*\n\s+image: mysql:8/);
  assert.match(workflow, /redis:\s*\n\s+image: redis:7/);
  assert.match(workflow, /src\/dal\/migrateCli\.ts/);
  assert.match(workflow, /src\/dal\/seedCli\.ts/);
  assert.match(workflow, /run: pnpm test:security/);
});

test("contract workflow runs the executable contract gate", () => {
  const workflow = read(".github/workflows/contract-check.yml");
  const compatibilityWrapper = read("scripts/check-contracts.ps1");
  assert.match(workflow, /run: pnpm check:contracts/);
  assert.match(compatibilityWrapper, /node scripts\/check-contracts\.mjs/);
  assert.doesNotMatch(compatibilityWrapper, /placeholder/i);
});

test("dependency gate uses the Bulk Advisory implementation and blocks high severity", () => {
  const manifest = JSON.parse(read("package.json"));
  const pnpmHook = read(".pnpmfile.cjs");
  assert.equal(
    manifest.scripts["audit:critical"],
    "node scripts/audit-dependencies.mjs --audit-level high",
  );
  for (const [dependency, securedVersion] of [
    ["brace-expansion", "5.0.8"],
    ["fast-uri", "4.1.1"],
    ["find-my-way", "9.7.0"],
    ["postcss", "8.5.23"],
  ]) {
    assert.match(
      pnpmHook,
      new RegExp(`"${dependency}":\\s*"${securedVersion.replaceAll(".", "\\.")}"`, "u"),
      `${dependency} must remain pinned to its secured version`,
    );
  }
  assert.match(pnpmHook, /hooks:\s*\{\s*readPackage:\s*secureDependencyVersions,?\s*\}/u);
});
