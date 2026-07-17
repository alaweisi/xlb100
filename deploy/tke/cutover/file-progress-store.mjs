import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const releasePattern = /^[a-z0-9](?:[a-z0-9.-]{4,61}[a-z0-9])$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const forbiddenKeyPattern = /(?:confirmation|confirmed|approval|authorization|decision|grant|token|secret|credential|password|passwd|kubeconfig|privatekey|accesskey)/i;
export const PRODUCTION_RECOVERY_MINIMUM_AGE_MS = 15 * 60 * 1_000;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const progressSchema = JSON.parse(readFileSync(path.join(moduleDirectory, "cutover-progress.schema.json"), "utf8"));
const validateProgressSchema = new Ajv({ allErrors: true, strict: true }).compile(progressSchema);

const progressKeys = new Set([
  "schemaVersion", "releaseId", "environment", "trafficProvider", "planSha256", "artifactHashes",
  "initialWeight", "status", "currentWeight", "completedWeights", "observations", "pendingOperation",
  "failure", "rollback", "revision", "updatedAt",
]);
const nestedProgressKeys = Object.freeze({
  artifactHashes: new Set(["releaseManifest", "cloudBundle", "evidenceBundle", "checkpoint"]),
  pendingOperation: new Set(["direction", "phase", "fromWeight", "toWeight", "idempotencyKey", "providerEvidenceRef"]),
  failure: new Set(["kind", "retryable", "message"]),
  rollback: new Set(["status", "startedAtWeight", "reverseTargets", "transitions", "jobsHandoffRequired"]),
  observation: new Set(["direction", "weight", "providerEvidenceRef", "observationEvidenceRef", "observedAt", "durationSeconds", "result"]),
  rollbackTransition: new Set(["fromWeight", "toWeight", "providerEvidenceRef", "observationEvidenceRef", "observedAt", "durationSeconds", "result"]),
});
const lockOwnerKeys = new Set(["schemaVersion", "releaseId", "planSha256", "nonce", "pid", "hostname", "acquiredAt"]);

const fail = message => { throw new Error(message); };
const sleep = milliseconds => {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    fail(`${label} escapes the artifact root`);
  }
  return candidate;
}

function assertNotSymlink(candidate, label) {
  const stat = lstatSync(candidate);
  if (stat.isSymbolicLink()) fail(`${label} cannot be a symbolic link, junction, or reparse point`);
  return stat;
}

