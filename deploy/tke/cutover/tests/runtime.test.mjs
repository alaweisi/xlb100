import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCutoverRuntime } from "../runtime.mjs";

const plan = Object.freeze({
  releaseId: "release-runtime-001",
  environment: "production",
  trafficProvider: "clb",
  planSha256: "a".repeat(64),
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

test("product runtime factory defaults production to a durable file progress store", t => {
  const artifactRoot = root(t);
  const now = () => new Date("2026-07-17T01:00:00Z");
  const runtime = createCutoverRuntime({ plan, artifactRoot, transport, observer, mode: "production", now });
  assert.equal(runtime.mode, "production");
  assert.equal(runtime.adapter.type, "clb");
  assert.ok(runtime.store.file.startsWith(artifactRoot));
  assert.equal(typeof runtime.store.acquireLock, "function");
  assert.equal(runtime.controller.store, runtime.store);
});

test("real cutover cannot select or inject memory progress", t => {
  const artifactRoot = root(t);
  assert.throws(
    () => createCutoverRuntime({ plan, artifactRoot, transport, observer, mode: "production", storeType: "memory" }),
    /simulation-only/,
  );
  assert.throws(
    () => createCutoverRuntime({ plan, artifactRoot, transport, observer, mode: "production", simulationStore: {} }),
    /simulation-only/,
  );
});

test("simulation must explicitly opt into memory progress", t => {
  const artifactRoot = root(t);
  const durable = createCutoverRuntime({ plan, artifactRoot, transport, observer, mode: "simulation" });
  assert.ok(durable.store.file);
  const simulated = createCutoverRuntime({
    plan, artifactRoot, transport, observer, mode: "simulation", storeType: "memory",
  });
  assert.equal(simulated.store.file, undefined);
  assert.equal(typeof simulated.store.compareAndSwap, "function");
});
