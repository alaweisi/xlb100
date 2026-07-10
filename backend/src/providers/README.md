# Backend Providers

Phase 18 introduces `objectStorage/` with exactly two provider modes:

- `local`: writes private bytes to the local filesystem and returns `stored_local`.
- `mock`: keeps bytes in memory for tests and returns `stored_mock`.

Both envelopes set `externalProviderExecuted=false` and `publicUrl=null`. No
Alibaba OSS, S3, COS, or other external provider client exists in this module.
