# XLB image release factory

This workstream builds the four XLB application images and freezes registry
digests into the Wave 0 `images-lock` contract. The default mode is a dry-run.
The tool never performs registry login and never accepts registry credentials.

## Modes

| Mode | Effect |
| --- | --- |
| `plan` | Writes a release manifest and image plan below `.artifacts/tke/`; runs no external command. |
| `build` | Builds all four images into the local Docker daemon; performs no push and cannot create an image lock. |
| `publish` | Builds and pushes all four images, reads registry digests, generates SBOM/scan evidence, and writes `images.lock.json`. |
| `freeze` | Reads an already-published release tag, generates evidence, and writes the immutable lock without rebuilding. |

Copy `release-input.example.json` to an ignored path such as
`.artifacts/tke/release-input.json`, replace every synthetic value, and ensure
`sourceCommit` is the current full Git SHA.

```powershell
# Safe default: no Docker, registry, or cloud command is run.
node deploy/tke/release/image-release.mjs `
  --input .artifacts/tke/release-input.json

# Local build only; still no registry write.
node deploy/tke/release/image-release.mjs `
  --input .artifacts/tke/release-input.json `
  --mode build
```

`publish` and `freeze` are external registry operations. They require a
separate authorized release window and an exact release-scoped confirmation
token. Authentication must be completed outside this tool using the operator's
normal secret-injection mechanism.

```powershell
node deploy/tke/release/image-release.mjs `
  --input .artifacts/tke/release-input.json `
  --mode publish `
  --confirmation PUBLISH-IMAGES-<release-id>

# Freeze an already-published release without pushing.
node deploy/tke/release/image-release.mjs `
  --input .artifacts/tke/release-input.json `
  --mode freeze `
  --confirmation FREEZE-IMAGES-<release-id>
```

The publishing host must provide Docker Buildx, Syft, and Trivy. Trivy is run
with `--exit-code 1` for HIGH or CRITICAL findings, so an unsafe scan prevents
the image lock from being written. Registry digests are obtained from
`docker buildx imagetools inspect`, never calculated from a mutable tag.

## Safety and idempotence

- `latest`, repository tags, placeholder values, zero digests, credentials,
  and inputs outside `.artifacts/tke/` are rejected.
- A release ID is bound to one Git commit, environment, owner set, change
  window, traffic provider, and repository prefix.
- Re-running a completed release returns the existing lock without rebuilding
  or republishing. Changing its identity requires a new release ID.
- All generated files remain under ignored
  `.artifacts/tke/releases/<release-id>/`.
- No generated artifact grants cloud deployment, migration, cutover, or
  Lighthouse retirement authority.

The shared root `package.json`, `deploy/tke/xlb-tke.ps1`, delivery checker, and
CI workflow are intentionally left for the Gate 1 integration owner.
