import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORWARD_STATES,
  rollbackRelease,
  runRelease,
} from "./orchestrator.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fail = message => { throw new Error(message); };

function parseArguments(argv) {
  const options = { authorities: {}, resume: false, rollback: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") options.manifest = argv[++index];
    else if (argument === "--target") options.target = argv[++index];
    else if (argument === "--resume") options.resume = true;
    else if (argument === "--rollback") options.rollback = true;
    else if (argument === "--grant") fail("standalone OFFLINE_FAKE entry cannot accept external authority; use the integrated provider entry after P4/P5/P6 acceptance");
    else fail(`unknown argument: ${argument}`);
  }
  if (!options.manifest) fail("--manifest is required");
  if (options.rollback && options.target) fail("--rollback and --target are mutually exclusive");
  if (!options.rollback && !FORWARD_STATES.includes(options.target)) fail(`--target must be one of: ${FORWARD_STATES.join(", ")}`);
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifestFile = path.resolve(repoRoot, options.manifest);
  const result = options.rollback
    ? await rollbackRelease({ repoRoot, manifestFile })
    : await runRelease({
      repoRoot,
      manifestFile,
      targetState: options.target,
      authorities: options.authorities,
      resume: options.resume,
    });
  console.log(JSON.stringify({
    status: result.status,
    currentState: result.checkpoint.currentState,
    revision: result.checkpoint.revision,
    ...(result.requiredAuthority ? { requiredAuthority: result.requiredAuthority } : {}),
  }, null, 2));
  console.log("xlb-release: OFFLINE_FAKE executor only; no cloud, cluster, data, DNS, or Lighthouse operation was performed");
  if (result.status === "FAILED") process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`xlb-release: BLOCKED - ${error.message}`);
  process.exitCode = 1;
}
