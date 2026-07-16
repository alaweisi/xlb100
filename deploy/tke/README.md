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
the approved kube-context, `-Apply`, and the action-specific confirmation shown
by a failed preflight. Production migration, traffic cutover and resource
destruction are not hidden inside `Deploy`.
