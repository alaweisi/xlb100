---
name: xlb-phase-lock
description: >-
  XLB Phase Lock ceremony. Use only after explicit Human Lock authority to
  verify, integrate, update canonical state, and tag from G:\xlb100. A managed
  Work Unit or any non-canonical worktree must fail closed.
---

# XLB Phase Lock

Lock freezes an accepted Phase on canonical `main` with its evidence and tag.
It is not feature development, Work Unit package completion, queue entry, or
ordinary integration.

## Root guard (run first; no directory switching)

```powershell
$CanonicalRoot = [System.IO.Path]::GetFullPath('G:\xlb100').TrimEnd('\')
$CurrentRoot = [System.IO.Path]::GetFullPath(
  (git rev-parse --show-toplevel).Trim()
).TrimEnd('\')

if (-not $CurrentRoot.Equals($CanonicalRoot,
    [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Phase Lock is canonical-root-only. Current root: $CurrentRoot"
}

function Resolve-GitPath([string]$Root, [string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $Root $Path))
}

$CurrentCommon = Resolve-GitPath $CurrentRoot `
  ((git -C $CurrentRoot rev-parse --git-common-dir).Trim())
$CanonicalCommon = Resolve-GitPath $CanonicalRoot `
  ((git -C $CanonicalRoot rev-parse --git-common-dir).Trim())
if (-not $CurrentCommon.Equals($CanonicalCommon,
    [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Canonical Git common-directory verification failed.'
}
```

Do not make the guard pass by changing directory from a managed Work Unit.
When invoked from `G:\xlb100-worktrees\...`, the Lock task must stop and return
to the Human/Integration Owner. All Lock reads and writes occur in
`G:\xlb100` only.

## Preconditions

- [ ] `xlb-session-sync` completed with current root classified as canonical
- [ ] Canonical `docs/CURRENT_STATE.md`, constitution, ADR authority, execution
      registry, Train Charter, integration queue, evidence, and audits read
- [ ] Human Owner explicitly authorized this Lock; Audit PASS, historical
      approval, package status, or silence is not authority
- [ ] All Work Unit candidates entered through the serial Integration Queue
- [ ] Accepted integration commit(s) exist on the authorized integration/main
      path; no construction branch is being locked directly
- [ ] Canonical worktree and candidate evidence are clean and immutable
- [ ] Contract, migration, audit, and evidence freshness checks pass
- [ ] No Phase/Train/Work Unit status is being inferred or auto-promoted

Any missing or conflicting precondition is fail-closed.

## Lock checklist

### 1. Engineering verification (canonical root only)

```powershell
git -C G:\xlb100 status --short --branch
npx pnpm build
npx pnpm typecheck
npx pnpm test
npx pnpm preflight
```

Execute package commands with process working directory `G:\xlb100`. Record
the exact commit and pass counts; never reuse Work Unit-local evidence as the
full canonical replay.

### 2. Phase gate scripts

Run all gates listed by the current canonical Phase report and
`scripts/preflight-architecture.ps1`. Do not weaken or bypass historical gates.

### 3. Infrastructure

Run canonical integration infrastructure only when the approved Lock evidence
plan requires it. `migrate-local.ps1`, `seed-local.ps1`, shared Compose, and
full migration replay are serial Integration/Lock operations and are forbidden
inside managed Work Units.

### 4. Live API chain

Follow the canonical Phase report's authorized live flow. Record the required
IDs and endpoints. Do not activate production or a real Provider unless that
separate L4 authority is explicit.

### 5. Database verification

Confirm tables, amounts, outbox state, idempotent retry, upstream immutability,
and the locked migration tree against the canonical integration environment.

### 6. Boundary verification

确认不存在禁止域、出款/退款/Provider、契约、migration、semantic lease 或
Phase 越界。Recheck that all package evidence is current
for the exact integration commit.

### 7. Freeze pre-merge acceptance evidence

Freeze the accepted integration commit and its complete verification evidence.
Do not finalize `CURRENT_STATE`, the Lock report, registry status, or tag here;
those facts must bind the verified post-merge main commit.

### 8. Integrate to main

Use the approved serial queue order from the canonical root. Verify clean state
and explicit Human main-merge authority before the main merge. Never merge a
Work Unit directly to main and never repair business semantics opportunistically
in the Integration lane.

Immediately before the merge, switch the canonical root to `main` and assert:

```powershell
$branch = (git -C G:\xlb100 branch --show-current).Trim()
if ($branch -ne 'main') { throw "Lock merge requires main; found $branch" }
```

### 9. Post-merge verification on main

Repeat build, typecheck, tests, preflight, required infrastructure/live checks,
and evidence freshness checks on the exact canonical main commit. Re-run the
branch assertion above before writing any Lock fact.

### 10. Update canonical Lock facts and tag

Update `docs/CURRENT_STATE.md` and the authorized Phase/Lock report or registry
in the canonical root, commit the final Lock metadata, verify it, and create the
approved `xlb-phase*` tag on the intended immutable commit. Record both commit
and tag object/peeled commit where applicable.

## Do NOT during Lock

- Run Lock from a managed, historical, unregistered, or separate worktree
- Change directory to canonical merely to bypass the root guard
- Enter next-Phase features or widen the Train/Phase scope
- Merge unrelated branches or Work Units out of queue order
- Treat `PACKAGE_VERIFIED`, `PACKAGE_AUDITED`, `QUEUED`, `INTEGRATED`, or
  `TRAIN_VERIFIED` as Phase `LOCKED`
- Modify locked migrations, tags, or historical evidence
- Commit generated artifacts such as `dist/`, `packages/types/src/*.js`, or
  `.turbo/cache`
- Force-push main, push, deploy, or activate production without separate
  explicit authority

## Lock report template

```markdown
## Lock conclusion
- Canonical root / common directory verified: yes/no
- Human Lock authority reference: ...
- Queue and integration commit: ...
- main commit: ...
- tag / peeled commit: ... / ...
- tests and gates: ...
- live verification: ...
- migration/contract/evidence freshness: ...
- Next phase entered: no
```

## Related

- `xlb-session-sync` - mandatory before Lock
- `xlb-managed-worktree` - package construction guard, never Lock authority
- `xlb-phase-boundary` - confirm scope before closure
