# TKE provider-neutral cutover controller

This Wave 2 / P5 component prepares and drives the fixed traffic staircase:

```text
Lighthouse -> 5% TKE -> 25% TKE -> 50% TKE -> 100% TKE
```

It consumes the frozen Wave 0 contracts and the reviewed Wave 1 cloud and
safety artifacts. It does not contain Tencent credentials or call Tencent
Cloud by itself. The command-line interface can only create an offline plan:

```powershell
node deploy/tke/cutover/cutover-controller.mjs `
  --request .artifacts/tke/releases/<release-id>/cutover-request.json `
  --output .artifacts/tke/releases/<release-id>/cutover-plan.json
```

## Safety boundary

- The release ID, environment, provider, four input hashes, checkpoint bindings,
  Jobs single-active state, and existing traffic prefix must all agree.
- The only forward order is `5 -> 25 -> 50 -> 100`; completed steps are
  idempotent and skipped levels are rejected.
- Every level, including reverse rollback levels, needs passed observation
  evidence for at least 900 seconds.
- CLB and DNS adapters require an injected transport. There is no built-in real
  provider transport and no default external execution path.
- A runtime execution token is a transient method argument bound exactly to the
  release ID, plan SHA, action, and target weight. Plans and progress reject
  persisted credentials, approvals, authorizations, confirmations, and tokens.
- Every runtime call accepts original evidence bytes or an ignored evidence
  file, recalculates SHA-256 before parsing JSON, then checks release,
  environment, and Jobs state. A caller-supplied claimed hash is never trusted.
- Progress has a strict schema and semantic validator. Its revision is updated
  by compare-and-swap, and its status/current weight/completed prefix/pending
  operation/rollback chain are checked as one unit. Read, apply, and observation
  failures retain distinct resumable checkpoints and a stable idempotency key.
- Rollback walks the applied weights in reverse to zero, recording provider and
  observation evidence for every transition. Its terminal result is deliberately
  `TRAFFIC_ROLLED_BACK`, not the release-level `ROLLED_BACK`; the orchestrator
  must still hand Jobs back, complete application rollback, and close the global
  release checkpoint.

The integration owner wires this library to the P4 orchestrator and chooses a
real provider transport only during a separately authorized N7/N8 execution.

`runtime.mjs` is the product composition root. Production and staging default
to the durable file store; they cannot select or inject memory progress.
Simulation must opt into memory explicitly:

```js
const { controller, store, adapter } = createCutoverRuntime({
  plan, artifactRoot, transport, observer, mode: "production", now,
});

const simulation = createCutoverRuntime({
  plan, artifactRoot, transport, observer,
  mode: "simulation", storeType: "memory",
});
```

## Cross-process progress store

`file-progress-store.mjs` is the production file-backed implementation of the
controller's synchronous progress-store contract:

```js
const store = createFileProgressStore({
  artifactRoot: absoluteArtifactDirectory,
  releaseId,
  planSha256,
});
```

It places a release/plan-isolated JSON checkpoint and exclusive lock below the
given artifact root. `compareAndSwap(expectedRevision, next)` acquires a
`mkdir` lock, rereads revision and identity inside the lock, flushes a unique
temporary file, and atomically renames it. Corrupt main JSON is fail-closed and
orphan temporary files are quarantined rather than promoted.

`recoverAbandonedLock` is deliberately separate from normal CAS. It requires a
dead owner PID, a minimum lock age that cannot go below the production
15-minute safety floor, the exact current nonce,
and this exact transient confirmation string:

```text
RECOVER_ABANDONED_LOCK:<releaseId>:<planSha256>:<ownerNonce>:<minimumAgeMs>:RECOVER
```

Recovery first acquires a separate nonce-owned recovery mutex, then rereads the
canonical owner and verifies its nonce immediately before quarantine. Two
recoverers therefore cannot quarantine the same owner, and an ABA replacement
owner cannot be isolated by stale recovery intent. Recovery quarantines the
canonical lock directory. The old owner can no longer
pass the canonical nonce check and therefore cannot commit progress after it
resumes. Every load, quarantine, and recovery operation rechecks `lstat`,
physical containment, and rejects symlinks/junctions/reparse aliases. Owner
metadata also records the host name. Automatic recovery is
allowed only for a dead PID on the same host; a lock from another host fails
closed and requires external storage/provider fencing. Neither checkpoints nor
lock metadata may contain credentials, authorizations, approvals,
confirmations, or execution tokens.
