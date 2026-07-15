# Backend Providers — readiness only

Phase 18 introduces `objectStorage/` with exactly two provider modes:

- `local`: writes private bytes to the local filesystem and returns `stored_local`.
- `mock`: keeps bytes in memory for tests and returns `stored_mock`.

Both envelopes set `externalProviderExecuted=false` and `publicUrl=null`. No
Alibaba OSS, S3, COS, or other external provider client exists in this module.

The provider readiness layer also contains truthful Payment and SMS mocks plus
shared deterministic fault injection. External execution is closed in
`@xlb/config`; see `docs/operations/PROVIDER_INTEGRATION_READINESS_CHECKLIST.md`.
