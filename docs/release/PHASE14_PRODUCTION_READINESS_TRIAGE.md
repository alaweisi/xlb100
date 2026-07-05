# Phase 14 Production Readiness Triage

## Current release state

- RC2 tag: `phase14-staging-rc2`
- Current baseline commit: `258b4e3 docs(release): close phase 14 rc2 internal beta acceptance`
- Branch: `phase14r-refund-reversal`
- Staging internal beta: PASS
- Production decision: NO-GO
- Production release status: BLOCKED
- P0/P1/P2 beta issues: 0
- P3 beta issues: 3 carryover only
- Triage date: 2026-07-06

## Summary classification

| Classification | Count | Summary |
| --- | ---: | --- |
| MUST FIX before production | 13 | Operational release, rollback, monitoring, secrets, backup/restore, domain/TLS, and production signoff gaps |
| CAN DEFER | 2 | Low-risk staging-only/noisy warnings that should not block if production environment proves unaffected |
| NOT A PROBLEM / EXPECTED GUARD EVIDENCE | 1 | Admin city-scope negative guard checks |

## Exact production blocker list

These are MUST FIX before production.

| ID | Gap | Reason | Required closure evidence | Source-code changes required |
| --- | --- | --- | --- | --- |
| PROD-BLOCKER-001 | Production secrets management | Staging example secrets cannot be used for production. | Secret manager or deployment variable inventory for `NODE_ENV`, backend port, MySQL, Redis, JWT, frontend API base URLs, and operator credentials. | No, unless deployment config lacks required env injection. |
| PROD-BLOCKER-002 | Production domain/TLS/ingress | No production hostname, HTTPS, reverse-proxy, CORS, or header readiness evidence is recorded. | Approved domain/TLS/ingress checklist and smoke against production-like hostnames. | No, unless env wiring is missing. |
| PROD-BLOCKER-003 | Production database provisioning | Staging MySQL is container-local; production DB topology, users, timezone, and migration target are not verified. | Production DB provisioning plan with non-empty secrets, timezone strategy, least-privilege user, and connection limits. | No. |
| PROD-BLOCKER-004 | Backup and restore readiness | No restore test evidence is recorded. | Backup schedule, restore drill result, RPO/RTO target, and owner signoff. | No. |
| PROD-BLOCKER-005 | Migration 027 rollback plan | `aftersale_refund_requests` rollback is only described as manual/drop-table for non-production staging. | Production-safe migration 027 rollback or forward-fix procedure, including data preservation rules. | Not necessarily; schema change only if rollback analysis proves current migration is unsafe. |
| PROD-BLOCKER-006 | Code/data rollback procedure | Current runbook is staging-oriented and RC1 is known bad for refund reversal. | Exact previous production image/commit, rollback smoke, data handling, event_outbox/ledger handling, and approval path. | No. |
| PROD-BLOCKER-007 | Monitoring and alerting | Required production signals are listed but not implemented/evidenced. | Dashboard/alert evidence for health, 5xx, event_outbox, refund.approved, ledger reversal, duplicate reversal, replay, immutability, and audit gaps. | No, unless app metrics/log fields are insufficient. |
| PROD-BLOCKER-008 | Payment/refund/reversal duplicate monitoring | Duplicate prevention passed UAT, but production alerting is not proven. | SQL/dashboard checks for duplicate `refund.approved` events and duplicate reversal ledger entries. | No. |
| PROD-BLOCKER-009 | Event handler lag monitoring | No production threshold or alert exists for stale pending `refund.approved` events. | Pending event age query/alert and escalation owner. | No. |
| PROD-BLOCKER-010 | Ledger replay/immutability release gate timing | Gates pass in validation, but production release requires immediate pre-cut and post-cut proof. | Release checklist requiring replay and immutability PASS immediately before and after release. | No. |
| PROD-BLOCKER-011 | CI gate script change audit | `60ba210` is accepted for staging but still requires production reviewer audit. | Reviewer signoff that Phase 14R CI gate changes do not weaken real production protections. | No. |
| PROD-BLOCKER-012 | Final operator/app onboarding signoff | No app-store/onboarding/support evidence is recorded. | Customer, worker, admin, support, refund dispute, privacy/terms/compliance owner signoff. | No, unless signoff finds content/config gaps. |
| PROD-BLOCKER-013 | Production release owner approval | Production is explicitly NO-GO in acceptance and gap docs. | Named release owner approval after blockers above close. | No. |

