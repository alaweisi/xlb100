# Phase 14 Production Operator Request Sheet

## Decision

- Request sheet status: READY FOR HUMAN / OPERATOR HANDOFF
- Production release status: NO-GO / BLOCKED
- Date: 2026-07-06
- Scope: documentation only; no code, schema, CI gate, deployment, or production tag change.

This sheet is the handoff request for Ops, SRE, DBA, Product, Support, Compliance, Ledger, and Release owners. It does not mark any `PROD-OPS-*` item PASS. Each remaining blocker stays non-PASS until the named owner supplies concrete evidence and the release owner accepts it.

## Current Remaining Status

| ID | Status | Owner | Group |
| --- | --- | --- | --- |
| `PROD-OPS-001` | NOT RUN | Security / Ops owner | Infrastructure |
| `PROD-OPS-002` | NOT RUN | Infra / Ops owner | Infrastructure |
| `PROD-OPS-003` | NOT RUN | DBA / Ops owner | Infrastructure |
| `PROD-OPS-007` | NOT RUN | SRE / Ops owner | Monitoring |
| `PROD-OPS-008` | NOT RUN | SRE / Finance ops owner | Monitoring |
| `PROD-OPS-009` | NOT RUN | SRE / Backend owner | Monitoring |
| `PROD-OPS-010` | NOT RUN | Release owner / Ledger owner | Release window |
| `PROD-OPS-012` | NOT RUN | Product / Support / Compliance owners | Human approval |
| `PROD-OPS-013` | FAIL | Release owner | Human approval |

## Infrastructure

### `PROD-OPS-001` Production Secrets Management

| Field | Request |
| --- | --- |
| Owner | Security / Ops owner |
| Human/operator must provide | Redacted production secret inventory and rotation ownership for app, DB, Redis, JWT/session, frontend API base URLs, and operator/admin bootstrap credentials. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_SECRETS_INVENTORY_<timestamp>.md` with secret-manager or deployment-variable inventory; values redacted; proof all values are production-scoped and non-example. |
| PASS criteria | All required production variables are present, non-empty, non-example, scoped to production, redacted in repo evidence, and have owner plus rotation path. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Partially. Codex can review the redacted manifest for completeness and example-value leakage, but cannot verify external secret-manager state without operator evidence. |

### `PROD-OPS-002` Production Domain/TLS/Ingress

| Field | Request |
| --- | --- |
| Owner | Infra / Ops owner |
| Human/operator must provide | Approved production hostnames, DNS records, TLS certificate proof, ingress/reverse-proxy routing, CORS/API base behavior, and HTTPS smoke logs. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_DOMAIN_TLS_INGRESS_<timestamp>.md` plus production HTTPS smoke output for customer, worker, admin, backend health, and backend DB health. |
| PASS criteria | HTTPS is valid for all production hostnames, routes point to the intended production release candidate, CORS/frontend API bases match production, and smoke checks pass through production ingress. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Partially. Codex can review logs and run repo smoke scaffolds if a safe production env file is provided, but cannot mutate DNS/TLS/ingress. |

### `PROD-OPS-003` Production DB Provisioning

| Field | Request |
| --- | --- |
| Owner | DBA / Ops owner |
| Human/operator must provide | Production MySQL topology, host/database/user inventory, least-privilege grants, timezone/charset/collation, connection limits, backup policy, restore target, and migration target confirmation. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_DB_PROVISIONING_<timestamp>.md` with redacted DB inventory and SQL outputs for version, timezone, charset/collation, grants, and `schema_migrations`. |
| PASS criteria | Isolated production DB exists, staging is not reused, secrets are production-only, grants are least privilege, backup/restore strategy is approved, and migration target is ready for Phase 14R. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Partially. Codex can inspect redacted DB artifacts and query text, but cannot prove external provisioning without operator-provided outputs. |

## Monitoring

### `PROD-OPS-007` General Monitoring And Alerting

| Field | Request |
| --- | --- |
| Owner | SRE / Ops owner |
| Human/operator must provide | Production dashboards, alert rules, thresholds, owners, notification route test, and runbook links for availability, 5xx, outbox, refund, reversal, replay, immutability, and audit gaps. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_MONITORING_ALERTING_<timestamp>.md` with dashboard exports/screenshots, alert definitions, notification test, and owner approval. |
| PASS criteria | Dashboards and alerts cover all required Phase 14R availability, financial, replay, immutability, and audit signals; notification routing is tested; SRE/Ops approves. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Partially. Codex can review exported configs/screenshots and compare coverage to `docs/release/PHASE14_PRODUCTION_MONITORING_EVIDENCE.md`; live alert routing remains operator-owned. |

### `PROD-OPS-008` Duplicate Refund/Reversal Monitoring

