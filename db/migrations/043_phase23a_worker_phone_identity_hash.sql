-- Phase 23A: exact, non-reversible worker phone identity.
-- Existing rows cannot be backfilled from phone_masked because the source value is
-- intentionally incomplete. They remain NULL and must be enrolled from a trusted,
-- verified full-phone source before phone-based authentication is allowed.

-- MySQL DDL auto-commits. Guard the column and index independently so a
-- connection loss between ALTER and the schema_migrations marker remains
-- safely replayable.
SET @phone_hash_column_exists = (
  SELECT COUNT(*)
    FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'worker_profiles'
     AND column_name = 'phone_hash'
);
SET @phone_hash_column_sql = IF(
  @phone_hash_column_exists = 0,
  'ALTER TABLE worker_profiles ADD COLUMN phone_hash CHAR(64) NULL AFTER phone_masked',
  'SELECT 1'
);
PREPARE phone_hash_column_stmt FROM @phone_hash_column_sql;
EXECUTE phone_hash_column_stmt;
DEALLOCATE PREPARE phone_hash_column_stmt;

SET @phone_hash_index_exists = (
  SELECT COUNT(*)
    FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'worker_profiles'
     AND index_name = 'uq_worker_profiles_phone_hash'
);
SET @phone_hash_index_sql = IF(
  @phone_hash_index_exists = 0,
  'ALTER TABLE worker_profiles ADD UNIQUE INDEX uq_worker_profiles_phone_hash (phone_hash)',
  'SELECT 1'
);
PREPARE phone_hash_index_stmt FROM @phone_hash_index_sql;
EXECUTE phone_hash_index_stmt;
DEALLOCATE PREPARE phone_hash_index_stmt;

INSERT INTO schema_migrations (version)
VALUES ('043_phase23a_worker_phone_identity_hash')
ON DUPLICATE KEY UPDATE version = version;
