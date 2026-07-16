import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildReleaseFixture } from "./fixture-builder.mjs";
import { createP4ExecutorAdapter, createP5ControllerBindings } from "./p4-p5-wiring.mjs";
import { createDeterministicProviderFakes } from "./provider-fakes.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const resolveWave2Module = (relative, siblingWorktree) => {
  const integrated = path.join(repoRoot, relative);
  if (existsSync(integrated)) return integrated;
  const sibling = path.resolve(repoRoot, "..", siblingWorktree, relative);
  if (existsSync(sibling)) return sibling;
  throw new Error(`real Wave 2 module is unavailable: ${relative}`);
};

const p4Context = stage => ({
  releaseId: "release-20260716-001",
  environment: "production",
  currentState: "ARTIFACTS_READY",
  targetState: "PLAN_REVIEWED",
  stage,
  runtimeAuthorityGranted: true,
  artifactPaths: {
    releaseManifest: ".artifacts/tke/releases/release-20260716-001/release-manifest.json",
  },
});

test("simulation adapter implements the real P4 injected executor context and result contract", async () => {
  const fixture = buildReleaseFixture();
  const fake = createDeterministicProviderFakes(fixture);
  const executor = createP4ExecutorAdapter(fake.ports);

  assert.deepEqual(await executor(p4Context("PLAN_INFRASTRUCTURE")), { artifactsChanged: [] });
  assert.deepEqual(await executor(p4Context("MIGRATE_DATA")), { artifactsChanged: ["evidenceBundle"] });
  await assert.rejects(executor({ stage: "SMOKE" }), /context.releaseId is required/);
});

test("simulation bindings implement the real P5 adapter observer and progress-store injection contract", async () => {
  const fixture = buildReleaseFixture();
  const fake = createDeterministicProviderFakes(fixture);
  const bindings = createP5ControllerBindings(fake.ports, "clb");

  assert.equal(bindings.adapter.type, "clb");
  assert.deepEqual(await bindings.adapter.readWeights({}), {
    tkeWeight: 0,
    lighthouseWeight: 100,
    evidenceRef: ".artifacts/tke/simulation/clb-weights-0.json",
  });
  const applied = await bindings.adapter.applyWeights({ fromWeight: 0, toWeight: 5 });
  assert.equal(applied.tkeWeight, 5);
  const observed = await bindings.observer.observe({ weight: 5, minimumObservationSeconds: 900 });
  assert.equal(observed.result, "PASS");
  assert.equal(observed.durationSeconds, 900);
  assert.equal(bindings.store.compareAndSwap(0, { status: "OBSERVATION_PENDING", revision: 2 }), true);
  assert.equal(bindings.store.compareAndSwap(0, { status: "STALE", revision: 3 }), false);
  assert.deepEqual(bindings.store.load(), { status: "OBSERVATION_PENDING", revision: 2 });
});

test("wiring loads the real P4/P5 modules and satisfies their public injection surfaces", async () => {
  const p4File = resolveWave2Module(
    "deploy/tke/orchestrator/orchestrator.mjs",
    "tke-release-orchestrator",
  );
  const p5File = resolveWave2Module(
    "deploy/tke/cutover/cutover-controller.mjs",
    "tke-cutover-controller",
  );
  const [p4, p5] = await Promise.all([
    import(pathToFileURL(p4File)),
    import(pathToFileURL(p5File)),
  ]);
  assert.equal(typeof p4.advanceRelease, "function");
  assert.equal(typeof p4.resumeRelease, "function");
  assert.equal(typeof p4.rollbackRelease, "function");
  assert.equal(typeof p5.CutoverController, "function");

  const fixture = buildReleaseFixture();
  const fake = createDeterministicProviderFakes(fixture);
  const bindings = createP5ControllerBindings(fake.ports, "dns");
  const controller = new p5.CutoverController({
    ...bindings,
    now: () => new Date("2026-07-16T09:00:00Z"),
  });
  assert.equal(typeof controller.advance, "function");
  assert.equal(typeof controller.rollback, "function");

  const offline = await p4.offlineExecutor({
    stage: "ARTIFACTS_READY",
    targetState: "ARTIFACTS_READY",
  });
  assert.deepEqual(offline.artifactsChanged, []);
});
