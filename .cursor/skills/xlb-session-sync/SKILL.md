---
name: xlb-session-sync
description: >-
  Mandatory XLB/喜乐帮 session startup sync. Reads git branch, tags, and
  docs/CURRENT_STATE.md before any Phase work. Use at the start of every XLB
  task, after context loss, when switching agents (Cursor/Codex), or when the
  user mentions Phase Lock, continue development, or repo state.
---

# XLB Session Sync

**Do not rely on conversation memory.** The repo is the only source of truth.

## When to run

- First message of any XLB session
- User says "继续" / "Lock" / "Phase N"
- Branch or tag may have changed since last turn
- Unsure whether a module is implemented or only planned

## Steps (in order)

1. **Shell snapshot**
   ```powershell
   cd E:\xlb100
   git status
   git branch --show-current
   git log --oneline -10
   git tag -l "xlb-phase*"
   ```

2. **Run context script** (optional but recommended)
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-context-snapshot.ps1
   ```

3. **Read** `docs/CURRENT_STATE.md` — locked phases, active branch, forbidden scope

4. **Read phase docs** for the task (only what's needed):
   - `docs/reports/PHASE{N}_*.md`
   - `docs/architecture/{N}_XLB_*.md`
   - `docs/contracts/CONTRACT_*.md` for touched domain

5. **Output a short sync block** before coding (template below)

6. **Stop if dirty** — if `git status` is not clean and user did not ask to commit, report and ask

## Sync output template

```markdown
## Session sync
- Branch: ...
- main tag: ...
- Active phase: ...
- Locked through: ...
- This task scope: ...
- Forbidden this task: ...
- Working tree: clean | dirty
```

## Hard rules

- Never assume Phase from old chat (e.g. "7A only" when main is at 8B+)
- Never read `dist/`, `node_modules/`, or `packages/types/src/*.js` for context
- If `docs/CURRENT_STATE.md` conflicts with memory, **file wins**
- Load skill `xlb-current-vs-target` if user references directory structure tables or SDJ99

## Related skills

- `xlb-context-map` — where to read next
- `xlb-phase-boundary` — allow/forbid list
- `xlb-phase-lock` — when user asks to Lock