function entryExists(candidate) {
  try {
    lstatSync(candidate);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function inspectPersistedValue(value, location = "$") {
  if (typeof value === "number" && !Number.isFinite(value)) fail(`${location} must contain finite JSON data`);
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    fail(`${location} must contain JSON data only`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectPersistedValue(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Object.getPrototypeOf(value) !== Object.prototype) fail(`${location} must be a plain JSON object`);
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeyPattern.test(key)) fail(`${location}.${key} is forbidden in persisted progress`);
    inspectPersistedValue(child, `${location}.${key}`);
  }
}

function assertAllowedKeys(value, allowed, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${location} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${location}.${key} is not allowed by the persisted progress schema`);
  }
}

function validateProgressShape(value) {
  inspectPersistedValue(value);
  assertAllowedKeys(value, progressKeys, "$progress");
  assertAllowedKeys(value.artifactHashes, nestedProgressKeys.artifactHashes, "$progress.artifactHashes");
  if (value.pendingOperation !== undefined) assertAllowedKeys(value.pendingOperation, nestedProgressKeys.pendingOperation, "$progress.pendingOperation");
  if (value.failure !== undefined) assertAllowedKeys(value.failure, nestedProgressKeys.failure, "$progress.failure");
  assertAllowedKeys(value.rollback, nestedProgressKeys.rollback, "$progress.rollback");
  if (!Array.isArray(value.observations)) fail("$progress.observations must be an array");
  value.observations.forEach((item, index) => assertAllowedKeys(item, nestedProgressKeys.observation, `$progress.observations[${index}]`));
  if (!Array.isArray(value.rollback.transitions)) fail("$progress.rollback.transitions must be an array");
  value.rollback.transitions.forEach((item, index) => assertAllowedKeys(item, nestedProgressKeys.rollbackTransition, `$progress.rollback.transitions[${index}]`));
  if (!validateProgressSchema(value)) {
    const errors = validateProgressSchema.errors?.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ");
    fail(`persisted progress schema validation failed: ${errors || "unknown error"}`);
  }
}

function validateLockOwnerShape(owner, releaseId, planSha256, label) {
  inspectPersistedValue(owner, `$${label}`);
  assertAllowedKeys(owner, lockOwnerKeys, `$${label}`);
  if (owner.schemaVersion !== 1 || owner.releaseId !== releaseId || owner.planSha256 !== planSha256 ||
      typeof owner.nonce !== "string" || owner.nonce.length < 16 || !Number.isInteger(owner.pid) || owner.pid <= 0 ||
      typeof owner.hostname !== "string" || owner.hostname.length === 0 || typeof owner.acquiredAt !== "string" ||
      !Number.isFinite(Date.parse(owner.acquiredAt))) {
    fail(`${label} identity is corrupt or does not match this store`);
  }
  return owner;
}

function parseJsonFile(file, label) {
  let bytes;
  try {
    bytes = readFileSync(file, "utf8");
  } catch (error) {
    fail(`${label} cannot be read: ${error.message}`);
  }
  try {
    return JSON.parse(bytes);
  } catch {
    fail(`${label} is corrupt JSON; refusing temp-file recovery`);
  }
}

function durableWrite(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const descriptor = openSync(file, "wx", 0o600);
  try {
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch (error) {
    // Windows does not consistently permit opening/fsyncing directories. The
    // file itself is always flushed before rename; unsupported directory flush
    // is the only case ignored here.
    if (!new Set(["EACCES", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"]).has(error.code)) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function atomicReplace(temporary, destination) {
  // Node's rename maps to an atomic same-volume replacement. Antivirus and
  // indexers can briefly hold destinations on Windows, so retry only those
  // transient errors without ever unlinking the valid destination.
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(temporary, destination);
      return;
    } catch (error) {
      if (attempt >= 20 || !new Set(["EACCES", "EBUSY", "EPERM"]).has(error.code)) throw error;
      sleep(10);
    }
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "EPERM") return true;
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function createFileProgressStoreInternal({
  artifactRoot,
  releaseId,
  planSha256,
  lockTimeoutMs = 5_000,
  retryDelayMs = 25,
  now = () => new Date(),
}, recoveryMinimumAgeFloorMs) {
  if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot)) fail("artifactRoot must be an absolute path");
  if (!releasePattern.test(releaseId)) fail("releaseId is invalid");
  if (!sha256Pattern.test(planSha256)) fail("planSha256 must be a lowercase SHA-256");
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 0) fail("lockTimeoutMs must be a non-negative integer");
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 1) fail("retryDelayMs must be a positive integer");
  if (typeof now !== "function") fail("now must be a function");
  if (!Number.isInteger(recoveryMinimumAgeFloorMs) || recoveryMinimumAgeFloorMs < 0) {
    fail("recovery minimum-age floor must be a non-negative integer");
  }

  const root = path.resolve(artifactRoot);
  const releaseDirectory = assertContained(root, path.resolve(root, "releases", releaseId), "release directory");
  const storeDirectory = assertContained(root, path.resolve(releaseDirectory, "cutover-progress"), "store directory");
  const file = assertContained(root, path.resolve(storeDirectory, `${planSha256}.json`), "progress file");
  const lockDirectory = assertContained(root, path.resolve(storeDirectory, `${planSha256}.lock`), "lock directory");
  const ownerFile = path.join(lockDirectory, "owner.json");
  const recoveryMutexDirectory = assertContained(root, path.resolve(storeDirectory, `${planSha256}.recovery.lock`), "recovery mutex");
  const recoveryOwnerFile = path.join(recoveryMutexDirectory, "owner.json");
  const quarantineDirectory = assertContained(root, path.resolve(storeDirectory, "quarantine"), "quarantine directory");
  const tempPrefix = `${planSha256}.tmp-`;

  mkdirSync(root, { recursive: true });
  assertNotSymlink(root, "artifact root");
  if (!lstatSync(root).isDirectory()) fail("artifact root must be a directory");
  const physicalRoot = realpathSync(root);
  const assertPhysical = (candidate, label, expectedType) => {
    const stat = assertNotSymlink(candidate, label);
    if (expectedType === "directory" && !stat.isDirectory()) fail(`${label} must be a directory`);
    if (expectedType === "file" && !stat.isFile()) fail(`${label} must be a regular file`);
    const physical = realpathSync(candidate);
    assertContained(physicalRoot, physical, label);
    if (path.relative(path.resolve(candidate), physical) !== "") {
      fail(`${label} resolves through a junction, symlink, or reparse point`);
    }
    return stat;
  };
  for (const [directory, label] of [
    [path.join(root, "releases"), "releases directory"],
    [releaseDirectory, "release directory"],
    [storeDirectory, "store directory"],
  ]) {
    try { mkdirSync(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    assertPhysical(directory, label, "directory");
  }

  const assertStorePath = () => {
    assertPhysical(path.join(root, "releases"), "releases directory", "directory");
    assertPhysical(releaseDirectory, "release directory", "directory");
    assertPhysical(storeDirectory, "store directory", "directory");
  };
  const ensureQuarantineDirectory = () => {
    assertStorePath();
    try { mkdirSync(quarantineDirectory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    assertPhysical(quarantineDirectory, "quarantine directory", "directory");
    return quarantineDirectory;
  };

  const validateIdentity = (value, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be a JSON object`);
    validateProgressShape(value);
    if (value.releaseId !== releaseId) fail(`${label} releaseId drift detected`);
    if (value.planSha256 !== planSha256) fail(`${label} planSha256 drift detected`);
    return value;
  };

  const load = () => {
    assertStorePath();
    if (!entryExists(file)) return undefined;
    assertPhysical(file, "progress file", "file");
    return validateIdentity(parseJsonFile(file, "progress file"), "progress file");
  };

  const readOwner = () => {
    assertStorePath();
    if (!entryExists(lockDirectory)) fail("lock ownership was lost");
    assertPhysical(lockDirectory, "lock directory", "directory");
    if (!entryExists(ownerFile)) fail("lock owner metadata is missing; fail-closed recovery is required");
    assertPhysical(ownerFile, "lock owner metadata", "file");
    return validateLockOwnerShape(parseJsonFile(ownerFile, "lock owner metadata"), releaseId, planSha256, "lock owner");
  };

  const acquireLock = () => {
    const started = Date.now();
    while (true) {
      try {
        assertStorePath();
        mkdirSync(lockDirectory);
        assertPhysical(lockDirectory, "lock directory", "directory");
        const owner = {
          schemaVersion: 1,
          releaseId,
          planSha256,
          nonce: randomUUID(),
          pid: process.pid,
          hostname: hostname(),
          acquiredAt: now().toISOString(),
        };
        const temporaryOwner = path.join(lockDirectory, `owner.tmp-${owner.nonce}`);
        durableWrite(temporaryOwner, owner);
        assertPhysical(temporaryOwner, "temporary lock owner metadata", "file");
        renameSync(temporaryOwner, ownerFile);
        assertPhysical(ownerFile, "lock owner metadata", "file");
        syncDirectory(lockDirectory);

        let released = false;
        const assertOwnership = () => {
          if (released) fail("lock has already been released");
          const current = readOwner();
          if (current.nonce !== owner.nonce) fail("lock owner nonce changed; stale owner is fenced");
          return current;
        };
        const release = () => {
          assertOwnership();
          rmSync(lockDirectory, { recursive: true, force: false });
          released = true;
          syncDirectory(storeDirectory);
        };
        return Object.freeze({ ...owner, assertOwnership, release });
      } catch (error) {
        if (error.code !== "EEXIST") {
          // An exclusive directory may have been created before owner metadata
          // failed. Leave it in place and require controlled recovery.
          throw error;
        }
        if (Date.now() - started >= lockTimeoutMs) fail(`progress lock timeout after ${lockTimeoutMs}ms; refusing unlocked write`);
        sleep(Math.min(retryDelayMs, Math.max(1, lockTimeoutMs - (Date.now() - started))));
      }
    }
  };

  const quarantineTemps = lock => {
    lock.assertOwnership();
    assertStorePath();
    const temporaryFiles = readdirSync(storeDirectory, { withFileTypes: true })
      .filter(entry => entry.name.startsWith(tempPrefix));
    if (temporaryFiles.length === 0) return [];
    ensureQuarantineDirectory();
    return temporaryFiles.map(entry => {
      lock.assertOwnership();
      const source = path.join(storeDirectory, entry.name);
      assertPhysical(source, "orphan temporary progress file", "file");
      assertPhysical(quarantineDirectory, "quarantine directory", "directory");
      const destination = path.join(quarantineDirectory, `${entry.name}.orphan-${randomUUID()}`);
      renameSync(source, destination);
      assertPhysical(destination, "quarantined temporary progress file", "file");
      return destination;
    });
  };

  const compareAndSwap = (expectedRevision, next) => {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) fail("expectedRevision must be a non-negative integer");
    validateIdentity(next, "next progress");
    if (next.revision !== expectedRevision + 1) fail("next progress revision must increment expectedRevision exactly once");
    const lock = acquireLock();
    try {
      quarantineTemps(lock);
      lock.assertOwnership();
      const current = load();
      const actualRevision = current?.revision ?? 0;
      if (!Number.isInteger(actualRevision) || (current && actualRevision < 1)) fail("persisted progress revision is invalid");
      if (actualRevision !== expectedRevision) return false;

      // Recheck both the persisted identity and canonical lock nonce directly
      // before committing. A recovered old owner is thereby fenced even if it
      // resumes after doing earlier work.
      if (current) validateIdentity(current, "progress file");
      lock.assertOwnership();
      const temporary = path.join(storeDirectory, `${tempPrefix}${lock.nonce}-${randomUUID()}`);
      durableWrite(temporary, next);
      try {
        assertPhysical(temporary, "temporary progress file", "file");
        lock.assertOwnership();
        atomicReplace(temporary, file);
        assertPhysical(file, "progress file", "file");
        syncDirectory(storeDirectory);
      } catch (error) {
        // A failed write is never promoted on a future load/CAS.
        if (entryExists(temporary)) {
          assertPhysical(temporary, "failed temporary progress file", "file");
          ensureQuarantineDirectory();
          const failedDestination = path.join(quarantineDirectory, `${path.basename(temporary)}.failed-${randomUUID()}`);
          renameSync(temporary, failedDestination);
          assertPhysical(failedDestination, "quarantined failed progress file", "file");
        }
        throw error;
      }
      return true;
    } finally {
      lock.release();
    }
  };

  const acquireRecoveryMutex = () => {
    assertStorePath();
    try {
      mkdirSync(recoveryMutexDirectory);
    } catch (error) {
      if (error.code === "EEXIST") fail("lock recovery is already in progress");
      throw error;
    }
    assertPhysical(recoveryMutexDirectory, "recovery mutex", "directory");
    const owner = {
      schemaVersion: 1,
      releaseId,
      planSha256,
      nonce: randomUUID(),
      pid: process.pid,
      hostname: hostname(),
      acquiredAt: now().toISOString(),
    };
    const temporaryOwner = path.join(recoveryMutexDirectory, `owner.tmp-${owner.nonce}`);
    durableWrite(temporaryOwner, owner);
    assertPhysical(temporaryOwner, "temporary recovery owner metadata", "file");
    renameSync(temporaryOwner, recoveryOwnerFile);
    assertPhysical(recoveryOwnerFile, "recovery owner metadata", "file");
    syncDirectory(recoveryMutexDirectory);

    let released = false;
    const assertOwnership = () => {
      if (released) fail("recovery mutex has already been released");
      assertPhysical(recoveryMutexDirectory, "recovery mutex", "directory");
      assertPhysical(recoveryOwnerFile, "recovery owner metadata", "file");
      const current = validateLockOwnerShape(
        parseJsonFile(recoveryOwnerFile, "recovery owner metadata"), releaseId, planSha256, "recovery owner",
      );
      if (current.releaseId !== releaseId || current.planSha256 !== planSha256 || current.nonce !== owner.nonce) {
        fail("recovery mutex nonce changed; stale recovery worker is fenced");
      }
      return current;
    };
    const release = () => {
      assertOwnership();
      rmSync(recoveryMutexDirectory, { recursive: true, force: false });
      released = true;
      syncDirectory(storeDirectory);
    };
    return Object.freeze({ ...owner, assertOwnership, release });
  };

  const recoverAbandonedLock = ({ expectedNonce, minimumAgeMs = recoveryMinimumAgeFloorMs, confirmation } = {}) => {
    if (typeof expectedNonce !== "string" || expectedNonce.length < 16) fail("expectedNonce is required for lock recovery");
    if (!Number.isInteger(minimumAgeMs) || minimumAgeMs < 0) fail("minimumAgeMs must be a non-negative integer");
    if (minimumAgeMs < recoveryMinimumAgeFloorMs) {
      fail(`minimumAgeMs cannot be lower than the ${recoveryMinimumAgeFloorMs}ms recovery safety floor`);
    }
    const expectedConfirmation = `RECOVER_ABANDONED_LOCK:${releaseId}:${planSha256}:${expectedNonce}:${minimumAgeMs}:RECOVER`;
    if (confirmation !== expectedConfirmation) {
      fail("lock recovery confirmation is not exactly bound to releaseId, planSha256, lockNonce, minimumAgeMs, and action");
    }

    const recovery = acquireRecoveryMutex();
    try {
      recovery.assertOwnership();
      // Everything affecting the canonical owner is deliberately repeated
      // inside the exclusive recovery mutex. This closes double-recovery and
      // owner replacement (ABA) races.
      const owner = readOwner();
      if (owner.nonce !== expectedNonce) fail("lock recovery nonce does not match the current owner");
      if (owner.hostname !== hostname()) {
        fail(`lock owner host ${owner.hostname} differs from this host; external fencing is required`);
      }
      const acquiredAt = Date.parse(owner.acquiredAt);
      if (!Number.isFinite(acquiredAt)) fail("lock owner acquiredAt is invalid");
      const ageMs = now().getTime() - acquiredAt;
      if (ageMs < minimumAgeMs) fail(`lock age ${ageMs}ms is below required ${minimumAgeMs}ms`);
      if (isProcessAlive(owner.pid)) fail(`lock owner process ${owner.pid} is still alive; recovery denied`);

      recovery.assertOwnership();
      assertPhysical(lockDirectory, "lock directory", "directory");
      assertPhysical(ownerFile, "lock owner metadata", "file");
      const targetOwner = readOwner();
      if (targetOwner.nonce !== expectedNonce) fail("lock owner changed during recovery; refusing to quarantine a new owner");
      ensureQuarantineDirectory();
      recovery.assertOwnership();
      const finalOwner = readOwner();
      if (finalOwner.nonce !== expectedNonce) fail("lock owner changed immediately before quarantine; refusing to isolate it");
      recovery.assertOwnership();
      const quarantined = path.join(quarantineDirectory, `${path.basename(lockDirectory)}.abandoned-${expectedNonce}-${randomUUID()}`);
      renameSync(lockDirectory, quarantined);
      assertPhysical(quarantined, "quarantined abandoned lock", "directory");
      const quarantinedOwner = path.join(quarantined, "owner.json");
      assertPhysical(quarantinedOwner, "quarantined lock owner metadata", "file");
      if (parseJsonFile(quarantinedOwner, "quarantined lock owner metadata").nonce !== expectedNonce) {
        fail("quarantined lock owner nonce drift detected");
      }
      syncDirectory(storeDirectory);
      return Object.freeze({ releaseId, planSha256, recoveredNonce: expectedNonce, ageMs, minimumAgeMs, quarantined });
    } finally {
      recovery.release();
    }
  };

  return Object.freeze({ file, lockDirectory, recoveryMutexDirectory, load, compareAndSwap, acquireLock, recoverAbandonedLock });
}

export function createFileProgressStore(options) {
  return createFileProgressStoreInternal(options, PRODUCTION_RECOVERY_MINIMUM_AGE_MS);
}

// The production constructor above has an immutable safety floor. Tests may
// use this explicitly named constructor to exercise age boundaries without a
// real fifteen-minute wait; product runtime code must never import it.
export function createFileProgressStoreForTest(options, { minimumRecoveryAgeFloorMs = 0 } = {}) {
  return createFileProgressStoreInternal(options, minimumRecoveryAgeFloorMs);
}
