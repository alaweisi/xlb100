-- Phase 21: retry-safe customer address creation

ALTER TABLE customer_addresses
  ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER city_code;

UPDATE customer_addresses
SET idempotency_key = CONCAT('legacy-', address_id)
WHERE idempotency_key IS NULL;

ALTER TABLE customer_addresses
  MODIFY COLUMN idempotency_key VARCHAR(128) NOT NULL,
  ADD UNIQUE KEY uq_customer_address_idempotency (customer_id, city_code, idempotency_key);

INSERT INTO schema_migrations(version) VALUES ('041_phase21_customer_address_idempotency');
