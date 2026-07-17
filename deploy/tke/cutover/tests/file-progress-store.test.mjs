import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createFileProgressStore } from "../file-progress-store.mjs";

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
  return { releaseId, planSha256, revision, status: "READY", ...extra };
}

function create(root, overrides = {}) {
  return createFileProgressStore({ artifactRoot: root, releaseId, planSha256, lockTimeoutMs: 100, retryDelayMs: 5, ...overrides });
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
  const store = create(root);
  assert.throws(() => store.compareAndSwap(0, progress(2)), /increment expectedRevision/);
  assert.throws(() => store.compareAndSwap(0, progress(1, { authorization: true })), /forbidden/);
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
  const clock = new Date(Date.now() + 60_000);
  const store = create(root, { now: () => clock });
  const exact = `RECOVER_ABANDONED_LOCK:${releaseId}:${planSha256}:${owner.nonce}`;
  assert.throws(() => store.recoverAbandonedLock({ expectedNonce: owner.nonce, minimumAgeMs: 1, confirmation: exact }), /still alive/);
  assert.throws(() => store.recoverAbandonedLock({ expectedNonce: owner.nonce, minimumAgeMs: 1, confirmation: `${exact}-wrong` }), /not exactly bound/);

  child.kill("SIGKILL");
  await waitForExit(child);
  const recovered = store.recoverAbandonedLock({ expectedNonce: owner.nonce, minimumAgeMs: 1, confirmation: exact });
  assert.equal(recovered.recoveredNonce, owner.nonce);
  assert.ok(recovered.quarantined.includes("quarantine"));
  assert.equal(store.compareAndSwap(0, progress(1)), true);
});