| Field | Request |
| --- | --- |
| Owner | SRE / Finance ops owner |
| Human/operator must provide | Production or production-read-replica duplicate checks for `refund.approved` events and reversal ledger rows, plus dashboard/alert route and Finance escalation approval. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_DUPLICATE_MONITORING_<timestamp>.md` with SQL/query output, dashboard or alert evidence, zero-row baseline or accepted remediation, and owner approval. |
| PASS criteria | Duplicate refund and reversal queries run against production/read replica, baseline is recorded, alerts fire on duplicate counts, and Finance/SRE approve escalation. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Partially. Codex can review query text, redacted outputs, and alert definitions; production data truth requires operator-provided evidence. |

### `PROD-OPS-009` Event Handler Lag Monitoring

| Field | Request |
| --- | --- |
| Owner | SRE / Backend owner |
| Human/operator must provide | Production pending-age query and alert for `event_outbox` rows where `event_type = 'refund.approved'`, including threshold, owner, notification route, and remediation runbook. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_EVENT_LAG_MONITORING_<timestamp>.md` with pending-age query output, alert rule, notification test, and SRE/Backend approval. |
| PASS criteria | Pending `refund.approved` age is observable, alert threshold is approved, notification route is tested, and owner/remediation path is recorded. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Partially. Codex can review query/output format and alert definitions; live alert routing remains operator-owned. |

## Release Window

### `PROD-OPS-010` Pre-Cut Isolated Preflight

| Field | Request |
| --- | --- |
| Owner | Release owner / Ledger owner |
| Human/operator must provide | Quiet release-window pre-cut `npx pnpm preflight` log from the intended production release candidate. |
| Exact evidence required | Pre-cut section in `docs/release/evidence/PHASE14_PROD_RELEASE_GATE_<timestamp>.md`, including commit hash, operator, environment, quiet-window confirmation, full log, `check-ledger-replay: passed`, and `check-ledger-immutability: passed`. |
| PASS criteria | Pre-cut preflight exits 0 in an isolated quiet window with no concurrent tests, smoke, UAT, seed, migration, rollback, or ad hoc DB write activity; replay and immutability both pass. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Yes, partially. Codex can inspect the log and confirm replay/immutability PASS lines, commit/environment notes, and quiet-window attestation. Final acceptance remains Release/Ledger owner-owned. |

### `PROD-OPS-010` Post-Cut Isolated Preflight

| Field | Request |
| --- | --- |
| Owner | Release owner / Ledger owner |
| Human/operator must provide | Quiet release-window post-cut `npx pnpm preflight` log from the same intended production release candidate after the approved cut/deploy action. |
| Exact evidence required | Post-cut section in `docs/release/evidence/PHASE14_PROD_RELEASE_GATE_<timestamp>.md`, including commit hash, operator, environment, quiet-window confirmation, full log, `check-ledger-replay: passed`, and `check-ledger-immutability: passed`. |
| PASS criteria | Post-cut preflight exits 0 in an isolated quiet window, replay and immutability both pass, and any failed/retried run is explained and owner-approved. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Yes, partially. Codex can inspect the log and compare it against `docs/release/PHASE14_RELEASE_WINDOW_GATE_TIMING.md`. Final acceptance remains Release/Ledger owner-owned. |

## Human Approval

### `PROD-OPS-012` Operator/App Onboarding Signoff

| Field | Request |
| --- | --- |
| Owner | Product / Support / Compliance owners |
| Human/operator must provide | Signoff for customer onboarding, worker onboarding/certification support, admin operator provisioning, payment/refund support playbook, refund reversal dispute escalation, privacy, terms, and compliance readiness. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_OPERATOR_ONBOARDING_SIGNOFF_<timestamp>.md` with owner names/roles/timestamps, support/compliance checklist, and training/onboarding artifact links. |
| PASS criteria | All named owners approve, open support/compliance gaps are closed or explicitly accepted by the release owner, and production support paths are documented. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Limited. Codex can review document completeness and formatting, but cannot create or substitute human approval. |

### `PROD-OPS-013` Release Owner Approval

| Field | Request |
| --- | --- |
| Owner | Release owner |
| Human/operator must provide | Final go/no-go approval after every `PROD-OPS-001` through `PROD-OPS-013` row is PASS, release-window validation is attached, and deployment/tag timing is explicitly authorized. |
| Exact evidence required | `docs/release/evidence/PHASE14_PROD_RELEASE_APPROVAL_<timestamp>.md` referencing all evidence paths, final commit, production image/tag plan, release window, rollback owner, and explicit go/no-go decision. |
| PASS criteria | All `PROD-OPS-*` rows are PASS, final validation is green, deployment/rollback plan is approved, and release owner explicitly authorizes production deploy and tag creation. |
| Deadline/status | Owner to fill: `deadline=<date>`, `status=NOT STARTED / IN PROGRESS / READY FOR REVIEW / BLOCKED`. |
| Codex can verify after evidence? | Limited. Codex can cross-check referenced evidence and status consistency, but cannot approve production release. |

## Submission Checklist

Before asking Codex to review supplied evidence, operators should attach or create the requested evidence files under `docs/release/evidence/` and fill every `deadline/status` field in this request sheet or the corresponding evidence artifact.

Production remains NO-GO while any item in this sheet remains `NOT RUN` or `FAIL`.
