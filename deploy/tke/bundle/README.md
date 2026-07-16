# TKE cloud environment bundle generator

This Wave 1 / P2 component converts one reviewed, non-secret input into the
Terraform and Helm files consumed by the gated release line. It is an offline
artifact generator: it never reads Tencent Cloud credentials, contacts a
provider, runs Terraform, uses kubeconfig, or grants runtime authorization.

## Inputs and outputs

Real inputs and outputs must remain under the ignored `.artifacts/tke/` root.
Copy `reviewed-cloud-input.example.json` to an ignored review path, replace the
synthetic values with reviewed facts, and point `imageLockFile` at P1's immutable
image lock.

```powershell
node deploy/tke/bundle/generate-cloud-bundle.mjs `
  --manifest .artifacts/tke/reviews/production.reviewed.json
```

For `production`, the output directory is exactly `.artifacts/tke/production/`:

- `cloud-bundle.json` — Wave 0 `cloud-bundle.schema.json` contract and the exact file referenced by `release-manifest.json`;
- `production.tfvars` — reviewed Terraform inputs;
- `production.backend.hcl` — private and encrypted remote-state coordinates;
- `values-production.yaml` — immutable Helm image values and Secret names only;
- `bundle-files.json` — deterministic payload hash inventory;
- `bundle.sha256` — digest of the ordered payload inventory.

The generator rejects credential-like fields and content, placeholders, local
hosts, mutable/zero image references, release/source drift, and disagreement
between the reviewed environment, region, VPC, Terraform, Helm, registry, COS,
or image lock.

## Integration hand-off

The integration owner should add this command to the shared orchestrator and
aggregate test scripts. This branch intentionally does not edit `package.json`,
`deploy/tke/xlb-tke.ps1`, workflows, or shared delivery checkers.
