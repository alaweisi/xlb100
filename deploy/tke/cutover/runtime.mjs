import path from "node:path";
import { CutoverController, createClbAdapter, createDnsAdapter } from "./cutover-controller.mjs";
import { createFileProgressStore } from "./file-progress-store.mjs";

const fail = message => { throw new Error(message); };
const realEnvironments = new Set(["production", "staging"]);
const forbiddenRuntimeOptions = new Set([
  "mode", "store", "storeType", "simulation", "simulationManifest", "simulationStore", "memory", "now",
]);

function assertNoSimulationOptions(options) {
  for (const key of Object.keys(options)) {
    if (forbiddenRuntimeOptions.has(key)) {
      fail(`${key} is simulation-only or unsafe for the production/staging runtime; real cutover always uses the file store`);
    }
  }
}

function adapterFor(plan, transport) {
  return plan.trafficProvider === "clb"
    ? createClbAdapter(transport)
    : plan.trafficProvider === "dns"
      ? createDnsAdapter(transport)
      : fail(`unsupported traffic provider type: ${plan.trafficProvider}`);
}

/**
 * Production/staging composition root. This module deliberately has no
 * simulation or injectable-store export. Real plans are always bound to the
 * durable file progress store and the system clock.
 */
export function createCutoverRuntime(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("cutover runtime options must be an object");
  assertNoSimulationOptions(options);
  const { plan, artifactRoot, transport, observer, lockTimeoutMs, retryDelayMs } = options;
  if (!plan || typeof plan !== "object") fail("cutover runtime requires a plan");
  if (!realEnvironments.has(plan.environment)) fail("production/staging runtime requires a production or staging plan");
  if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot)) fail("cutover runtime artifactRoot must be absolute");
  if (!transport || !observer) fail("cutover runtime requires transport and observer");

  const store = createFileProgressStore({
    artifactRoot,
    releaseId: plan.releaseId,
    planSha256: plan.planSha256,
    ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
    ...(retryDelayMs === undefined ? {} : { retryDelayMs }),
  });
  const adapter = adapterFor(plan, transport);
  const controller = new CutoverController({ adapter, observer, store });
  return Object.freeze({ controller, store, adapter, mode: plan.environment });
}
