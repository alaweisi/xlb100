# Tencent Cloud infrastructure for XLB

This directory contains the repository-owned infrastructure contract for a future XLB deployment on Tencent Cloud TKE.

Current status: **offline-ready IaC only**. Nothing in this directory creates cloud resources unless an operator explicitly supplies real Tencent Cloud credentials, replaces every environment placeholder, acknowledges billable resources, and runs `terraform apply` outside the repository validation command.

## Scope

The Terraform root module can:

- create or reference a managed TKE cluster;
- create a TKE node pool in an existing VPC and subnets;
- create or reference a private TCR instance;
- manage the private `xlb` TCR namespace and four image repositories;
- create or reference a private, versioned COS bucket for application objects;
- publish a non-secret deployment contract containing resource IDs and internal dependency endpoints.

The module deliberately does not create VPCs, MySQL, Redis, DNS, TLS certificates, CLB listeners, Kubernetes Secrets, or production data. Those resources require choices that cannot be guessed safely. Existing VPC, subnet, MySQL, Redis and Secret references are explicit inputs. CLB is created later by the approved TKE Ingress deployment.

## Safety model

- `create_*` flags default to `false`.
- Any billable resource plan requires `enable_billable_resources = true` and an environment-specific acknowledgement string.
- TKE, node pool and TCR deletion protection default to enabled.
- COS is private, versioned and refuses force-clean deletion.
- TKE API public access and worker public IPs are disabled.
- Credentials are read only from `TENCENTCLOUD_SECRET_ID`, `TENCENTCLOUD_SECRET_KEY`, and optional temporary-token environment variables.
- `validate.ps1` removes Tencent Cloud credential variables from its child process and only runs `fmt`, `init -backend=false`, `validate`, and mocked `terraform test`.
- There is no repository script that runs `terraform apply`.

## Offline validation

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File infra/tencent/validate.ps1
```

The validator downloads the pinned Terraform CLI into the gitignored `.artifacts` directory, verifies its SHA-256 checksum, downloads the pinned provider from Terraform Registry, and performs no Tencent Cloud API request.

## Future planning workflow

After the environment owner has frozen region, VPC, subnet, TKE version, node type, MySQL, Redis and bucket decisions:

```powershell
$env:TENCENTCLOUD_SECRET_ID = '<temporary-secret-id>'
$env:TENCENTCLOUD_SECRET_KEY = '<temporary-secret-key>'
$env:TENCENTCLOUD_SECURITY_TOKEN = '<temporary-token-if-used>'

terraform -chdir=infra/tencent/terraform init `
  -backend-config=environments/staging.backend.hcl

terraform -chdir=infra/tencent/terraform plan `
  -var-file=environments/staging.tfvars
```

Files ending in `.example` are documentation only. Copy them to ignored local files before replacing placeholders. Do not add credentials to backend configuration, tfvars, plan files, CI variables printed to logs, or Git.

Remote state uses Terraform's COS backend with locking and encryption. The state bucket must be created and protected separately before initializing this root module, so Terraform never attempts to manage the bucket that stores its own state.

Actual `apply`, import, state migration, cloud deployment, data migration and resource destruction remain separate externally authorized operations.
