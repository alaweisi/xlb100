import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ENGINEERING_RC_PROVIDER_ISOLATION,
} from "./engineering-rc-contract.mjs";
import {
  assertMobileReleasePrerequisites,
} from "./mobile-release-prerequisites.mjs";
import {
  ENGINEERING_RC_AUDIT_REGISTRY,
  ENGINEERING_RC_CONTROLLED_NPM_CONFIG_NAMES,
  inspectEngineeringRcDocker,
  isForbiddenEngineeringRcControlName,
  validateControlledPnpmEnvironment,
} from "./engineering-rc-runtime.mjs";

const forbiddenCredentialName = /(?:COS|PAYMENT|SMS|AMAP|GAODE|WECHAT|ALIPAY|TENCENT).*(?:SECRET|KEY|TOKEN|CREDENTIAL|FILE|BUCKET|REGION)/iu;
const controlledRuntimeNames = new Set([
  "npm_execpath",
  "npm_node_execpath",
  "npm_config_frozen_lockfile",
  ...ENGINEERING_RC_CONTROLLED_NPM_CONFIG_NAMES.map((name) =>
    name.toLowerCase()),
]);

export function validateEngineeringRcEnvironment(
  environment = process.env,
  {
    mobileCheck = assertMobileReleasePrerequisites,
    dockerCheck = inspectEngineeringRcDocker,
    runtimeCheck = validateControlledPnpmEnvironment,
  } = {},
) {
  const errors = [];
  for (const [name, expected] of Object.entries(
    ENGINEERING_RC_PROVIDER_ISOLATION,
  )) {
    if (environment[name] !== expected) {
      errors.push(`${name} must be ${expected}`);
    }
  }
  for (const name of Object.keys(environment)) {
    if (
      isForbiddenEngineeringRcControlName(name)
      && !controlledRuntimeNames.has(name.toLowerCase())
    ) {
      errors.push(`${name} is a forbidden engineering RC control variable`);
    }
    if (
      forbiddenCredentialName.test(name)
      && environment[name]?.trim()
      && name !== "PAYMENT_MOCK_WEBHOOK_SECRET"
    ) {
      errors.push(`${name} must not enter the engineering RC environment`);
    }
  }
  if (
    environment.DOCKER_CONTEXT
      !== environment.XLB_ENGINEERING_RC_DOCKER_CONTEXT
    || !environment.DOCKER_CONTEXT
  ) {
    errors.push("DOCKER_CONTEXT must be fixed by the engineering RC preflight");
  }
  if (environment.XLB_AUDIT_REGISTRY !== ENGINEERING_RC_AUDIT_REGISTRY) {
    errors.push("dependency audit registry must use the canonical npm registry");
  }
  if (
    environment.NODE_ENV !== "test"
    || environment.BACKEND_HOST !== "127.0.0.1"
    || environment.MYSQL_HOST !== "127.0.0.1"
    || environment.MYSQL_DATABASE !== "xlb_local"
    || environment.REDIS_HOST !== "127.0.0.1"
  ) {
    errors.push("backend, MySQL, and Redis must be isolated to local test endpoints");
  }
  if (
    environment.XLB_EXCLUDE_TKE_TESTS !== "1"
    || environment.XLB_PLAYWRIGHT_REUSE_EXISTING_SERVER !== "false"
  ) {
    errors.push("TKE exclusion and fresh Playwright server enforcement are required");
  }
  if (
    environment.PAYMENT_MOCK_WEBHOOK_ENABLED !== "false"
    || environment.PAYMENT_MOCK_WEBHOOK_SECRET !== ""
  ) {
    errors.push("the base RC environment must keep the payment webhook disabled");
  }
  errors.push(...runtimeCheck(environment));
  let docker;
  try {
    docker = dockerCheck({ environment });
    if (
      docker.context !== environment.XLB_ENGINEERING_RC_DOCKER_CONTEXT
      || docker.endpoint !== environment.XLB_ENGINEERING_RC_DOCKER_ENDPOINT
    ) {
      errors.push("Docker context evidence does not match the fixed RC daemon");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  let mobile;
  try {
    mobile = mobileCheck({ environment });
    if (
      mobile.signingClass !== "simulation"
      || mobile.reports.some((entry) =>
        !entry.apiHost.endsWith(".engineering-rc.invalid")
        || entry.javaMajor !== 21
        || entry.androidApi !== 36)
    ) {
      errors.push("mobile RC must use isolated origins, JDK 21, API 36, and simulation signing");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { errors, mobile, docker };
}

function run() {
  const result = validateEngineeringRcEnvironment();
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      process.stderr.write(`[engineering-rc-env] FAIL ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    localDatabase: "127.0.0.1/xlb_local",
    localRedis: "127.0.0.1",
    realProviderExecution: false,
    tkeExecuted: false,
    docker: result.docker,
    mobile: result.mobile,
  }, null, 2)}\n`);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) run();
