-- Serialize worker withdrawals on the worker balance aggregate and make
-- creation safely replayable across retries.

ALTER TABLE worker_withdrawal_requests
  ADD COLUMN idempotency_key_hash CHAR(64) NULL AFTER request_note,
  ADD COLUMN request_fingerprint CHAR(64) NULL AFTER idempotency_key_hash;

UPDATE worker_withdrawal_requests
   SET idempotency_key_hash = SHA2(CONCAT('legacy:', withdrawal_id), 256),
       request_fingerprint = SHA2(
         CONCAT_WS(
           ':',
           bank_account_id,
           CAST(amount AS CHAR),
           COALESCE(request_note, '')
         ),
         256
       )
 WHERE idempotency_key_hash IS NULL
    OR request_fingerprint IS NULL;

ALTER TABLE worker_withdrawal_requests
  MODIFY idempotency_key_hash CHAR(64) NOT NULL,
  MODIFY request_fingerprint CHAR(64) NOT NULL,
  ADD CONSTRAINT uq_worker_withdrawal_idempotency
    UNIQUE (city_code, worker_id, idempotency_key_hash),
  ADD CONSTRAINT chk_worker_withdrawal_idempotency_hashes CHECK (
    idempotency_key_hash REGEXP '^[0-9a-f]{64}$'
    AND request_fingerprint REGEXP '^[0-9a-f]{64}$'
  );

INSERT INTO schema_migrations (version)
VALUES ('067_worker_withdrawal_idempotency')
ON DUPLICATE KEY UPDATE version = version;