## Exact deferred list

These can defer only if the production environment proves they do not affect runtime correctness or operational signal quality.

| ID | Gap | Classification | Reason | Deferred action |
| --- | --- | --- | --- | --- |
| DEFER-001 | Frontend update-check warnings | CAN DEFER | Staging apps returned HTTP 200; warning is noisy but not a runtime failure. | Suppress nonessential update checks in production images or document why production runtime will not emit them. |
| DEFER-002 | MySQL staging bootstrap warnings | CAN DEFER | Warnings are tied to local staging container bootstrap. They are not production blockers if production DB is managed separately and securely. | Close through production DB provisioning evidence; no app code change needed. |

## Exact non-issue list

| ID | Item | Classification | Reason | Required action |
| --- | --- | --- | --- | --- |
| NONISSUE-001 | Admin city-scope negative guard checks | NOT A PROBLEM / EXPECTED GUARD EVIDENCE | Intentional 403/404 checks prove admin city-scope isolation and should remain visible as security evidence. | Keep evidence; configure monitoring to separate expected guard checks from abnormal authorization spikes. |

## Special focus assessment

| Area | Triage result | Notes |
| --- | --- | --- |
| Frontend update-check warnings | CAN DEFER | Non-blocking if production serving does not depend on update checks and logs remain actionable. |
| MySQL staging bootstrap warnings | CAN DEFER after production DB evidence | Must not mirror staging insecure bootstrap in production. |
| Admin city-scope negative guard checks | NOT A PROBLEM | Expected guard evidence. |
| Rollback procedure | MUST FIX | Current procedure is staging-oriented and RC1 is not a safe functional rollback for refund reversal. |
| Monitoring/log inspection | MUST FIX | Manual log inspection is not sufficient for production. |
| Backup/restore readiness | MUST FIX | No restore drill evidence exists. |
| Payment/refund/reversal duplicate prevention | MUST FIX operational monitoring | Code/UAT says controlled; production monitoring still required. |
| Migration 027 rollback consideration | MUST FIX | Needs production-specific data-safe rollback/forward-fix plan. |
| Production env/secrets/domain/TLS checklist | MUST FIX | Required for any production cut. |

## Recommended next action

1. Produce a production operations readiness packet covering secrets, domain/TLS, ingress, DB/Redis provisioning, backup/restore, and monitoring owners.
2. Write a production rollback plan specific to Phase 14R refund reversal, including migration 027, event_outbox, ledger reversal, and audit trace data handling.
3. Run a CI gate script audit for `60ba210` with explicit reviewer signoff.
4. Add production monitoring queries/dashboards for `refund.approved`, duplicate reversals, pending event age, replay, immutability, and missing audit trace.
5. Collect final onboarding/support/privacy/compliance approvals.
6. Only after all blockers close, cut a separate production release candidate; do not reuse the staging RC2 tag as a production release tag.

## Whether source-code changes are required

No source-code changes are required by this triage based on current evidence.

Possible future code or deployment changes are conditional only if production readiness work proves one of these gaps cannot be closed operationally:

- Missing env injection for production domains/secrets.
- Missing structured log fields needed for monitoring.
- Migration 027 rollback analysis proves a schema or migration correction is required.
- Production frontend image still emits nonessential update-check warnings and ops requires suppression in image configuration.

Until then, the correct next step is documentation, release-owner verification, and operational readiness evidence rather than business logic changes.
