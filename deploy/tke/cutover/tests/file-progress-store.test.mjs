import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as fileStoreModule from "../file-progress-store.mjs";
import { createFileProgressStore, PRODUCTION_RECOVERY_MINIMUM_AGE_MS } from "../file-progress-store.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const childFixture = path.join(directory, "file-progress-store-child.mjs");
const releaseId = "release-store-001";
const planSha256 = "a".repeat(64);

function temporaryRoot(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "xlb-cutover-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function progress(revision, extra = {}) {
  return {
    schemaVersion: 1,
    releaseId,
    environment: "production",
    trafficProvider: "clb",
    planSha256,
    artifactHashes: {
      releaseManifest: "b".repeat(64), cloudBundle: "c".repeat(64),
      evidenceBundle: "d".repeat(64), checkpoint: "e".repeat(64),
    },
    initialWeight: 0,
    status: "READY",
    currentWeight: 0,
    completedWeights: [],
    observations: [],
    rollback: { status: "NOT_STARTED", transitions: [] },
    revision,
    updatedAt: "2026-07-17T01:00:00Z",
    ...extra,
  };
}

function create(root, overrides = {}) {
  return createFileProgressStore({ artifactRoot: root, releaseId, planSha256, lockTimeoutMs: 100, retryDelayMs: 5, ...overrides });
}

function ageOwner(ownerFile, overrides = {}) {
  const owner = JSON.parse(readFileSync(ownerFile, "utf8"));
  const aged = {
    ...owner,
    pid: 2_000_000_000,
    acquiredAt: new Date(Date.now() - PRODUCTION_RECOVERY_MINIMUM_AGE_MS - 60_000).toISOString(),
    ...overrides,
  };
  writeFileSync(ownerFile, `${JSON.stringify(aged)}\n`, "utf8");
  return aged;
}

function recoveryRequest(targetNonce, recoveryNonce = "r".repeat(32)) {
  const minimumAgeMs = PRODUCTION_RECOVERY_MINIMUM_AGE_MS;
  return {
    expectedNonce: targetNonce,
    recoveryNonce,
    minimumAgeMs,
    confirmation: `RECOVER_ABANDONED_LOCK:${releaseId}:${planSha256}:${targetNonce}:${recoveryNonce}:${minimumAgeMs}:RECOVER`,
  };
}

function childEnvironment(root, extra = {}) {
  return {
    ...process.env,
    XLB_FILE_STORE_OPTIONS: JSON.stringify({
      artifactRoot: root,
      releaseId,
      planSha256,
      lockTimeoutMs: 100,
      retryDelayMs: 5,
      ...extra,
    }),
  };
}

function waitForLine(stream) {
  return new Promise((resolve, reject) => {
    let pending = "";
    stream.setEncoding("utf8");
    stream.on("data", chunk => {
      pending += chunk;
      const newline = pending.indexOf("\n");
      if (newline >= 0) resolve(pending.slice(0, newline));
    });
    stream.on("error", reject);
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
}

function runCasChild(root, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [childFixture, "cas"], {
      env: { ...childEnvironment(root), XLB_FILE_STORE_CAS: JSON.stringify(request) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => {
      if (code !== 0) reject(new Error(`CAS child exited ${code}: ${stderr}`));
      else resolve(JSON.parse(stdout).won);
    });
  });
}

function runRecoveryChild(root, request, crashAt) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [childFixture, "recover"], {
      env: {
        ...childEnvironment(root),
        XLB_FILE_STORE_RECOVERY: JSON.stringify(request),
        ...(crashAt ? { XLB_FILE_STORE_RECOVERY_CRASH_AT: crashAt } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => resolve({ code, stdout, stderr }));
  });
}

test("file store performs identity-bound durable CAS and isolates release/plan paths", t => {
  const root = temporaryRoot(t);
  const store = create(root);
  const otherRelease = createFileProgressStore({
    artifactRoot: root,
    releaseId: "release-store-002",
    planSha256,
  });
  const otherPlan = createFileProgressStore({
    artifactRoot: root,
    releaseId,
    planSha256: "b".repeat(64),
  });

  assert.equal(store.load(), undefined);
  assert.equal(store.compareAndSwap(0, progress(1)), true);
  assert.deepEqual(store.load(), progress(1));
  assert.equal(store.compareAndSwap(0, progress(1)), false);
  assert.equal(store.compareAndSwap(1, progress(2, { status: "APPLY_PENDING" })), true);
  assert.equal(store.load().revision, 2);
  assert.notEqual(store.file, otherRelease.file);
  assert.notEqual(store.file, otherPlan.file);
  assert.ok(path.isAbsolute(store.file));
  assert.ok(path.relative(root, store.file).startsWith(`releases${path.sep}`));
});

