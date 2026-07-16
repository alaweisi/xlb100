# XLB TKE delivery entry

`xlb-tke.ps1` is the single operator entry for the repository-owned TKE
delivery line. It composes the Helm Chart and Tencent Terraform contract but
does not weaken their boundaries.

## Safe defaults

- Every operational action is a dry-run unless `-Apply` is present.
- An applied action also requires its exact confirmation token.
- Cluster actions require `-KubeContext` to match both the environment-approved
  context variable and `kubectl config current-context` exactly.
- Staging and production deployment values must contain immutable digests and
  real, non-placeholder hosts and external Secret references.
- Normal `Deploy` always keeps the migration Job disabled.
- `Migrate` requires a unique run ID and, when applied, `-BackupConfirmed`.
- No action creates Kubernetes Secret objects or accepts secret values in
  values files.

Approved context variables are operator-local configuration and are never
committed:

```text
XLB_TKE_LOCAL_CONTEXT
XLB_TKE_STAGING_CONTEXT
XLB_TKE_PRODUCTION_CONTEXT
```

## Offline validation

```powershell
pwsh deploy/tke/xlb-tke.ps1 -Action Validate -Environment local
pwsh deploy/tke/bootstrap-tools.ps1
pwsh deploy/tke/tests/run-tests.ps1
node --test deploy/tke/tests/check-tke-delivery-line.test.mjs
```

`Validate` runs repository safety checks, Helm lint/render checks and Terraform
fmt/validate/mock tests. It does not run Terraform plan/apply or contact a
Tencent Cloud account.

## N7 offline staging preparation

N7 starts from the accepted N6 commit and prepares a review bundle before any
Tencent Cloud account is read. Copy the three reviewed environment inputs and
the staging manifest into the gitignored `.artifacts/tke/staging` directory:

```powershell
New-Item -ItemType Directory -Force .artifacts/tke/staging | Out-Null
Copy-Item infra/tencent/terraform/environments/staging.tfvars.example `
  .artifacts/tke/staging/staging.tfvars
Copy-Item infra/tencent/terraform/environments/staging.backend.hcl.example `
  .artifacts/tke/staging/staging.backend.hcl
Copy-Item deploy/environments/tke/values-staging.yaml `
  .artifacts/tke/staging/values-staging.yaml
Copy-Item deploy/tke/staging/staging-plan.example.json `
  .artifacts/tke/staging/manifest.json
```

Replace every placeholder with reviewed non-secret values, keep every
authorization field `false`, then run:

```powershell
pwsh deploy/tke/xlb-tke.ps1 -Action PrepareStaging -Environment staging `
  -StagingManifest .artifacts/tke/staging/manifest.json
```

This validates cross-file region, dependency, Secret-name, COS and immutable
image contracts and writes hashed evidence under `.artifacts/tke/staging-plan`.
It never reads cloud credentials, remote Terraform state or a kube-context.

On Windows, `bootstrap-tools.ps1` downloads Helm and kubeconform into the
gitignored `.artifacts` cache and verifies their pinned executable checksums.
Terraform continues to use the separately pinned `infra/tencent` bootstrap.

## Dry-run examples

```powershell
pwsh deploy/tke/xlb-tke.ps1 -Action PlanInfrastructure -Environment staging
pwsh deploy/tke/xlb-tke.ps1 -Action Deploy -Environment staging
pwsh deploy/tke/xlb-tke.ps1 -Action Migrate -Environment staging -RunId release-001
pwsh deploy/tke/xlb-tke.ps1 -Action Smoke -Environment staging
pwsh deploy/tke/xlb-tke.ps1 -Action Rollback -Environment staging -Revision 1
```

Actual cluster or infrastructure operations remain future external operations.
They require reviewed, ignored environment files, operator-injected credentials,
the approved kube-context and an action-specific confirmation. A real Terraform
plan uses the dedicated `-ExecutePlan` switch; it never accepts `-Apply`.
Cluster mutations use `-Apply`. Production migration, traffic cutover and
resource destruction are not hidden inside `Deploy`.

## N8 offline production preparation

N8 is allowed to prepare only after a real N7 result reports `PASS`. An N7
`PREPARED_OFFLINE` result is intentionally rejected. Production inputs live
under the ignored `.artifacts/tke/production` directory:

```powershell
New-Item -ItemType Directory -Force .artifacts/tke/production | Out-Null
Copy-Item infra/tencent/terraform/environments/production.tfvars.example `
  .artifacts/tke/production/production.tfvars
Copy-Item infra/tencent/terraform/environments/production.backend.hcl.example `
  .artifacts/tke/production/production.backend.hcl
Copy-Item deploy/environments/tke/values-production.yaml `
  .artifacts/tke/production/values-production.yaml
Copy-Item deploy/tke/production/production-plan.example.json `
  .artifacts/tke/production/manifest.json
```

Add the real N7 PASS evidence as
`.artifacts/tke/production/n7-staging-pass.json`, replace every non-secret
placeholder, keep all authorization fields `false`, and run:

```powershell
pwsh deploy/tke/xlb-tke.ps1 -Action PrepareProduction -Environment production `
  -ProductionManifest .artifacts/tke/production/manifest.json
```

The gate requires exact reuse of all four N7-validated image digests, verified
backup/restore and object-sync evidence, a jobs single-active procedure, a
Lighthouse rollback endpoint and the fixed 5/25/50/100 weighted rollout. It
writes only ignored plan evidence. Infrastructure apply, no-traffic deploy,
migration, traffic cutover and Lighthouse decommission remain separate Human
authorization gates.
