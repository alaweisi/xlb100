import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOME_CAPTURE_CASES,
  HOME_EVIDENCE_ROOT,
  homeComparisonName,
  homeReportName,
  homeScreenshotName,
  validateHomeQaReport,
} from "./customer-ui-qa/home-contract.mjs";

const root = process.cwd();
const allowFailed = process.argv.includes("--allow-failed");
const iterationArg = process.argv.find((arg) => arg.startsWith("--iteration="));
const iteration = iterationArg?.slice("--iteration=".length) ?? process.env.CUSTOMER_HOME_QA_ITERATION ?? "01";
const errors = [];
let failedReports = 0;

for (const captureCase of HOME_CAPTURE_CASES) {
  const screenshot = join(root, HOME_EVIDENCE_ROOT, homeScreenshotName(captureCase, iteration));
  const reportPath = join(root, HOME_EVIDENCE_ROOT, homeReportName(captureCase, iteration));
  if (!existsSync(screenshot)) errors.push(`missing screenshot: ${homeScreenshotName(captureCase, iteration)}`);
  if (!existsSync(reportPath)) {
    errors.push(`missing report: ${homeReportName(captureCase, iteration)}`);
    continue;
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const reportErrors = validateHomeQaReport(report, captureCase).filter((error) => error !== "report screenshot mismatch");
  const expectedScreenshot = homeScreenshotName(captureCase, iteration);
  if (!String(report.screenshot ?? "").endsWith(expectedScreenshot)) reportErrors.push("report screenshot mismatch");
  errors.push(...reportErrors.map((error) => `${homeReportName(captureCase, iteration)}: ${error}`));
  if (report.result === "failed") failedReports += 1;
}

if (!existsSync(join(root, HOME_EVIDENCE_ROOT, homeComparisonName(iteration)))) {
  errors.push(`missing comparison board: ${homeComparisonName(iteration)}`);
}
if (!allowFailed && failedReports > 0) errors.push(`${failedReports} Home QA report(s) are failed`);

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`[customer-home-qa] FAIL ${error}\n`);
  process.exit(1);
}

process.stdout.write(
  `[customer-home-qa] PASS iteration=${iteration} evidence=${HOME_CAPTURE_CASES.length} reports=${HOME_CAPTURE_CASES.length} ` +
  `comparison=1 result=${failedReports === 0 ? "passed" : "captured-failed"}\n`,
);
