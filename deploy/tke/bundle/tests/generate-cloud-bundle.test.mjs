import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildCloudBundle, writeCloudBundle } from "../generate-cloud-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const exampleFile = path.join(repoRoot, "deploy/tke/bundle/reviewed-cloud-input.example.json");
let fixtureRoot;
let imageLockFile;

const digest = character => `sha256:${character.repeat(64)}`;
const readInput = () => {
  const input = JSON.parse(readFileSync(exampleFile, "utf8"));
  input.imageLockFile = imageLockFile;
  return input;
};
const build = input => buildCloudBundle({ repoRoot, input, outputDirectory: `.artifacts/tke/${input.environment}` });

before(() => {
  const artifactsRoot = path.join(repoRoot, ".artifacts/tke");
  mkdirSync(artifactsRoot, { recursive: true });
  fixtureRoot = path.join(artifactsRoot, `bundle-test-${process.pid}`);
  mkdirSync(fixtureRoot, { recursive: true });
  imageLockFile = path.relative(repoRoot, path.join(fixtureRoot, "images.lock.json")).replaceAll("\\", "/");
  const images = Object.fromEntries(["backend", "customer", "worker", "admin", "oa", "dashboard"].map((name, index) => [name, {
    repository: `ccr.ccs.tencentyun.com/xlb/${name}`,
    digest: digest(String(index + 1)),
    sbomFile: `${path.relative(repoRoot, fixtureRoot).replaceAll("\\", "/")}/${name}.sbom.json`,
    scanEvidenceFile: `${path.relative(repoRoot, fixtureRoot).replaceAll("\\", "/")}/${name}.scan.json`,
  }]));
  writeFileSync(path.join(fixtureRoot, "images.lock.json"), `${JSON.stringify({
    schemaVersion: 1,
    releaseId: "release-20260717-001",
    sourceCommit: "a".repeat(40),
    createdAt: "2026-07-17T01:00:00Z",
    images,
  }, null, 2)}\n`, "utf8");
});

after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

test("valid reviewed input generates deterministic Terraform, Helm, manifest, and hashes offline", () => {
  const first = build(readInput());
  const second = build(readInput());

  assert.equal(first.manifest.environment, "production");
  assert.equal(first.manifest.region, "ap-guangzhou");
  assert.equal(first.manifest.files.terraformVarFile, ".artifacts/tke/production/production.tfvars");
  assert.equal(first.manifest.files.backendConfig, ".artifacts/tke/production/production.backend.hcl");
  assert.equal(first.manifest.files.valuesFile, ".artifacts/tke/production/values-production.yaml");
  assert.match(first.rendered[first.manifest.files.terraformVarFile], /billable_resources_acknowledgement = "CREATE-TKE-PRODUCTION"/);
  assert.match(first.rendered[first.manifest.files.backendConfig], /encrypt = true/);
  assert.match(first.rendered[first.manifest.files.valuesFile], /digest: sha256:1{64}/);
  assert.equal(first.manifest.bundleSha256, second.manifest.bundleSha256);
  assert.equal(first.inventory.files.length, 4);
  assert.match(first.manifest.bundleSha256, /^[a-f0-9]{64}$/);

  const changedReview = readInput();
  changedReview.approvedKubeContext = "tke-production-second-reviewed-context";
  assert.notEqual(build(changedReview).manifest.bundleSha256, first.manifest.bundleSha256);
});

test("writer persists only the reviewed payload and hash inventory below an isolated artifact root", () => {
  const isolatedRoot = path.join(fixtureRoot, "isolated-repo");
  cpSync(path.join(repoRoot, "deploy/tke/contracts"), path.join(isolatedRoot, "deploy/tke/contracts"), { recursive: true });
  const input = readInput();
  input.imageLockFile = ".artifacts/tke/releases/release-20260717-001/images.lock.json";
  const isolatedLock = path.join(isolatedRoot, input.imageLockFile);
  mkdirSync(path.dirname(isolatedLock), { recursive: true });
  cpSync(path.resolve(repoRoot, imageLockFile), isolatedLock);

  const bundle = buildCloudBundle({ repoRoot: isolatedRoot, input });
  writeCloudBundle(bundle);

  for (const file of ["cloud-bundle.json", "production.tfvars", "production.backend.hcl", "values-production.yaml", "bundle-files.json", "bundle.sha256"]) {
    assert.equal(existsSync(path.join(isolatedRoot, ".artifacts/tke/production", file)), true, `${file} should exist`);
  }
  assert.equal(readFileSync(path.join(isolatedRoot, ".artifacts/tke/production/bundle.sha256"), "utf8").trim(), bundle.manifest.bundleSha256);
});

test("rejects secret material instead of persisting it in the bundle", () => {
  const input = readInput();
  input.dependencies.mysql.password = "unsafe";
  assert.throws(() => build(input), /additional properties|password|secret/i);
});

test("rejects placeholder and local-only values", () => {
  const placeholder = readInput();
  placeholder.dependencies.mysql.host = "mysql-production.placeholder.internal";
  assert.throws(() => build(placeholder), /placeholder/i);

  const local = readInput();
  local.dependencies.redis.host = "localhost";
  assert.throws(() => build(local), /local-only host/i);
});

test("rejects environment, region, and VPC drift before rendering", () => {
  const environment = readInput();
  environment.helm.environment = "staging";
  assert.throws(() => build(environment), /helm.environment drifted/);

  const region = readInput();
  region.stateBackend.region = "ap-shanghai";
  assert.throws(() => build(region), /stateBackend.region drifted/);

  const vpc = readInput();
  vpc.terraform.vpcId = "vpc-anotherreviewed";
  assert.throws(() => build(vpc), /terraform.vpcId drifted/);
});

test("rejects release, source commit, and registry image drift", () => {
  const release = readInput();
  release.releaseId = "release-20260717-002";
  assert.throws(() => build(release), /image lock releaseId drifted/);

  const source = readInput();
  source.sourceCommit = "b".repeat(40);
  assert.throws(() => build(source), /sourceCommit drifted/);

  const registry = readInput();
  registry.registry.namespace = "another";
  assert.throws(() => build(registry), /image repository drifted/);
});

test("rejects output path that could mix environments", () => {
  const input = readInput();
  assert.throws(
    () => buildCloudBundle({ repoRoot, input, outputDirectory: ".artifacts/tke/staging" }),
    /must exactly match \.artifacts\/tke\/production/,
  );
});

test("rejects unsafe production capacity and inconsistent COS selection", () => {
  const replicas = readInput();
  replicas.helm.replicas.backend = 1;
  assert.throws(() => build(replicas), /production backend requires at least two replicas/);

  const cos = readInput();
  cos.dependencies.cosBucket = "xlb-another-bucket-100000000000";
  assert.throws(() => build(cos), /COS bucket drifted/);
});

test("rejects real input and image locks outside the ignored artifact root", () => {
  const input = readInput();
  input.imageLockFile = "deploy/tke/contracts/examples/images-lock.example.json";
  assert.throws(() => build(input), /schema validation|gitignored \.artifacts/);
});
