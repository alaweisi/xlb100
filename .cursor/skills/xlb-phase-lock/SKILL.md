---
name: xlb-phase-lock
description: >-
  XLB Phase Lock ceremony: re-verify build/tests/gates, live API chain, update
  report, merge main with --no-ff, tag xlb-phase*. Use when user asks to Lock,
  freeze, merge main, or tag a completed Phase. Do not use for normal feature
  development.
---

# XLB Phase Lock

Lock = freeze a Phase on `main` with tag. **Not** normal development.

## Preconditions

- [ ] Session sync done (`xlb-session-sync`)
- [ ] Feature commit(s) on phase branch
- [ ] `git status` clean (no dist/node_modules/types/*.js)
- [ ] User explicitly requested Lock (do not self-Lock)

## Lock checklist

### 1. Engineering

```powershell
cd E:\xlb100
npx pnpm build
npx pnpm typecheck
npx pnpm test
npx pnpm preflight
```

Record: passed count (expect ~270–320 depending on phase).

### 2. Phase gate scripts

Run **all** gates listed in the phase report and `scripts/preflight-architecture.ps1`.
Phase 8 examples: `check-ledger-*`, `check-settlement-*`.

### 3. Infrastructure

```powershell
docker compose -f deploy/compose/docker-compose.local.yml ps
powershell -File scripts/migrate-local.ps1
powershell -File scripts/seed-local.ps1
```

### 4. Live API chain

Follow the phase report's curl/script flow (order → … → phase outcome).
Record IDs: orderId, fulfillmentId, eventId, accrualId, batchId, etc.

### 5. DB verification

Confirm tables, amounts, outbox `published`, idempotent retry, upstream unchanged.

### 6. Boundary rg (if report requires)

Confirm no settlement/payout/refund/aftersale leakage per phase rules.

### 7. Update report

Edit `docs/reports/PHASE{N}_*_REPORT.md` with Lock verification table.

```powershell
git add docs/reports/...
git commit -m "docs: finalize XLB phase {N} {name} foundation"
```

### 8. Merge main

```powershell
git checkout main
git status   # must be clean
git merge --no-ff phase{N}-... -m "merge: XLB phase {N} {short name}"
```

### 9. Post-merge verify on main

Repeat build / typecheck / test / preflight on `main`.

### 10. Tag

```powershell
git tag xlb-phase{N}-{kebab-name}
git log --oneline -5
git tag -l "xlb-phase*"
```

### 11. Update CURRENT_STATE

Edit `docs/CURRENT_STATE.md`: main HEAD, new tag, remove from "in progress".

## Do NOT during Lock

- Enter next Phase features
- Merge unrelated branches
- Commit `dist/`, `packages/types/src/*.js`, `.turbo/cache`
- Force push main

## Lock report template (final section)

```markdown
## Lock conclusion
- Merged: yes/no
- main commit: ...
- tag: ...
- tests: N passed
- gates: all passed
- live verification: ...
- Next phase: not entered
```

## Related

- `xlb-session-sync` — before Lock
- `xlb-phase-boundary` — confirm scope not exceeded
