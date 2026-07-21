import process from "node:process";
import {
  buildCapturePlan,
  loadCustomerUiQaManifest,
  missingEvidence,
  validateCustomerUiQaInfrastructure,
} from "./customer-ui-qa/contract.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const manifest = loadCustomerUiQaManifest(root);
const errors = validateCustomerUiQaInfrastructure(root, manifest);
const plan = buildCapturePlan(manifest);

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`[customer-ui-qa] FAIL ${error}\n`);
  process.exit(1);
}

if (args.has("--strict-evidence")) {
  const missing = missingEvidence(root, plan);
  if (missing.length > 0) {
    for (const item of missing.slice(0, 10)) process.stderr.write(`[customer-ui-qa] MISSING ${item.evidencePath}\n`);
    process.stderr.write(`[customer-ui-qa] FAIL missing ${missing.length}/${plan.length} planned captures\n`);
    process.exit(1);
  }
}

if (args.has("--plan")) {
  for (const item of plan) {
    process.stdout.write(`${item.surface}\t${item.state}\t${item.width}x${item.height}\t${item.evidencePath}\n`);
  }
}

process.stdout.write(
  `[customer-ui-qa] PASS infrastructure routes=${manifest.surfaces.length} viewports=${manifest.viewports.length} captures=${plan.length}` +
  `${args.has("--strict-evidence") ? " evidence=complete" : " evidence=deferred"}\n`,
);
