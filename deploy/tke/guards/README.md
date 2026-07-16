# TKE safety evidence guards

This Wave 1 workstream produces the frozen `evidence-bundle.schema.json`
artifact used by the resumable release controller. It performs offline checks
only. It does not connect to Redis, MySQL, Kubernetes or Tencent Cloud; stop or
start jobs; migrate or restore data; or grant an execution authority.

## Why a release-side guard is required

The application already uses MySQL advisory locks for individual scheduled
steps, Redis consumer groups for streams, and lease owner/token compare-and-set
for durable business events. Those mechanisms protect work items, but they do
not prove that Lighthouse and TKE are not running the environment-level jobs
worker at the same time. The cutover therefore supplies a fresh Redis
lease/fencing observation as evidence. This guard rejects double-active,
expired, stale, wrong-owner or non-monotonic evidence without changing the
application schema or runtime.

## Command

All four files must be ignored paths below `.artifacts/tke/`. The output must
exactly equal `evidenceFile` in the release manifest.

```powershell
node deploy/tke/guards/safety-guard.mjs `
  --manifest .artifacts/tke/releases/<release-id>/release-manifest.json `
  --input .artifacts/tke/releases/<release-id>/guard-input.json `
  --output .artifacts/tke/releases/<release-id>/evidence.json `
  --report .artifacts/tke/releases/<release-id>/guard-report.json
```

The operator may use `--now <UTC timestamp>` only for deterministic offline
drills. The committed example is synthetic and does not contain its referenced
evidence files.

## Phase rules

| Phase | Jobs owner required | Additional evidence |
| --- | --- | --- |
| `PRE_MIGRATION` | Lighthouse active, TKE stopped | fresh backup, passed restore drill, unique planned migration run ID, rollback readiness |
| `POST_MIGRATION` | Lighthouse active, TKE stopped | matching successful migration execution |
| `POST_SWITCH` | Lighthouse stopped, TKE active | matching successful migration execution and a newer TKE fencing token |
| `POST_ROLLBACK` | Lighthouse active, TKE stopped | successful rollback execution and a newer Lighthouse fencing token |

Every referenced evidence file must exist. Its SHA-256 is written to the guard
report so a later controller can detect stale or replaced inputs. Neither the
input nor output may contain credentials or persisted approvals.

`PASS_OFFLINE_EVIDENCE` means only that the supplied files are internally
consistent. Production migration, jobs stop/start, rollback and traffic
operations retain separate runtime authorization.
