import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ENGINEERING_RC_PROVIDER_ISOLATION,
} from "./engineering-rc-contract.mjs";
import {
  assertMobileReleasePrerequisites,
} from "./mobile-release-prerequisites.mjs";

const forbiddenCredentialName = /(?:COS|PAYMENT|SMS|AMAP|GAODE|WECHAT|ALIPAY|TENCENT).*(?:SECRET|KEY|TOKEN|CREDENTIAL|FILE|BUCKET|REGION)/iu;

export function validateEngineeringRcEnvironment(
  environment = process.env,
  {
    mobileCheck = assertMobileReleasePrerequisites,
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
      forbiddenCredentialName.test(name)
      && environment[name]?.trim()
      && name !== "PAYMENT_MOCK_WEBHOOK_SECRET"
    ) {
      errors.push(`${name} must not enter the engineering RC environment`);
    }
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
  return { errors, mobile };
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
    mobile: result.mobile,
  }, null, 2)}\n`);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) run();