test("rejects traversal identities, revision jumps, and persisted decisions or secrets", t => {
  const root = temporaryRoot(t);
  assert.throws(() => createFileProgressStore({ artifactRoot: "relative", releaseId, planSha256 }), /absolute path/);
  assert.throws(() => createFileProgressStore({ artifactRoot: root, releaseId: "../escape", planSha256 }), /releaseId is invalid/);
  assert.throws(
    () => createFileProgressStore({ artifactRoot: root, releaseId, planSha256, now: () => new Date(0) }),
    /unsupported file progress store option: now/,
  );
  assert.equal("createFileProgressStoreForTest" in fileStoreModule, false);
  const store = create(root);
  assert.throws(() => store.compareAndSwap(0, progress(2)), /increment expectedRevision/);
  assert.throws(() => store.compareAndSwap(0, progress(1, { authorization: true })), /forbidden/);
  assert.throws(() => store.compareAndSwap(0, progress(1, { nested: { releaseConfirmation: "yes" } })), /forbidden/);
  assert.throws(() => store.compareAndSwap(0, progress(1, { unexpected: true })), /not allowed/);
  assert.equal(store.load(), undefined);
});

test("corrupt main progress fails closed and orphan temps are quarantined, never promoted", t => {
  const root = temporaryRoot(t);
  const store = create(root);
  mkdirSync(path.dirname(store.file), { recursive: true });
  writeFileSync(store.file, "{not-json", "utf8");
  writeFileSync(path.join(path.dirname(store.file), `${planSha256}.tmp-orphan`), JSON.stringify(progress(99)), "utf8");
  assert.throws(() => store.load(), /corrupt JSON.*refusing temp-file recovery/);
  assert.throws(() => store.compareAndSwap(0, progress(1)), /corrupt JSON/);
  assert.equal(readFileSync(store.file, "utf8"), "{not-json");
  const quarantined = path.join(path.dirname(store.file), "quarantine");
  assert.equal(readdirSync(quarantined).length, 1);
  assert.match(readdirSync(quarantined)[0], /\.tmp-orphan\.orphan-/);
});

test("exclusive lock times out fail-closed and released locks can be reacquired", t => {
  const root = temporaryRoot(t);
  const store = create(root, { lockTimeoutMs: 20, retryDelayMs: 2 });
  const lock = store.acquireLock();
  assert.ok(lock.nonce);
  assert.throws(() => store.compareAndSwap(0, progress(1)), /lock timeout.*refusing unlocked write/);
  assert.equal(store.load(), undefined);
  lock.release();
  assert.equal(store.compareAndSwap(0, progress(1)), true);
});

