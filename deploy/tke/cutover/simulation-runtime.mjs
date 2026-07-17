import { CutoverController, createClbAdapter, createDnsAdapter, createMemoryProgressStore } from "./cutover-controller.mjs";

const fail = message => { throw new Error(message); };
const realEnvironments = new Set(["production", "staging"]);

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("simulation manifest is required");
  const keys = Object.keys(manifest).sort();
  const expected = ["environment", "kind", "plan", "schemaVersion"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail("simulation manifest must contain exactly schemaVersion, kind, environment, and plan");
  }
  if (manifest.schemaVersion !== 1 || manifest.kind !== "XlbCutoverSimulation" || manifest.environment !== "simulation") {
    fail("simulation manifest identity is invalid");
  }
  if (!manifest.plan || typeof manifest.plan !== "object" || !realEnvironments.has(manifest.plan.environment)) {
    fail("simulation manifest must embed a production or staging shaped plan");
  }
  return manifest.plan;
}

/**
 * Local-only simulation composition root. It accepts only the dedicated
 * XlbCutoverSimulation manifest, never a production plan as the entry value.
 */
export function createSimulationCutoverRuntime({ manifest, transport, observer, simulationStore } = {}) {
  const plan = validateManifest(manifest);
  if (!transport || !observer) fail("simulation runtime requires transport and observer");
  const store = simulationStore ?? createMemoryProgressStore();
  if (!store || typeof store.load !== "function" || typeof store.compareAndSwap !== "function") {
    fail("simulation progress store must implement load and compareAndSwap");
  }
  const adapter = plan.trafficProvider === "clb"
    ? createClbAdapter(transport)
    : plan.trafficProvider === "dns"
      ? createDnsAdapter(transport)
      : fail(`unsupported traffic provider type: ${plan.trafficProvider}`);
  const controller = new CutoverController({ adapter, observer, store });
  return Object.freeze({ controller, store, adapter, mode: "simulation", manifest });
}
