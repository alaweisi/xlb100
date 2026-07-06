# Phase 14 Production Ops Blocker Reconciliation

## Decision

- Staging internal beta: PASS
- Production ops checklist: FAIL
- Production release: NO-GO / BLOCKED
- Reconciliation date: 2026-07-06
- Baseline commit: `b3f4c3b docs(release): reconcile phase 14 production ops blockers`
- Scope: documentation only; no code, business logic, ledger/replay/audit, DB schema, CI gate, deploy, or tag changes.

## Source Evidence

| Evidence | Path |
| --- | --- |
| Production ops readiness checklist | `docs/release/PHASE14_PRODUCTION_OPS_READINESS.md` |
| Production readiness triage | `docs/release/PHASE14_PRODUCTION_READINESS_TRIAGE.md` |
| Production readiness gap | `docs/release/PHASE14_PRODUCTION_READINESS_GAP.md` |
| Migration 027 rollback plan | `docs/release/PHASE14_MIGRATION_027_ROLLBACK_PLAN.md` |
| Code/data rollback runbook | `docs/release/PHASE14_CODE_DATA_ROLLBACK_RUNBOOK.md` |

## Classification Semantics

The classification is the primary closure path for the current blocker. Owner approval may still be required for any production release item, but the table assigns one dominant category for blocker counting.

| Category | Meaning |
| --- | --- |
| A | External/manual approval |
| B | Repo-documentable |
| C | Staging drill required |
| D | Production-environment required |

## Reconciled PROD-OPS Table

| ID | Item name | Current status | Owner | Evidence required | Blocker impact | Category |
| --- | --- | --- | --- | --- | --- | --- |
| PROD-OPS-001 | Production secrets management | NOT RUN | Security / Ops owner | Secret manager export or deployment variable inventory for `NODE_ENV`, backend port, MySQL, Redis, JWT, frontend API base URLs, and operator credentials. | Blocks production because staging/example secrets cannot be used. | D |
| PROD-OPS-002 | Production domain/TLS/ingress | NOT RUN | Infra / Ops owner | Approved DNS/TLS/ingress checklist plus smoke against production-like hostnames. | Blocks production cutover and customer/worker/admin access. | D |
| PROD-OPS-003 | Production DB provisioning | NOT RUN | DBA / Ops owner | Production DB provisioning plan covering topology, users, timezone, connection limits, migration target, and non-empty secrets. | Blocks production migration and runtime data storage. | D |
| PROD-OPS-004 | Backup/restore readiness | NOT RUN | DBA / SRE owner | Restore drill log, backup schedule, RPO/RTO target, and owner signoff. | Blocks production because rollback and incident recovery are unproven. | C |
| PROD-OPS-005 | Migration 027 rollback plan | PASS | DBA / Release owner | `docs/release/PHASE14_MIGRATION_027_ROLLBACK_PLAN.md` documents production-safe restore-vs-forward-fix rollback handling for `aftersale_refund_requests`, including data preservation rules and exact PASS evidence. | Repo-documentable blocker closed; concrete production backup/restore drill and release-window validation remain separate blockers. | B |
| PROD-OPS-006 | Code/data rollback procedure | PASS | Release owner / Ops owner | `docs/release/PHASE14_CODE_DATA_ROLLBACK_RUNBOOK.md` documents app image/git tag rollback, DB backup/restore handling, smoke commands, `event_outbox`/ledger/refund checks, approval path, abort conditions, and exact PASS evidence. | Repo-documentable blocker closed; concrete production execution evidence and release approval remain separate blockers. | B |
| PROD-OPS-007 | Monitoring and alerting | NOT RUN | SRE / Ops owner | Dashboard and alert evidence for health, 5xx, `event_outbox`, refund approval, ledger reversal, duplicate reversal, replay, immutability, and audit gaps. | Blocks production because incidents would rely on manual log inspection. | D |
| PROD-OPS-008 | Payment/refund/reversal duplicate monitoring | NOT RUN | SRE / Finance ops owner | SQL/dashboard checks for duplicate `refund.approved` events and duplicate reversal ledger entries. | Blocks production financial operations visibility. | D |
| PROD-OPS-009 | Event handler lag monitoring | NOT RUN | SRE / Backend owner | Pending event age query/alert for `event_outbox` rows where `event_type = 'refund.approved'`. | Blocks production because refund approval events could stall without detection. | D |
| PROD-OPS-010 | Replay/immutability release gate timing | NOT RUN | Release owner / Ledger owner | `npx pnpm preflight` immediately before production cut and immediately after cut, with replay and immutability PASS evidence attached. | Blocks production because ledger replay and immutability must be proven at release time. | D |
| PROD-OPS-011 | CI gate script change audit | NOT RUN | Reviewer / Release owner | Reviewer signoff for `60ba210 chore(ci): allow phase 14r refund reversal gates`; suggested command: `git show --stat 60ba210`. | Blocks production approval because CI allowance changes need explicit production review. | A |
| PROD-OPS-012 | Operator/app onboarding signoff | NOT RUN | Product / Support / Compliance owners | Customer, worker, admin, support, refund dispute, privacy, terms, and compliance signoff record. | Blocks production because end-user and operator readiness is unapproved. | A |
| PROD-OPS-013 | Release owner approval | FAIL | Release owner | Approval record after all `PROD-OPS-*` items pass; current evidence is `docs/release/PHASE14_PRODUCTION_READINESS_TRIAGE.md`. | Blocks production release and production tag creation. | A |

## Blocker Count By Category

| Category | Count | Items |
| --- | ---: | --- |
| A - External/manual approval | 3 | `PROD-OPS-011`, `PROD-OPS-012`, `PROD-OPS-013` |
| B - Repo-documentable | 0 | Closed: `PROD-OPS-005`, `PROD-OPS-006` |
| C - Staging drill required | 1 | `PROD-OPS-004` |
| D - Production-environment required | 7 | `PROD-OPS-001`, `PROD-OPS-002`, `PROD-OPS-003`, `PROD-OPS-007`, `PROD-OPS-008`, `PROD-OPS-009`, `PROD-OPS-010` |
| Total non-PASS | 11 | `PROD-OPS-001` through `PROD-OPS-004`, `PROD-OPS-007` through `PROD-OPS-013` |

## Reconciliation Notes

- `PROD-OPS-005` and `PROD-OPS-006` are PASS for repo-documentable rollback readiness because concrete rollback plan/runbook evidence now exists.
- The other 11 `PROD-OPS-*` items remain production blockers.
- The production ops readiness checklist already contained all 13 rows in its evidence table, but its remaining-blocker summary called out only the highest release-risk subset. That summary has been corrected to list every blocker.
- No blocker is downgraded or removed by this reconciliation.
- `PROD-OPS-005` and `PROD-OPS-006` were repo-documentable because the closure artifact was a production rollback plan/runbook. Executing those procedures may later require a staging drill or production release-window validation.
- `PROD-OPS-010` remains production-environment required because it must pass immediately before and after the actual production cut, even though local and staging validations currently pass.

## Closure Rule

Production release remains blocked until all 13 `PROD-OPS-*` rows are updated to PASS with evidence, the release-window validation commands pass on the intended production release candidate, and the release owner records explicit approval.
