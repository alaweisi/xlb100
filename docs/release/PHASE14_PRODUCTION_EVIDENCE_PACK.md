# Phase 14 Production Evidence Pack

## Decision

- Evidence pack status: PREPARED
- Production release status: NO-GO / BLOCKED
- Evidence pack date: 2026-07-06
- Baseline commit: `86e4fcd docs(release): audit phase 14 ci gate change`
- Scope: documentation/checklist only; no code, business logic, ledger/replay/audit logic, DB schema, CI gate, deployment, or production tag changes.

This evidence pack defines the exact closure evidence required for the remaining non-PASS `PROD-OPS-*` blockers. It does not mark any remaining item PASS. RC2 staging PASS and local/staging validation are supporting evidence only; they do not replace production environment evidence or owner approval.

## Current Remaining Status

| ID | Item | Current status | Owner | Codex-verifiable now? | Evidence type required |
| --- | --- | --- | --- | --- | --- |
| PROD-OPS-001 | Production secrets management | NOT RUN | Security / Ops owner | No | Human/operator production secret inventory and redacted proof |
| PROD-OPS-002 | Production domain/TLS/ingress | NOT RUN | Infra / Ops owner | No | Production DNS/TLS/ingress artifacts and smoke evidence |
| PROD-OPS-003 | Production DB provisioning | NOT RUN | DBA / Ops owner | No | Production DB topology, users, secrets, migration target, backup policy |
| PROD-OPS-007 | Monitoring and alerting | NOT RUN | SRE / Ops owner | No | Production dashboard and alert routing evidence |
| PROD-OPS-008 | Payment/refund/reversal duplicate monitoring | NOT RUN | SRE / Finance ops owner | No | Production duplicate detection queries, dashboard, alerts |
| PROD-OPS-009 | Event handler lag monitoring | NOT RUN | SRE / Backend owner | No | Production pending-event age query and alert evidence |
| PROD-OPS-010 | Replay/immutability release gate timing | NOT RUN | Release owner / Ledger owner | Partially | Quiet release-window pre-cut and post-cut command logs; procedure `docs/release/PHASE14_RELEASE_WINDOW_GATE_TIMING.md` |
| PROD-OPS-012 | Operator/app onboarding signoff | NOT RUN | Product / Support / Compliance owners | No | Human signoff record |
| PROD-OPS-013 | Release owner approval | FAIL | Release owner | No | Final release approval after all PROD-OPS rows are PASS |

## PROD-OPS-001 Production Secrets Management

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | Security / Ops owner |
| Exact evidence required | Redacted production secret inventory proving non-example values exist for `NODE_ENV`, backend port, MySQL host/user/password/database, Redis URL/password if used, JWT/session secret, customer/worker/admin frontend API base URLs, operator/admin credentials bootstrap path, and rotation owner. |
| Command or artifact expected | Secret manager export screenshot or CLI inventory with values redacted; deployment variable inventory; owner signoff note. Example artifact path: `docs/release/evidence/PHASE14_PROD_SECRETS_INVENTORY_<timestamp>.md`. |
| Pass criteria | All required variables are present, non-empty, non-example, scoped to production, redacted in repo evidence, and have an owner plus rotation path. |
| Fail criteria | Any staging/example/default secret remains; any required production variable is missing; secrets are committed in plaintext; no owner or rotation path is recorded. |
| Production impact | Blocks production because staging/example secrets cannot protect production users, operators, sessions, DB, or Redis. |
| Verification responsibility | Human/operator evidence required. Codex can review a redacted manifest but cannot verify external secret-manager state without operator-provided evidence. |

## PROD-OPS-002 Production Domain/TLS/Ingress

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | Infra / Ops owner |
| Exact evidence required | Approved production hostnames for customer, worker, admin, and backend API; DNS records; TLS certificate validity; ingress/reverse proxy routing; CORS and forwarded-header behavior; production-like smoke against HTTPS hostnames. |
| Command or artifact expected | DNS/TLS/ingress checklist; `curl -I https://<host>/` and health/API smoke logs; ingress config excerpt with secrets redacted. Example artifact path: `docs/release/evidence/PHASE14_PROD_DOMAIN_TLS_INGRESS_<timestamp>.md`. |
| Pass criteria | HTTPS is valid for all production hostnames, routes point to the intended production release candidate, CORS/frontend API bases match production, and smoke checks pass through the production ingress path. |
| Fail criteria | Missing hostname, invalid/expired certificate, HTTP-only access, incorrect route target, CORS failure, broken forwarded headers, or any production smoke failure. |
| Production impact | Blocks production cutover and customer/worker/admin access. |
| Verification responsibility | Production environment and operator evidence required. Codex can review attached commands/logs but must not deploy or mutate ingress. |

