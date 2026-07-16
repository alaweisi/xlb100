# Local TKE delivery-line acceptance

This directory is the N6 local integration gate. It exercises the same Helm
Chart and `deploy/tke/xlb-tke.ps1` operator entry that will later target TKE,
but runs only against a disposable local kind cluster.

Prerequisites: Docker Desktop/Engine, `docker`, `kubectl`, Node.js and
PowerShell. The runner downloads the pinned kind binary after verifying its
SHA-256 checksum; the existing N4 bootstrap supplies pinned Helm. A
digest-pinned official Prometheus image supplies the authoritative `promtool`
rule parser.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/tke/run-local-acceptance.ps1
```

Useful rerun options:

```powershell
# Reuse already-built xlb/*:local images.
powershell -NoProfile -ExecutionPolicy Bypass -File tests/tke/run-local-acceptance.ps1 -SkipImageBuild

# Keep the disposable cluster and dependency containers for inspection.
powershell -NoProfile -ExecutionPolicy Bypass -File tests/tke/run-local-acceptance.ps1 -KeepResources

# Remove only resources bearing the N6 acceptance names/labels.
powershell -NoProfile -ExecutionPolicy Bypass -File tests/tke/run-local-acceptance.ps1 -CleanupOnly
```

The test database is `xlb_tke_acceptance` on host port `13306`; Redis uses
`16379`. The runner refuses to treat existing containers with the same names
as disposable unless they carry the N6 ownership label. Existing local XLB
containers and databases are not reused or removed.

Passing N6 proves local packaging and Kubernetes behavior only. It does not
prove Tencent credentials, TCR pulls, TKE networking, CLB/Ingress behavior,
managed MySQL/Redis/COS connectivity, or cloud rollback behavior.
