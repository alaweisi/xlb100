# TKE one-command release Wave 1 result

Date: 2026-07-16 (Asia/Shanghai)

WAVE1_STATUS=SUCCESS

## Integrated baseline

- Wave 0 contract baseline: `d0b2570`
- P1 image release source: `1870a38`
- P2 cloud bundle source: `a197a8f`
- P3 safety guards source: `064fc7f`
- Gate 1 integration branch: `codex/tke-wave1-integration`
- Gate 1 integration commit: use this document's containing commit

## Accepted capabilities

1. Four-image plan/build/publish/freeze implementation with TCR registry digest
   inspection, SBOM and vulnerability gates. Registry publication remains a
   separately confirmed external operation.
2. Offline reviewed cloud bundle generation for Terraform, Helm and release
   artifacts. Credentials, placeholders and cross-environment drift are
   rejected.
3. Offline jobs single-active, Redis lease/fencing, backup, restore drill,
   migration and rollback evidence guards.
4. Unified `ReleaseImages`, `GenerateCloudBundle` and
   `VerifySafetyEvidence` actions with fail-closed defaults.
5. CI and repository gates include all frozen Wave 0 contracts and Wave 1
   implementation tests.

## Gate 1 evidence

- Wave 1 focused tests: 27/27 passed.
- Aggregate Node tests: 58/58 passed.
- Unified PowerShell positive and negative entry tests: passed.
- Helm lint/render for local, staging and production: passed.
- kubeconform: 21 valid, 0 invalid, 0 errors, 1 missing CRD schema skipped.
- Terraform fmt/init without backend/validate and mocked tests: 3/3 passed.
- N5 offline observability validation: passed; local `promtool` lookup used the
  documented deterministic fallback.
- Static delivery and release contract checks: passed.
- `git diff --check`: passed.

The first aggregate attempt encountered transient network failures while
downloading pinned Helm, Terraform and Kubernetes schemas in the fresh
worktree. Existing checksum/version-verified local tool caches were reused;
the unchanged validation was rerun successfully. No version pin or validation
was bypassed.

## External-operation boundary

No Tencent Cloud login, TCR push, Terraform real plan/apply, Kubernetes cloud
deployment, production database access, jobs stop/start, traffic cutover or
Lighthouse operation occurred. Wave 1 produces repository capabilities and
offline evidence only; it does not grant N7 or N8 runtime authority.

## Wave 2 entry

Wave 2 may start from this Gate 1 commit. P4 resumable orchestration, P5
CLB/DNS cutover control and the P6 simulation foundation may use separate
worktrees, while shared entry points remain integration-owner files.