## PROD-OPS-003 Production DB Provisioning

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | DBA / Ops owner |
| Exact evidence required | Production MySQL topology, hostname, database name, least-privilege app user, migration user if separate, timezone handling, connection limits, charset/collation, backup schedule, restore target, monitoring, and migration target confirmation. |
| Command or artifact expected | DBA provisioning plan; redacted connection inventory; `SELECT VERSION()`, timezone, charset/collation, user grants, and `schema_migrations` query outputs; backup schedule evidence. Example artifact path: `docs/release/evidence/PHASE14_PROD_DB_PROVISIONING_<timestamp>.md`. |
| Pass criteria | Production DB exists, is isolated from staging, uses production secrets, grants are least-privilege, backup/restore strategy is approved, and migration target is ready for Phase 14R. |
| Fail criteria | DB not provisioned, staging DB reused, missing backups, over-privileged app user, unknown timezone/charset, missing migration target, or unapproved secrets. |
| Production impact | Blocks production migration and runtime data storage. |
| Verification responsibility | Production DBA/operator evidence required. Codex can review redacted artifacts but cannot independently prove external DB provisioning. |

## PROD-OPS-007 Monitoring And Alerting

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | SRE / Ops owner |
| Exact evidence required | Production dashboard and alert evidence for backend health, DB health, customer/worker/admin availability, 5xx by route group, authorization/city-scope anomaly rates, `event_outbox` pending/error counts, refund approval, ledger reversal, duplicate reversal, replay result, immutability result, and missing `conflict_audit` traces. |
| Command or artifact expected | Dashboard screenshots or exported dashboard JSON; alert rule definitions; notification channel test evidence; runbook link. Example artifact path: `docs/release/evidence/PHASE14_PROD_MONITORING_ALERTING_<timestamp>.md`. |
| Pass criteria | Dashboards exist, alerts have thresholds and owners, notification routing is tested, and all listed Phase 14R financial/audit signals are covered. |
| Fail criteria | Manual log inspection is the only monitoring path; missing alert owner; missing refund/reversal/ledger/audit signals; notification channel untested; dashboards only cover staging. |
| Production impact | Blocks production because financial and availability incidents would not be detected or routed reliably. |
| Verification responsibility | Production SRE/operator evidence required. Codex can inspect exported configs or screenshots only after they are provided. |

## PROD-OPS-008 Payment/Refund/Reversal Duplicate Monitoring

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | SRE / Finance ops owner |
| Exact evidence required | Production duplicate detection for more than one `refund.approved` event per refund request and duplicate reversal ledger entries per city/source/account/direction. Must include thresholds, alert owner, and escalation path. |
| Command or artifact expected | SQL queries, dashboard panels, and alert rules. Example duplicate checks: group `event_outbox` by `city_code`, `event_type`, `aggregate_id`; group `ledger_entries` by `city_code`, `source_type`, `source_id`, `account_type`, `direction`. Example artifact path: `docs/release/evidence/PHASE14_PROD_DUPLICATE_MONITORING_<timestamp>.md`. |
| Pass criteria | Queries run against production or production-like read replica, expected zero-duplicate baseline is recorded, alerts fire on duplicate counts, and Finance/SRE owners approve the escalation path. |
| Fail criteria | No duplicate query; checks only exist in UAT docs; no alert; no owner; duplicate rows found without accepted remediation plan. |
| Production impact | Blocks production financial operations visibility because duplicate approvals or duplicate reversals would affect customer, platform, and worker balances. |
| Verification responsibility | Production environment and Finance/SRE evidence required. Codex can review query text and redacted outputs, but cannot verify production data without provided evidence. |

## PROD-OPS-009 Event Handler Lag Monitoring

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | SRE / Backend owner |
| Exact evidence required | Production alert for stale pending `event_outbox` rows where `event_type = 'refund.approved'`, including age threshold, count threshold, route/channel, owner, and remediation runbook. |
| Command or artifact expected | SQL/dashboard query for pending age, alert rule definition, notification test, and runbook. Example artifact path: `docs/release/evidence/PHASE14_PROD_EVENT_LAG_MONITORING_<timestamp>.md`. |
| Pass criteria | Pending `refund.approved` event age is observable, alerting is active, threshold is approved, and owner/remediation path is recorded. |
| Fail criteria | No pending-age query; no alert; alert only covers generic outbox count without refund-specific filtering; no escalation owner; production channel untested. |
| Production impact | Blocks production because refund approvals could stall without reversal ledger entries and without timely detection. |
| Verification responsibility | Production SRE/backend evidence required. Codex can review artifacts and query text but cannot prove live alert routing without operator evidence. |

