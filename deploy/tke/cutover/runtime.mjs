import path from "node:path";
import {
  CutoverController,
  createClbAdapter,
  createDnsAdapter,
  createMemoryProgressStore,
} from "./cutover-controller.mjs";
import { createFileProgressStore } from "./file-progress-store.mjs";

const fail = message => { throw new Error(message); };
const runtimeModes = new Set(["production", "staging", "simulation"]);

/**
 * Product runtime composition root.
 *
 * Real staging/production runs are intentionally unable to inject an
 * in-memory/custom store. Simulation must opt into memory explicitly; its
 * default is still the same durable file store used by production.
 */
export function createCutoverRuntime({
  plan,
  artifactRoot,
  transport,
  observer,
  mode = plan?.environment,
  storeType = "file",
  simulationStore,
  now = () => new Date(),
  lockTimeoutMs,
  retryDelayMs,
}) {
  if (!plan || typeof plan !== "object") fail("cutover runtime requires a plan");
  if (!runtimeModes.has(mode)) fail("cutover runtime mode must be production, staging, or simulation");
  if (mode !== "simulation" && mode !== plan.environment) fail("cutover runtime mode must match the plan environment");
  if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot)) fail("cutover runtime artifactRoot must be absolute");
  if (!transport || !observer) fail("cutover runtime requires transport and observer");
  if (typeof now !== "function") fail("cutover runtime now must be a function");
  if (!new Set(["file", "memory"]).has(storeType)) fail("cutover runtime storeType must be file or memory");
  if (storeType === "memory" && mode !== "simulation") fail("memory progress is simulation-only; real cutover requires the file store");
  if (simulationStore !== undefined && (mode !== "simulation" || storeType !== "memory")) {
    fail("custom progress store injection is simulation-only and requires storeType memory");
  }

  const store = storeType === "memory"
    ? (simulationStore ?? createMemoryProgressStore())
    : createFileProgressStore({
        artifactRoot,
        releaseId: plan.releaseId,
        planSha256: plan.planSha256,
        now,
        ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
        ...(retryDelayMs === undefined ? {} : { retryDelayMs }),
      });
  const adapter = plan.trafficProvider === "clb"
    ? createClbAdapter(transport)
    : plan.trafficProvider === "dns"
      ? createDnsAdapter(transport)
      : fail(`unsupported traffic provider type: ${plan.trafficProvider}`);
  const controller = new CutoverController({ adapter, observer, store, now });
  return Object.freeze({ controller, store, adapter, mode });
}