test("two child processes racing the same revision produce exactly one CAS winner", async t => {
  const root = temporaryRoot(t);
  const request = { expectedRevision: 0, next: progress(1) };
  const outcomes = await Promise.all([runCasChild(root, request), runCasChild(root, request)]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  assert.equal(create(root).load().revision, 1);
});

test("abandoned lock recovery requires dead owner, age, nonce, and exact confirmation", async t => {
  const root = temporaryRoot(t);
  const child = spawn(process.execPath, [childFixture, "hold"], {
    env: childEnvironment(root),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const owner = JSON.parse(await waitForLine(child.stdout));
  const store = create(root);
  const request = recoveryRequest(owner.nonce);
  ageOwner(path.join(store.lockDirectory, "owner.json"), { pid: owner.pid });
  assert.throws(() => store.recoverAbandonedLock(request), /still alive/);
  assert.throws(() => store.recoverAbandonedLock({ ...request, confirmation: `${request.confirmation}-wrong` }), /not exactly bound/);

  child.kill("SIGKILL");
  await waitForExit(child);
  ageOwner(path.join(store.lockDirectory, "owner.json"));
  const recovered = store.recoverAbandonedLock(request);
  assert.equal(recovered.recoveredNonce, owner.nonce);
  assert.ok(recovered.quarantined.includes("quarantine"));
  assert.equal(store.compareAndSwap(0, progress(1)), true);
});

test("production recovery minimum age is an immutable floor bound into confirmation", t => {
  const root = temporaryRoot(t);
  const store = create(root);
  const nonce = "1".repeat(32);
  const lowered = PRODUCTION_RECOVERY_MINIMUM_AGE_MS - 1;
  const recoveryNonce = "r".repeat(32);
  const confirmation = `RECOVER_ABANDONED_LOCK:${releaseId}:${planSha256}:${nonce}:${recoveryNonce}:${lowered}:RECOVER`;
  assert.throws(
    () => store.recoverAbandonedLock({ expectedNonce: nonce, recoveryNonce, minimumAgeMs: lowered, confirmation }),
    /cannot be lower.*safety floor/,
  );
});

test("recovery rejects a junction or symlink before reading or quarantining its owner", t => {
  const root = temporaryRoot(t);
  const outside = temporaryRoot(t);
  const store = create(root);
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, store.lockDirectory, process.platform === "win32" ? "junction" : "dir");
  const nonce = "2".repeat(32);
  assert.throws(
    () => store.recoverAbandonedLock(recoveryRequest(nonce)),
    /symbolic link, junction, or reparse point|resolves through/,
  );
  assert.ok(readdirSync(outside).length === 0);
});

test("orphan quarantine rejects a symlink instead of following it outside artifactRoot", t => {
  const root = temporaryRoot(t);
  const outside = temporaryRoot(t);
  const store = create(root);
  const outsideFile = path.join(outside, "outside.json");
  writeFileSync(outsideFile, `${JSON.stringify(progress(99))}\n`, "utf8");
  const orphan = path.join(path.dirname(store.file), `${planSha256}.tmp-malicious`);
  symlinkSync(outside, orphan, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => store.compareAndSwap(0, progress(1)), /symbolic link, junction, or reparse point|resolves through/);
  assert.equal(JSON.parse(readFileSync(outsideFile, "utf8")).revision, 99);
  assert.equal(store.load(), undefined);
});

test("two recovery workers cannot both quarantine the same abandoned owner", async t => {
  const root = temporaryRoot(t);
  const child = spawn(process.execPath, [childFixture, "hold"], {
    env: childEnvironment(root),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const owner = JSON.parse(await waitForLine(child.stdout));
  child.kill("SIGKILL");
  await waitForExit(child);
  const store = create(root);
  ageOwner(path.join(store.lockDirectory, "owner.json"));

  const recovery = recoveryRequest(owner.nonce);
  const run = () => new Promise(resolve => {
    const worker = spawn(process.execPath, [childFixture, "recover"], {
      env: { ...childEnvironment(root), XLB_FILE_STORE_RECOVERY: JSON.stringify(recovery) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    worker.stdout.on("data", chunk => { stdout += chunk; });
    worker.on("exit", code => resolve({ code, stdout }));
  });
  const results = await Promise.all([run(), run()]);
  assert.equal(results.filter(item => item.code === 0).length, 1);
  assert.equal(results.filter(item => item.code !== 0).length, 1);
  assert.equal(readdirSync(path.join(path.dirname(create(root).file), "quarantine")).filter(name => name.includes(".abandoned-")).length, 1);
});

for (const crashAt of ["after-claim-owner", "after-target-quarantine", "before-claim-release"]) {
  test(`a dead recovery owner can be fenced and resumed after crash at ${crashAt}`, async t => {
    const root = temporaryRoot(t);
    const holder = spawn(process.execPath, [childFixture, "hold"], {
      env: childEnvironment(root),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const target = JSON.parse(await waitForLine(holder.stdout));
    holder.kill("SIGKILL");
    await waitForExit(holder);
    const store = create(root);
    ageOwner(path.join(store.lockDirectory, "owner.json"));
    const request = recoveryRequest(target.nonce, `${crashAt[0]}${"r".repeat(31)}`);

    const crashed = await runRecoveryChild(root, request, crashAt);
    assert.equal(crashed.code, 86);
    assert.match(crashed.stdout, new RegExp(`"stage":"${crashAt}"`));
    assert.ok(lstatExists(store.recoveryClaimDirectory));
    const claimFile = path.join(store.recoveryClaimDirectory, "owner.json");
    assert.equal(JSON.parse(readFileSync(claimFile, "utf8")).recoveryNonce, request.recoveryNonce);
    if (crashAt === "after-claim-owner") assert.ok(lstatExists(store.lockDirectory));
    else assert.equal(lstatExists(store.lockDirectory), false);

    ageOwner(claimFile);
    const resumed = await runRecoveryChild(root, request);
    assert.equal(resumed.code, 0, resumed.stderr);
    assert.match(resumed.stdout, /"recovered":true/);
    assert.equal(lstatExists(store.recoveryClaimDirectory), false);
    assert.equal(lstatExists(store.lockDirectory), false);
    assert.equal(store.compareAndSwap(0, progress(1)), true);
  });
}

test("resuming a crashed recovery completes from evidence and preserves a newly acquired canonical owner", async t => {
  const root = temporaryRoot(t);
  const store = create(root);
  mkdirSync(store.lockDirectory);
  const targetNonce = "5".repeat(32);
  writeFileSync(path.join(store.lockDirectory, "owner.json"), `${JSON.stringify({
    schemaVersion: 1, releaseId, planSha256, nonce: targetNonce, hostname: os.hostname(),
    pid: 2_000_000_000,
    acquiredAt: new Date(Date.now() - PRODUCTION_RECOVERY_MINIMUM_AGE_MS - 60_000).toISOString(),
  })}\n`, "utf8");
  const request = recoveryRequest(targetNonce, "6".repeat(32));
  const crashed = await runRecoveryChild(root, request, "after-target-quarantine");
  assert.equal(crashed.code, 86);
  const newOwner = store.acquireLock();
  ageOwner(path.join(store.recoveryClaimDirectory, "owner.json"));

  const resumed = await runRecoveryChild(root, request);
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.match(resumed.stdout, /"recovered":true/);
  assert.equal(JSON.parse(readFileSync(path.join(store.lockDirectory, "owner.json"), "utf8")).nonce, newOwner.nonce);
  newOwner.release();
});

test("a recovered primary owner is permanently fenced from subsequent writes", t => {
  const root = temporaryRoot(t);
  const store = create(root);
  const stale = store.acquireLock();
  ageOwner(path.join(store.lockDirectory, "owner.json"), { nonce: stale.nonce });
  store.recoverAbandonedLock(recoveryRequest(stale.nonce, "7".repeat(32)));
  assert.throws(() => stale.assertOwnership(), /ownership was lost|fenced/);
  assert.equal(store.load(), undefined);
  assert.equal(store.compareAndSwap(0, progress(1)), true);
});

test("recovery refuses a replacement owner and never quarantines an ABA target", t => {
  const root = temporaryRoot(t);
  const bootstrap = create(root);
  mkdirSync(bootstrap.lockDirectory);
  const oldNonce = "3".repeat(32);
  const newNonce = "4".repeat(32);
  const acquiredAt = new Date(Date.now() - PRODUCTION_RECOVERY_MINIMUM_AGE_MS - 60_000).toISOString();
  const ownerFile = path.join(bootstrap.lockDirectory, "owner.json");
  const owner = nonce => ({
    schemaVersion: 1, releaseId, planSha256, nonce, pid: 2_000_000_000,
    hostname: os.hostname(), acquiredAt,
  });
  writeFileSync(ownerFile, `${JSON.stringify(owner(oldNonce))}\n`, "utf8");
  writeFileSync(ownerFile, `${JSON.stringify(owner(newNonce))}\n`, "utf8");
  const store = create(root);
  assert.throws(
    () => store.recoverAbandonedLock(recoveryRequest(oldNonce)),
    /owner changed|nonce does not match/,
  );
  assert.equal(JSON.parse(readFileSync(ownerFile, "utf8")).nonce, newNonce);
  assert.ok(lstatExists(bootstrap.lockDirectory));
});

function lstatExists(candidate) {
  try {
    return Boolean(readFileSync(path.join(candidate, "owner.json")));
  } catch {
    return false;
  }
}
