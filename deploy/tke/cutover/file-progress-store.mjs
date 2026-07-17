import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
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

const releasePattern = /^[a-z0-9](?:[a-z0-9.-]{4,61}[a-z0-9])$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const forbiddenKeyPattern = /^(?:password|passwd|secret|secretKey|secretValue|token|sessionToken|credential|credentials|kubeconfig|privateKey|accessKeyId|accessKeySecret|authorization|authorizations|approval|approvals|confirmed|executionGrant)$/i;

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
  if (lstatSync(candidate).isSymbolicLink()) fail(`${label} cannot be a symbolic link`);
}

function inspectPersistedValue(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectPersistedValue(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeyPattern.test(key)) fail(`${location}.${key} is forbidden in persisted progress`);
    inspectPersistedValue(child, `${location}.${key}`);
  }
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

export function createFileProgressStore({
  artifactRoot,
  releaseId,
  planSha256,
  lockTimeoutMs = 5_000,
  retryDelayMs = 25,
  now = () => new Date(),
}) {
  if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot)) fail("artifactRoot must be an absolute path");
  if (!releasePattern.test(releaseId)) fail("releaseId is invalid");
  if (!sha256Pattern.test(planSha256)) fail("planSha256 must be a lowercase SHA-256");
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 0) fail("lockTimeoutMs must be a non-negative integer");
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 1) fail("retryDelayMs must be a positive integer");
  if (typeof now !== "function") fail("now must be a function");

  const root = path.resolve(artifactRoot);
  const releaseDirectory = assertContained(root, path.resolve(root, "releases", releaseId), "release directory");
  const storeDirectory = assertContained(root, path.resolve(releaseDirectory, "cutover-progress"), "store directory");
  const file = assertContained(root, path.resolve(storeDirectory, `${planSha256}.json`), "progress file");
  const lockDirectory = assertContained(root, path.resolve(storeDirectory, `${planSha256}.lock`), "lock directory");
  const ownerFile = path.join(lockDirectory, "owner.json");
  const quarantineDirectory = assertContained(root, path.resolve(storeDirectory, "quarantine"), "quarantine directory");
  const tempPrefix = `${planSha256}.tmp-`;

  mkdirSync(root, { recursive: true });
  const physicalRoot = realpathSync(root);
  for (const [directory, label] of [
    [path.join(root, "releases"), "releases directory"],
    [releaseDirectory, "release directory"],
    [storeDirectory, "store directory"],
  ]) {
    try { mkdirSync(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    assertNotSymlink(directory, label);
    if (!lstatSync(directory).isDirectory()) fail(`${label} must be a directory`);
    assertContained(physicalRoot, realpathSync(directory), label);
  }

  const validateIdentity = (value, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be a JSON object`);
    inspectPersistedValue(value);
    if (value.releaseId !== releaseId) fail(`${label} releaseId drift detected`);
    if (value.planSha256 !== planSha256) fail(`${label} planSha256 drift detected`);
    return value;
  };

  const load = () => {
    if (!existsSync(file)) return undefined;
    assertNotSymlink(file, "progress file");
    return validateIdentity(parseJsonFile(file, "progress file"), "progress file");
  };

  const readOwner = () => {
    if (!existsSync(lockDirectory)) fail("lock ownership was lost");
    assertNotSymlink(lockDirectory, "lock directory");
    if (!existsSync(ownerFile)) fail("lock owner metadata is missing; fail-closed recovery is required");
    assertNotSymlink(ownerFile, "lock owner metadata");
    const owner = parseJsonFile(ownerFile, "lock owner metadata");
    if (owner.schemaVersion !== 1 || owner.releaseId !== releaseId || owner.planSha256 !== planSha256 ||
        typeof owner.nonce !== "string" || !Number.isInteger(owner.pid) || typeof owner.hostname !== "string" ||
        owner.hostname.length === 0 || typeof owner.acquiredAt !== "string") {
      fail("lock owner identity is corrupt or does not match this store");
    }
    return owner;
  };

  const acquireLock = () => {
    const started = Date.now();
    while (true) {
      try {
        mkdirSync(lockDirectory);
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
        renameSync(temporaryOwner, ownerFile);
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
    const temporaryFiles = readdirSync(storeDirectory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.startsWith(tempPrefix));
    if (temporaryFiles.length === 0) return [];
    mkdirSync(quarantineDirectory, { recursive: true });
    return temporaryFiles.map(entry => {
      lock.assertOwnership();
      const source = path.join(storeDirectory, entry.name);
      const destination = path.join(quarantineDirectory, `${entry.name}.orphan-${randomUUID()}`);
      renameSync(source, destination);
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
        lock.assertOwnership();
        atomicReplace(temporary, file);
        syncDirectory(storeDirectory);
      } catch (error) {
        // A failed write is never promoted on a future load/CAS.
        if (existsSync(temporary)) {
          mkdirSync(quarantineDirectory, { recursive: true });
          renameSync(temporary, path.join(quarantineDirectory, `${path.basename(temporary)}.failed-${randomUUID()}`));
        }
        throw error;
      }
      return true;
    } finally {
      lock.release();
    }
  };

  const recoverAbandonedLock = ({ expectedNonce, minimumAgeMs, confirmation } = {}) => {
    if (typeof expectedNonce !== "string" || expectedNonce.length < 16) fail("expectedNonce is required for lock recovery");
    if (!Number.isInteger(minimumAgeMs) || minimumAgeMs < 0) fail("minimumAgeMs must be a non-negative integer");
    const expectedConfirmation = `RECOVER_ABANDONED_LOCK:${releaseId}:${planSha256}:${expectedNonce}`;
    if (confirmation !== expectedConfirmation) fail("lock recovery confirmation is not exactly bound to release, plan, and nonce");
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

    mkdirSync(quarantineDirectory, { recursive: true });
    // Rename of the canonical lock is the fencing point: every writer checks
    // the canonical owner immediately before its progress rename.
    const quarantined = path.join(quarantineDirectory, `${path.basename(lockDirectory)}.abandoned-${expectedNonce}-${randomUUID()}`);
    renameSync(lockDirectory, quarantined);
    syncDirectory(storeDirectory);
    return Object.freeze({ releaseId, planSha256, recoveredNonce: expectedNonce, ageMs, quarantined });
  };

  return Object.freeze({ file, lockDirectory, load, compareAndSwap, acquireLock, recoverAbandonedLock });
}
