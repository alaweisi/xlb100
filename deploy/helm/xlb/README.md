# XLB Helm Chart

This Chart is the portable application layer for local Kubernetes and Tencent
Cloud TKE. It does not create cloud infrastructure, databases, Redis, object
storage, TLS certificates, or runtime credentials.

## Workloads

- `backend`: Deployment and ClusterIP Service.
- `jobs`: single-replica `Recreate` Deployment without a Service.
- `customer`, `worker`, `admin`, `oa`, `dashboard`: Deployment and ClusterIP Service per product surface.
- one configurable Ingress for the API plus five product hosts.
- optional PDB, HPA, NetworkPolicy, and ServiceMonitor resources.
- an explicitly enabled migration Job; it is not a Helm lifecycle hook.

## Required existing Secret

`runtimeSecrets.existingSecret` must exist in the release namespace before
installation. The Chart only mounts it and never creates credential material.

Required keys:

```text
mysql_password
mysql_tls_ca
redis_password
redis_tls_ca
jwt_secret
jwt_keys_json
auth_phone_hash_secret
auth_otp_pepper
cos_secret_id
cos_secret_key
```

TLS CA and COS keys can contain non-production dummy values for local runs when
their features are disabled, but all keys remain mandatory so the mounted file
contract is identical across environments.

## Rendering

```powershell
helm lint deploy/helm/xlb `
  -f deploy/environments/tke/values-local.yaml

helm template xlb-local deploy/helm/xlb `
  -f deploy/environments/tke/values-local.yaml `
  --namespace xlb-local
```

Run the complete N1 validation suite:

```powershell
pwsh deploy/helm/xlb/scripts/validate.ps1
```

The validation script expects Helm 3 on `PATH` or accepts `-HelmPath`. Pass
`-KubeconformPath` to add strict offline Kubernetes schema validation; unknown
custom resources such as ServiceMonitor are reported as skipped.

## Staging and production placeholders

The committed staging and production values are shape-valid so linting and
rendering can run without a cloud account. They intentionally contain reserved
hosts, placeholder repositories, and all-zero digests. N4 deployment tooling
must reject those markers before any apply.

## Migration

Migration is disabled by default. Rendering it requires both:

```powershell
--set migration.enabled=true --set-string migration.runId=<unique-run-id>
```

The future migration controller must verify backup, target database, approved
image digest, uniqueness, and explicit confirmation before creating the Job.
Normal `helm upgrade` must keep migration disabled.

## Cross-node dependencies

This Chart deliberately targets the frozen N2 application contract:

- liveness: `/health/live`;
- readiness: `/health/ready`;
- production object storage: `cos`;
- COS external execution: explicitly enabled only with the COS provider;
- COS credentials through `_FILE` variables.

The backend rejects either half of the COS double switch. Local values keep
external execution disabled; staging and production values select COS and
explicitly enable external execution.
