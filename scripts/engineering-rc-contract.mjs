export const ENGINEERING_RC_GATE = "XLB_ENGINEERING_RC_NON_TKE";
export const ENGINEERING_RC_NODE_VERSION = "24.14.0";
export const ENGINEERING_RC_PNPM_VERSION = "9.15.0";

export const ENGINEERING_RC_EXCLUSIONS = Object.freeze([
  "tke-delivery-deployment-and-cutover",
  "real-payment-provider",
  "real-sms-provider",
  "real-amap-provider",
]);

export const ENGINEERING_RC_PROVIDER_ISOLATION = Object.freeze({
  XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED: "false",
  XLB_PAYMENT_PROVIDER: "mock",
  XLB_SMS_PROVIDER: "mock",
  XLB_OBJECT_STORAGE_PROVIDER: "local",
  XLB_GEO_PROVIDER: "local_mock",
  XLB_ENTERPRISE_WEBHOOK_PROVIDER: "mock_only",
});

function step(id, stage, args, timeoutMs, artifact = null) {
  return Object.freeze({
    id,
    stage,
    args: Object.freeze(args),
    timeoutMs,
    artifact: artifact ? Object.freeze(artifact) : null,
  });
}

export const ENGINEERING_RC_STEPS = Object.freeze([
  step(
    "environment-preflight",
    "environment",
    ["check:engineering-rc-environment"],
    120_000,
  ),
  step("install", "environment", ["install", "--frozen-lockfile"], 600_000),
  step("closure-contract", "environment", ["test:engineering-rc"], 180_000),
  step("workspace-links", "static", ["check:workspace-links"], 180_000),
  step("contracts", "static", ["check:contracts"], 180_000),
  step("supply-chain", "static", ["test:ci-supply"], 180_000),
  step("tracked-and-history-secrets", "static", ["check:secrets"], 600_000),
  step(
    "lint",
    "static",
    ["lint", "--", "--force", "--", "--max-warnings=0"],
    600_000,
  ),
  step("typecheck", "static", ["typecheck", "--", "--force"], 600_000),
  step("build", "static", ["build", "--", "--force"], 900_000),
  step("architecture", "static", ["preflight"], 300_000),
  step(
    "migration-integrity",
    "static",
    ["check:migration-integrity"],
    300_000,
  ),
  step(
    "migration-runtime",
    "static",
    ["check:migration:runtime"],
    300_000,
  ),
  step(
    "production-repository",
    "static",
    ["check:production-repository-readiness"],
    300_000,
  ),
  step("dependency-audit", "static", ["audit:critical"], 600_000),
  step("local-database-migrate", "data", ["db:migrate"], 600_000),
  step("local-database-seed", "data", ["db:seed"], 600_000),
  step(
    "full-regression-non-tke",
    "runtime",
    ["test:engineering-non-tke"],
    1_200_000,
  ),
  step(
    "performance-regression",
    "runtime",
    ["test:performance:isolated"],
    1_200_000,
  ),
  step(
    "security-performance-faults",
    "runtime",
    ["gate:stage4c"],
    1_200_000,
  ),
  step(
    "data-reliability-drill",
    "data",
    ["drill:stage4a"],
    1_800_000,
    { kind: "stage4a", minimumFiles: 1 },
  ),
  step(
    "oa-migration",
    "data",
    ["test:migration:oa"],
    900_000,
    { kind: "oa-migration", minimumFiles: 1 },
  ),
  step(
    "browser-cross-app",
    "browser",
    ["test:e2e:stage4b", "--", "--browser-only"],
    1_800_000,
    { kind: "playwright", minimumFiles: 6 },
  ),
  step(
    "browser-oa-dashboard",
    "browser",
    ["test:e2e:oa-dashboard"],
    600_000,
    { kind: "playwright", minimumFiles: 1 },
  ),
  step(
    "browser-dashboard",
    "browser",
    ["test:e2e:dashboard"],
    600_000,
    { kind: "playwright", minimumFiles: 1 },
  ),
  step("mobile-tests", "mobile", ["mobile:m0:test"], 600_000),
  step("mobile-types", "mobile", ["mobile:m0:typecheck"], 600_000),
  step("mobile-boundaries", "mobile", ["mobile:m0:validate"], 300_000),
  step("mobile-toolchain", "mobile", ["mobile:m0:doctor"], 300_000),
  step(
    "mobile-release",
    "mobile",
    ["mobile:m5:release"],
    1_800_000,
    { kind: "mobile-m5", minimumFiles: 4 },
  ),
]);

export const ENGINEERING_RC_REQUIRED_STEP_IDS = Object.freeze(
  ENGINEERING_RC_STEPS.map((entry) => entry.id),
);

export function validateEngineeringRcPlan(steps = ENGINEERING_RC_STEPS) {
  const errors = [];
  if (!Array.isArray(steps) || steps.length !== ENGINEERING_RC_STEPS.length) {
    errors.push(
      `plan must contain exactly ${ENGINEERING_RC_STEPS.length} canonical steps`,
    );
  }
  const limit = Math.max(
    Array.isArray(steps) ? steps.length : 0,
    ENGINEERING_RC_STEPS.length,
  );
  for (let index = 0; index < limit; index += 1) {
    const actual = steps?.[index];
    const expected = ENGINEERING_RC_STEPS[index];
    if (!actual || !expected) continue;
    if (
      actual.id !== expected.id
      || actual.stage !== expected.stage
      || JSON.stringify(actual.args) !== JSON.stringify(expected.args)
      || actual.timeoutMs !== expected.timeoutMs
      || JSON.stringify(actual.artifact ?? null)
        !== JSON.stringify(expected.artifact ?? null)
    ) {
      errors.push(`step ${index + 1} must match canonical step ${expected.id}`);
    }
    const commandText = Array.isArray(actual.args) ? actual.args.join(" ") : "";
    if (/(?:^|[\s:])tke(?:$|[\s:])/iu.test(commandText)) {
      errors.push(`${actual.id} invokes excluded TKE scope`);
    }
    if (/--skip-/iu.test(commandText)) {
      errors.push(`${actual.id} contains a forbidden skip flag`);
    }
    if (/stage5/iu.test(commandText)) {
      errors.push(`${actual.id} depends on stale Stage 5 evidence`);
    }
  }
  return errors;
}
