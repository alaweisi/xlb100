import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCutoverRuntime } from "../runtime.mjs";
import { createSimulationCutoverRuntime } from "../simulation-runtime.mjs";

const plan = Object.freeze({
  releaseId: "release-runtime-001",
  environment: "production",
  trafficProvider: "clb",
  planSha256: "a".repeat(64),
});
const simulationManifest = Object.freeze({
  schemaVersion: 1,
  kind: "XlbCutoverSimulation",
  environment: "simulation",
  plan,
});
const transport = {
  readWeights: async () => ({ tkeWeight: 0, lighthouseWeight: 100, evidenceRef: ".artifacts/tke/tests/read.json" }),
  applyWeights: async () => ({ tkeWeight: 5, lighthouseWeight: 95, evidenceRef: ".artifacts/tke/tests/apply.json" }),
};
const observer = { observe: async () => ({}) };

function root(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "xlb-cutover-runtime-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("production/staging runtime always composes the durable file store", t => {
  const artifactRoot = root(t);
  const runtime = createCutoverRuntime({ plan, artifactRoot, transport, observer });
  assert.equal(runtime.mode, "production");
  assert.equal(runtime.adapter.type, "clb");
  assert.ok(runtime.store.file.startsWith(artifactRoot));
  assert.equal(typeof runtime.store.acquireLock, "function");
  assert.equal(runtime.controller.store, runtime.store);
});

test("real runtime rejects every simulation, memory, custom-store, mode, and fake-clock option", t => {
  const artifactRoot = root(t);
  for (const option of [
    { mode: "simulation" }, { mode: "production" }, { storeType: "memory" }, { store: {} },
    { simulationStore: {} }, { simulationManifest }, { memory: true }, { now: () => new Date(0) },
  ]) {
    assert.throws(() => createCutoverRuntime({ plan, artifactRoot, transport, observer, ...option }), /simulation-only|unsafe/);
  }
  assert.throws(
    () => createCutoverRuntime({ plan: { ...plan, environment: "simulation" }, artifactRoot, transport, observer }),
    /production or staging plan/,
  );
});

test("simulation is a separate manifest-only entry and cannot accept a production plan directly", () => {
  assert.throws(() => createSimulationCutoverRuntime({ plan, transport, observer }), /simulation manifest is required/);
  const simulated = createSimulationCutoverRuntime({ manifest: simulationManifest, transport, observer });
  assert.equal(simulated.mode, "simulation");
  assert.equal(simulated.store.file, undefined);
  assert.equal(typeof simulated.store.compareAndSwap, "function");
  assert.equal(simulated.manifest, simulationManifest);
});

test("simulation manifest identity and exact shape are fail-closed", () => {
  assert.throws(
    () => createSimulationCutoverRuntime({ manifest: { ...simulationManifest, environment: "production" }, transport, observer }),
    /identity is invalid/,
  );
  assert.throws(
    () => createSimulationCutoverRuntime({ manifest: { ...simulationManifest, storeType: "file" }, transport, observer }),
    /contain exactly/,
  );
});
