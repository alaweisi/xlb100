-- TKE readiness: add private Tencent COS as an explicitly external evidence store.
-- Migration 035 remains immutable; existing local/mock rows satisfy every widened check below.

ALTER TABLE media_assets
  DROP CHECK chk_media_asset_provider,
  DROP CHECK chk_media_asset_provider_name,
  DROP CHECK chk_media_asset_provider_status,
  DROP CHECK chk_media_asset_no_external_provider,
  DROP CHECK chk_media_asset_storage_uri,
  ADD CONSTRAINT chk_media_asset_provider
    CHECK (storage_provider IN ('local','mock','cos')),
  ADD CONSTRAINT chk_media_asset_provider_name
    CHECK (storage_provider_name IN ('xlb-local-filesystem','xlb-memory-mock','tencent-cos')),
  ADD CONSTRAINT chk_media_asset_provider_status CHECK (
    (storage_provider = 'local' AND storage_provider_status = 'stored_local' AND storage_provider_name = 'xlb-local-filesystem')
    OR (storage_provider = 'mock' AND storage_provider_status = 'stored_mock' AND storage_provider_name = 'xlb-memory-mock')
    OR (storage_provider = 'cos' AND storage_provider_status = 'stored_cos' AND storage_provider_name = 'tencent-cos')
  ),
  ADD CONSTRAINT chk_media_asset_external_provider CHECK (
    (storage_provider IN ('local','mock') AND external_provider_executed = 0)
    OR (storage_provider = 'cos' AND external_provider_executed = 1)
  ),
  ADD CONSTRAINT chk_media_asset_storage_uri CHECK (
    (storage_provider = 'local' AND storage_uri LIKE 'xlb-local://%')
    OR (storage_provider = 'mock' AND storage_uri LIKE 'xlb-mock://%')
    OR (storage_provider = 'cos' AND storage_uri LIKE 'cos://%/%')
  );

INSERT INTO schema_migrations(version) VALUES ('059_tke_cos_object_storage')
ON DUPLICATE KEY UPDATE version=version;
