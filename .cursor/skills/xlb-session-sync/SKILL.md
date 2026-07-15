---
name: xlb-session-sync
description: >-
  Mandatory XLB session startup sync. Resolves the current Git worktree and
  common directory before reading canonical control facts and current-worktree
  branch facts. Use at the start of every XLB task, after context loss, or when
  the user mentions a Phase, Release Train, Work Unit, Lock, or repository state.
---

# XLB Session Sync

**Do not rely on conversation memory.** Git, the canonical control records, and
the current worktree are the sources of truth, but they answer different
questions.

## Root model (mandatory)

- Canonical control / integration / main / Lock root: `G:\xlb100`.
- Approved construction pool:
  `G:\xlb100-worktrees\<train-id>\<work-unit-id>`.
- Resolve the current Git top-level and common directory **before** changing
  directory or reading branch state.
- Read control-plane facts (`docs/CURRENT_STATE.md`, `governance/`, execution
  registries, Charter, Manifest, leases, reservations, queue) from the canonical
  root.
- Read branch, HEAD, status, diff, tracked source, and candidate evidence from
  the current Git top-level. A managed Work Unit must never borrow those facts
  from the canonical root.
- The current and canonical roots must resolve to the same Git common directory.
  An unregistered root or a different common directory is fail-closed.

## When to run

- First message of any XLB session
- User says "continue", "Lock", "Phase N", "Release Train", or "Work Unit"
- Branch, tag, candidate, or worktree may have changed
- Unsure whether a module is implemented, planned, or only present elsewhere

## Steps (in order)

1. **Resolve roots without `cd`**

   ```powershell
   $CanonicalRoot = 'G:\xlb100'
   $CurrentRoot = (git rev-parse --show-toplevel).Trim()
   if (-not $CurrentRoot) { throw 'Not inside an XLB Git worktree.' }

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

   if (-not [System.IO.Directory]::Exists($CurrentCommon)) {
     throw "Current Git common directory does not exist: $CurrentCommon"
   }
   if (-not [System.IO.Directory]::Exists($CanonicalCommon)) {
     throw "Canonical Git common directory does not exist: $CanonicalCommon"
   }
   if (-not $CurrentCommon.Equals($CanonicalCommon,
       [System.StringComparison]::OrdinalIgnoreCase)) {
     throw 'Current worktree is not attached to the canonical XLB repository.'
   }

   $CanonicalFull = [System.IO.Path]::GetFullPath($CanonicalRoot).TrimEnd('\')
   $CurrentFull = [System.IO.Path]::GetFullPath($CurrentRoot).TrimEnd('\')
   $PoolPrefix = [System.IO.Path]::GetFullPath(
     'G:\xlb100-worktrees'
   ).TrimEnd('\') + '\'
   $IsCanonical = $CurrentFull.Equals(
     $CanonicalFull, [System.StringComparison]::OrdinalIgnoreCase
   )
   $IsPoolCandidate = $CurrentFull.StartsWith(
     $PoolPrefix, [System.StringComparison]::OrdinalIgnoreCase
   )
   if (-not $IsCanonical -and -not $IsPoolCandidate) {
     throw "Unapproved XLB worktree root: $CurrentFull"
   }
   ```

2. **Read current-worktree Git facts**

   ```powershell
   git -C $CurrentRoot status --short --branch
   git -C $CurrentRoot branch --show-current
   git -C $CurrentRoot rev-parse HEAD
   git -C $CurrentRoot log --oneline -10
   git -C $CurrentRoot diff --stat
   git -C $CurrentRoot diff --cached --stat
   ```

   Do not replace `$CurrentRoot` with `G:\xlb100` for these commands when the
   task runs in a Work Unit.

3. **Read canonical control facts**

   ```powershell
   Get-Content -LiteralPath "$CanonicalRoot\docs\CURRENT_STATE.md" -Encoding UTF8
   Get-Content -LiteralPath "$CanonicalRoot\governance\execution\README.md" -Encoding UTF8
   git -C $CanonicalRoot tag -l 'xlb-phase*'
   ```

   Read only the needed registry, Charter, Manifest, lease, reservation, and
   queue records under `$CanonicalRoot\governance\execution`.

4. **Classify the current root**

   - If `$CurrentRoot` equals `$CanonicalRoot`, this is the control/integration
     worktree. Do not infer construction authority from that fact.
   - If it is inside `G:\xlb100-worktrees`, load `xlb-managed-worktree`, locate
     the exact canonical Manifest, and run its boundary check before writing.
   - Otherwise stop: sharing the common directory alone does not enroll an
     arbitrary or historical worktree.

5. **Read phase/task context**

   - Locked Phase/control state: canonical `docs/CURRENT_STATE.md` and canonical
     registries.
   - Work Unit scope and authority: canonical Charter/Manifest/ledgers.
   - Source, tests, phase report revision, and candidate diff being edited:
     current worktree.
   - Read only the 3-5 files selected by `xlb-context-map`.

6. **Report dirty state; never hide it**

   Dirty, staged, and untracked paths are reported from `$CurrentRoot`. Do not
   overwrite, clean, reset, or switch away from them. A clean immutable commit
   is required for queue/audit eligibility, but an authorized Work Unit may be
   dirty while actively constructing within its lease.

7. **Output the sync block before coding**

## Sync output template

```markdown
## Session sync
- Current root / classification: ... / canonical | managed Work Unit | blocked
- Git common directory: ... (matches canonical: yes/no)
- Current branch / HEAD: ... / ...
- Canonical main tag / locked through: ... / ...
- Train / Work Unit / manifest status: NONE | ...
- This task scope: ...
- Forbidden this task: ...
- Current worktree: clean | dirty (staged/unstaged/untracked summary)
```

## Hard rules

- Never `cd G:\xlb100` before capturing the current worktree root and branch.
- Never use canonical-root branch/status/diff as evidence for a Work Unit.
- Never use Work Unit copies of `CURRENT_STATE` or governance registries as the
  control-plane authority.
- Never assume Phase from old chat.
- Never read `dist/`, `node_modules/`, or `packages/types/src/*.js` for context.
- A memory/prompt conflict with canonical control facts is fail-closed.
- Load `xlb-current-vs-target` when the user references a blueprint, legacy
  directory layout, or SDJ99.

## Context snapshot script

`scripts/agent-context-snapshot.ps1` is a canonical-control convenience only
unless its output explicitly identifies the current worktree. It must not
replace the current-root Git commands above for a managed Work Unit.

## Related skills

- `xlb-managed-worktree` - Charter/Manifest/lease/environment guard
- `xlb-context-map` - where to read next
- `xlb-phase-boundary` - allowed and forbidden scope
- `xlb-phase-lock` - canonical-root-only Lock ceremony