## PROD-OPS-010 Replay/Immutability Release Gate Timing

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | Release owner / Ledger owner |
| Exact evidence required | `check-release-window-data.ps1` run immediately before the production cut and immediately after the production cut in a quiet release window, with logs proving `check-ledger-replay.ps1` and `check-ledger-immutability.ps1` both passed at release time. |
| Command or artifact expected | Procedure: `docs/release/PHASE14_RELEASE_WINDOW_GATE_TIMING.md`. Pre-cut command log and post-cut command log, both from the intended release candidate and isolated release window. Required command: `.\deploy\production\check-release-window-data.ps1 -EnvFile .env.production -ExpectedCommit <full-40-char-sha> -Confirmation RELEASE-WINDOW-READ-ONLY -QuietWindowConfirmed`. Optional supporting command: production smoke equivalent after the post-cut gate if production ingress is available. Example artifact path: `docs/release/evidence/PHASE14_PROD_RELEASE_GATE_<timestamp>.md`. |
| Pass criteria | Both pre-cut and post-cut read-only runs pass in an isolated quiet window, logs include ledger replay PASS and ledger immutability proof PASS, no tests/smoke/manual UAT or other DB writes ran concurrently with the gate, and the release owner ties both logs to the exact production release candidate. |
| Fail criteria | Either run is missing, not release-window timed, fails, omits replay/immutability output, runs concurrently with tests/smoke/manual UAT or other DB writes, or is run against the wrong commit/environment. |
| Production impact | Blocks production because ledger replay and immutability must be proven at the actual production release boundary. |
| Verification responsibility | Partially Codex-verifiable after logs exist. Codex can run local/staging validation, but production closure requires isolated release-window evidence and owner attachment. A standalone PASS after a concurrent failure is acceptable only when the concurrent failure is documented and the release-window run is isolated. |

## PROD-OPS-012 Operator/App Onboarding Signoff

| Field | Requirement |
| --- | --- |
| Current status | NOT RUN |
| Owner | Product / Support / Compliance owners |
| Exact evidence required | Explicit signoff for customer app onboarding copy/support path, worker app onboarding and certification support path, admin operator access provisioning, external payment/refund support playbook, refund reversal dispute escalation, privacy, terms, and compliance readiness. |
| Command or artifact expected | Owner approval record with names/roles/timestamps; support and compliance checklist; training/onboarding artifact links. Example artifact path: `docs/release/evidence/PHASE14_PROD_OPERATOR_ONBOARDING_SIGNOFF_<timestamp>.md`. |
| Pass criteria | All named owners approve, open support/compliance gaps are either closed or accepted by the release owner, and production support paths are documented. |
| Fail criteria | Missing owner approval, missing support escalation path, unresolved compliance/privacy blocker, or app/operator onboarding not reviewed. |
| Production impact | Blocks production because user-facing and operator readiness is not approved. |
| Verification responsibility | Human owner evidence required. Codex can format or review a provided signoff record but cannot create approval. |

## PROD-OPS-013 Release Owner Approval

| Field | Requirement |
| --- | --- |
| Current status | FAIL |
| Owner | Release owner |
| Exact evidence required | Final release owner approval after every `PROD-OPS-001` through `PROD-OPS-013` row is PASS, validation passes on the intended production release candidate, and production deploy/tag timing is approved. |
| Command or artifact expected | Signed release approval record referencing all evidence paths, final commit, production image/tag plan, release window, rollback owner, and go/no-go decision. Example artifact path: `docs/release/evidence/PHASE14_PROD_RELEASE_APPROVAL_<timestamp>.md`. |
| Pass criteria | All PROD-OPS rows are PASS, required validation is green, no unresolved production blockers remain, and release owner explicitly approves production deployment and tag creation. |
| Fail criteria | Any PROD-OPS row remains FAIL or NOT RUN, release owner declines/defers, final validation fails, or production deploy/tag plan is missing. |
| Production impact | Blocks production release and production tag creation. |
| Verification responsibility | Human release-owner approval required. Codex must not mark this PASS without explicit approval evidence. |

## Production Release Decision Matrix

| Condition | Decision |
| --- | --- |
| All `PROD-OPS-001` through `PROD-OPS-013` are PASS, release-window validation passes, and release owner approval is recorded | GO |
| Any `PROD-OPS-*` item is FAIL | NO-GO |
| Any `PROD-OPS-*` item is NOT RUN | NO-GO |
| RC2 staging/internal beta is PASS but any production evidence item remains non-PASS | NO-GO |
| Local/staging `typecheck`, `test`, `preflight`, or smoke pass but production environment evidence is missing | NO-GO |

RC2 staging PASS does not equal production PASS. Production approval requires production-specific secrets, ingress, DB, monitoring, release-window replay/immutability evidence, onboarding signoff, and final release-owner approval.
