import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertTransition,
  checkRepositoryContracts,
  validateCheckpointSemantics,
  validateContract,
  validateContractBundle,
  validateEvidenceSemantics,
} from "../../../scripts/check-tke-release-contracts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const examplesRoot = path.join(repoRoot, "deploy/tke/contracts/examples");
const readExample = name => JSON.parse(readFileSync(path.join(examplesRoot, `${name}.example.json`), "utf8"));
const bundle = () => ({
  releaseManifest: readExample("release-manifest"),
  imageLock: readExample("images-lock"),
  cloudBundle: readExample("cloud-bundle"),
  checkpoint: readExample("checkpoint"),
  evidenceBundle: readExample("evidence-bundle"),
});

test("committed Wave 0 schemas and examples form a valid release bundle", () => {
  assert.doesNotThrow(() => checkRepositoryContracts(repoRoot));
  assert.doesNotThrow(() => validateContractBundle(bundle()));
});

test("release artifacts reject credentials and persisted authorizations", () => {
  const manifest = bundle().releaseManifest;
  manifest.authorizations = { terraformApply: true };
  assert.throws(() => validateContract("releaseManifest", manifest), /additional properties|authorization/i);

  const cloud = bundle().cloudBundle;
  cloud.secretKey = "not-allowed";
  assert.throws(() => validateContract("cloudBundle", cloud), /additional properties|credential/i);
});

test("image lock requires all four immutable images and rejects mutable tags", () => {
  const missing = bundle();
  delete missing.imageLock.images.admin;
  assert.throws(() => validateContract("imageLock", missing.imageLock), /admin/);

  const mutable = bundle();
  mutable.imageLock.images.backend.repository += ":latest";
  assert.throws(() => validateContractBundle(mutable), /mutable tag|schema validation failed/);
});

test("release bundle rejects cross-file release and environment drift", () => {
  const releaseDrift = bundle();
  releaseDrift.imageLock.releaseId = "release-20260716-002";
  assert.throws(() => validateContractBundle(releaseDrift), /releaseId does not match/);

  const environmentDrift = bundle();
  environmentDrift.cloudBundle.environment = "staging";
  assert.throws(() => validateContractBundle(environmentDrift), /environment does not match/);
});

test("state machine permits only the next state, explicit failure, resume, or valid rollback", () => {
  assert.doesNotThrow(() => assertTransition("PREPARED", "ARTIFACTS_READY"));
  assert.doesNotThrow(() => assertTransition("TRAFFIC_25", "FAILED"));
  assert.doesNotThrow(() => assertTransition("FAILED", "TRAFFIC_25", { resumeState: "TRAFFIC_25" }));
  assert.doesNotThrow(() => assertTransition("TRAFFIC_25", "ROLLED_BACK"));
  assert.throws(() => assertTransition("PREPARED", "INFRA_READY"), /illegal release transition/);
  assert.throws(() => assertTransition("PREPARED", "ROLLED_BACK"), /rollback is not available/);
  assert.throws(() => assertTransition("LIGHTHOUSE_RETIRED", "FAILED"), /terminal/);
});

test("ARTIFACTS_READY requires image, cloud bundle, and safety prerequisites", () => {
  const checkpoint = bundle().checkpoint;
  checkpoint.completedStages = checkpoint.completedStages.filter(stage => stage !== "IMAGES_PUBLISHED");
  assert.throws(() => validateCheckpointSemantics(checkpoint), /IMAGES_PUBLISHED/);
});

test("jobs guard rejects Lighthouse and TKE double-active evidence", () => {
  const evidence = bundle().evidenceBundle;
  evidence.jobsSingleActive.tkeState = "ACTIVE";
  assert.throws(() => validateEvidenceSemantics(evidence), /must never both be ACTIVE/);
});

test("traffic evidence must follow the fixed 5 25 50 100 staircase", () => {
  const evidence = bundle().evidenceBundle;
  evidence.trafficObservations = [
    {
      weight: 25,
      observedAt: "2026-07-16T09:00:00Z",
      result: "PASS",
      evidenceRef: ".artifacts/tke/releases/release-20260716-001/evidence/traffic-25.json"
    }
  ];
  assert.throws(() => validateEvidenceSemantics(evidence), /ordered 5\/25\/50\/100 prefix/);
});

test("release manifest paths remain in the ignored artifact root", () => {
  const release = bundle();
  release.releaseManifest.checkpointFile = "docs/checkpoint.json";
  assert.throws(() => validateContractBundle(release), /schema validation failed|\.artifacts/);
});
