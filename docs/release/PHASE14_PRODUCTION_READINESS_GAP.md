# Phase 14 Production Readiness Gap

## Decision

- Staging internal beta: PASS
- Production release: NO-GO
- Production release status: BLOCKED

RC2 is acceptable for staging internal beta, but it is not production-ready until the gaps below are closed and release owners approve the final production release candidate.

## Baseline

- RC2 tag: `phase14-staging-rc2`
- RC2 tagged commit: `ae4f5d1 docs(release): add phase 14 rc2 uat evidence`
- Latest beta evidence commit at gap creation: `f901af8 docs(release): add phase 14 internal beta day 3 report`
- Gap date: 2026-07-06

## P3 disposition

| Issue ID | Production relevance | Current disposition | Production requirement |
| --- | --- | --- | --- |
| `BETA-D1-001` frontend update-check warnings | Low runtime risk, noisy operational logs | Deferred cleanup | Disable or suppress nonessential update checks in production containers, or document why they cannot occur in production runtime. |
| `BETA-D1-002` MySQL staging bootstrap warnings | Operational hardening risk if mirrored in production | Deferred cleanup | Confirm production MySQL initialization is managed outside app compose, uses non-empty secrets, has timezone data strategy, and avoids insecure bootstrap paths. |
| `BETA-D1-003` expected admin city-scope negative guard checks | Positive security evidence, not a defect | No fix required | Keep as UAT/security evidence; production monitoring should distinguish expected 403/404 guard checks from abnormal authorization spikes. |

## Production hardening checklist

| Area | Requirement | Status |
| --- | --- | --- |
| Secrets | Replace all staging example secrets with production secret manager values. | OPEN |
| Database | Confirm production MySQL provisioning, backups, restore test, timezone handling, and migration order. | OPEN |
| Redis | Confirm production Redis persistence/eviction policy and connection limits. | OPEN |
| TLS/ingress | Confirm production HTTPS, hostnames, CORS, and reverse-proxy headers. | OPEN |
| Auth/session | Confirm production JWT secret rotation policy and admin access policy. | OPEN |
| Observability | Confirm structured log collection, retention, and alert routing. | OPEN |
| CI gate audit | Review Phase 14R CI gate allowance changes before production approval. | OPEN |
| Migration 027 | Document production rollback strategy for `aftersale_refund_requests`. | OPEN |
| Ledger gates | Require replay and immutability PASS immediately before release cut. | OPEN |
| Smoke/UAT | Run final production-like smoke and release-owner UAT signoff. | OPEN |

## Rollback requirement

Production release cannot proceed until rollback is written and approved.

Minimum rollback requirements:

- Identify the exact previous production commit or image.
- Define database rollback behavior for migration 027.
- Define whether rollback is code-only or code-plus-data.
- Define event_outbox and ledger handling if rollback occurs after refund approvals.
- Verify rollback smoke commands and owner approval path.
- Document data preservation rules for beta and production evidence.

## Monitoring requirement

Production release cannot proceed until monitoring covers these signals:

- Backend health and DB health.
- Customer, worker, and admin app availability.
- HTTP 5xx rate by route group.
- Authorization/city-scope 403/404 rates with expected guard traffic separated from anomaly traffic.
- `event_outbox` pending/published/error counts.
- `event_outbox` rows where `event_type = 'refund.approved'`.
- Ledger reversal entries where `source_type = 'refund.approved'`.
- Duplicate reversal detection by refund/source/account/direction.
- Replay gate result.
- Immutability gate result.
- Missing `conflict_audit` trace alerts.

## Payment/refund/reversal risk watch

| Risk | Required production control |
| --- | --- |
| Duplicate refund approval | Alert on more than one `refund.approved` event for one refund request. |
| Duplicate ledger reversal | Alert on duplicate `ledger_entries` for one refund/source/account/direction. |
| Reversal amount direction | Monitor customer credit, platform debit, worker debit entries for refund reversal. |
| Event handler lag | Monitor pending `refund.approved` event_outbox age. |
| Audit trace gap | Monitor missing `conflict_audit` outbox rows for reversal ledger entries. |
| Replay drift | Run replay verification before and after production release window. |
| Immutability drift | Run immutability proof before and after production release window. |

## Final app-store/onboarding blockers

No app-store or onboarding approval evidence is currently recorded in the RC2 beta package.

Production readiness requires explicit owner confirmation for:

- Customer app onboarding copy and support path.
- Worker app onboarding and certification support path.
- Admin operator access provisioning.
- External payment/refund operational support playbook.
- Customer support escalation path for refund reversal disputes.
- Privacy, terms, and compliance review for beta-to-production transition.

## Production readiness conclusion

Phase 14 RC2 is not production-ready.

Required next decision: close the production hardening checklist, approve rollback and monitoring, review CI gate changes, then cut a separate production release candidate only after all production-readiness gates pass.
