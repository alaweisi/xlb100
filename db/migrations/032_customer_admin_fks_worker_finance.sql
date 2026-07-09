-- Phase 16: customer/admin FK hardening + internal worker finance models.
-- Append-only. No external provider payout/refund/payment channel is introduced.

INSERT INTO customers (id, phone, name, avatar_url, default_city_code)
SELECT src.customer_id,
       CONCAT('legacy-', SUBSTRING(SHA2(src.customer_id, 256), 1, 12)),
       CONCAT('Legacy customer ', src.customer_id),
       NULL,
       MIN(src.city_code)
  FROM (
    SELECT customer_id, city_code FROM orders
    UNION ALL SELECT customer_id, city_code FROM dispatch_tasks
    UNION ALL SELECT customer_id, city_code FROM ledger_accruals
    UNION ALL SELECT customer_id, city_code FROM settlement_items
    UNION ALL SELECT customer_id, city_code FROM aftersale_refund_requests
    UNION ALL SELECT customer_id, city_code FROM order_reviews
  ) src
 WHERE src.customer_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = src.customer_id)
 GROUP BY src.customer_id
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO customers (id, phone, name, avatar_url, default_city_code) VALUES
  ('customer-demo-001', '13800000001', 'Demo Customer', NULL, 'hangzhou'),
  ('customer-dispatch-001', 'legacy-cust-dispatch', 'Dispatch Demo Customer', NULL, 'hangzhou')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO admin_users (id, username, role, city_scopes_json)
SELECT src.admin_id,
       CONCAT('legacy_', SUBSTRING(SHA2(src.admin_id, 256), 1, 16)),
       'operator',
       JSON_ARRAY()
  FROM (
    SELECT admin_user_id AS admin_id FROM admin_city_scopes
    UNION ALL SELECT reviewer_id FROM worker_certifications WHERE reviewer_id IS NOT NULL
    UNION ALL SELECT approved_by_admin_id FROM aftersale_refund_requests WHERE approved_by_admin_id IS NOT NULL
    UNION ALL SELECT confirmed_by FROM settlement_batches WHERE confirmed_by IS NOT NULL
    UNION ALL SELECT marked_by FROM settlement_payables
    UNION ALL SELECT enqueued_by FROM settlement_payable_queue
    UNION ALL SELECT generated_by FROM worker_receivable_statements
    UNION ALL SELECT reviewed_by FROM worker_receivable_statement_reviews
    UNION ALL SELECT exported_by FROM worker_receivable_statement_exports
    UNION ALL SELECT requested_by_admin_id FROM settlement_action_governance_intents
    UNION ALL SELECT submitted_by_admin_id FROM settlement_action_governance_reviews
    UNION ALL SELECT reviewed_by_admin_id FROM settlement_action_governance_reviews WHERE reviewed_by_admin_id IS NOT NULL
    UNION ALL SELECT created_by_admin_id FROM settlement_action_governance_evidence_bundles
    UNION ALL SELECT created_by_admin_id FROM settlement_action_governance_readiness_packets
    UNION ALL SELECT created_by_admin_id FROM settlement_execution_dry_run_plans WHERE created_by_admin_id IS NOT NULL
    UNION ALL SELECT actor_admin_id FROM settlement_execution_dry_run_plan_audit WHERE actor_admin_id IS NOT NULL
    UNION ALL SELECT frozen_by_admin_id FROM settlement_execution_preparation_envelopes WHERE frozen_by_admin_id IS NOT NULL
    UNION ALL SELECT approved_by_admin_id FROM settlement_execution_preparation_envelopes WHERE approved_by_admin_id IS NOT NULL
    UNION ALL SELECT actor_admin_id FROM settlement_execution_preparation_audit WHERE actor_admin_id IS NOT NULL
  ) src
 WHERE src.admin_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM admin_users au WHERE au.id = src.admin_id)
 GROUP BY src.admin_id
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO admin_users (id, username, role, city_scopes_json) VALUES
  ('admin-hangzhou', 'admin_hz', 'admin', JSON_ARRAY('hangzhou')),
  ('admin-shanghai', 'admin_sh', 'admin', JSON_ARRAY('shanghai')),
  ('admin-global', 'admin_global', 'operator', JSON_ARRAY('hangzhou', 'shanghai', 'beijing')),
  ('operator-hangzhou', 'operator_hz', 'operator', JSON_ARRAY('hangzhou')),
  ('operator-shanghai', 'operator_sh', 'operator', JSON_ARRAY('shanghai')),
  ('operator', 'operator_legacy', 'operator', JSON_ARRAY('hangzhou', 'shanghai')),
  ('op', 'op_legacy', 'operator', JSON_ARRAY('hangzhou', 'shanghai')),
  ('admin-operator', 'admin_operator', 'operator', JSON_ARRAY('hangzhou')),
  ('admin-phase14r', 'admin_phase14r', 'operator', JSON_ARRAY('hangzhou')),
  ('adm_1', 'adm_1', 'operator', JSON_ARRAY('hangzhou'))
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS worker_receivable_balances (
  city_code VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  accrued_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  adjusted_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  requested_withdrawal_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  marked_paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  available_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (city_code, worker_id),
  CONSTRAINT fk_worker_receivable_balances_city
    FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_worker_receivable_balances_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles(worker_id),
  CONSTRAINT chk_worker_receivable_balances_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_receivable_balances_currency CHECK (currency = 'CNY')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_receivable_adjustments (
  adjustment_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  refund_id VARCHAR(64) NOT NULL,
  source_event_id VARCHAR(64) NOT NULL,
  accrual_id VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  payment_order_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  gross_adjustment DECIMAL(12,2) NOT NULL,
  platform_fee_adjustment DECIMAL(12,2) NOT NULL,
  worker_receivable_adjustment DECIMAL(12,2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  reason VARCHAR(64) NOT NULL DEFAULT 'refund.approved',
  status VARCHAR(32) NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_worker_receivable_adjustment_refund (city_code, refund_id),
  UNIQUE KEY uk_worker_receivable_adjustment_event (source_event_id),
  CONSTRAINT fk_worker_receivable_adjustments_city
    FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_worker_receivable_adjustments_refund
    FOREIGN KEY (refund_id) REFERENCES aftersale_refund_requests(refund_id),
  CONSTRAINT fk_worker_receivable_adjustments_accrual
    FOREIGN KEY (accrual_id) REFERENCES ledger_accruals(accrual_id),
  CONSTRAINT fk_worker_receivable_adjustments_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles(worker_id),
  CONSTRAINT fk_worker_receivable_adjustments_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT chk_worker_receivable_adjustments_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_receivable_adjustments_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_worker_receivable_adjustments_amounts CHECK (
    gross_adjustment <= 0 AND platform_fee_adjustment <= 0 AND worker_receivable_adjustment <= 0
  ),
  CONSTRAINT chk_worker_receivable_adjustments_status CHECK (status = 'applied'),
  INDEX idx_worker_receivable_adjustments_worker (city_code, worker_id),
  INDEX idx_worker_receivable_adjustments_order (city_code, order_id),
  INDEX idx_worker_receivable_adjustments_fulfillment (city_code, fulfillment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_bank_accounts (
  bank_account_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  account_holder VARCHAR(128) NOT NULL,
  bank_name VARCHAR(128) NOT NULL,
  bank_branch VARCHAR(128) NULL,
  bank_card_masked VARCHAR(64) NOT NULL,
  bank_card_last4 VARCHAR(4) NOT NULL,
  bank_card_hash VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_worker_bank_account_hash (city_code, worker_id, bank_card_hash),
  CONSTRAINT fk_worker_bank_accounts_city
    FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_worker_bank_accounts_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles(worker_id),
  CONSTRAINT chk_worker_bank_accounts_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_bank_accounts_status CHECK (status IN ('active', 'inactive')),
  INDEX idx_worker_bank_accounts_worker (city_code, worker_id),
  INDEX idx_worker_bank_accounts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_withdrawal_requests (
  withdrawal_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  bank_account_id VARCHAR(64) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  request_note VARCHAR(255) NULL,
  review_note VARCHAR(255) NULL,
  marked_paid_note VARCHAR(255) NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewed_by_admin_id VARCHAR(64) NULL,
  marked_paid_at TIMESTAMP NULL,
  marked_paid_by_admin_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_worker_withdrawal_requests_city
    FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_worker_withdrawal_requests_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles(worker_id),
  CONSTRAINT fk_worker_withdrawal_requests_bank
    FOREIGN KEY (bank_account_id) REFERENCES worker_bank_accounts(bank_account_id),
  CONSTRAINT fk_worker_withdrawal_requests_review_admin
    FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users(id),
  CONSTRAINT fk_worker_withdrawal_requests_mark_admin
    FOREIGN KEY (marked_paid_by_admin_id) REFERENCES admin_users(id),
  CONSTRAINT chk_worker_withdrawal_requests_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_withdrawal_requests_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_worker_withdrawal_requests_amount CHECK (amount > 0),
  CONSTRAINT chk_worker_withdrawal_requests_status
    CHECK (status IN ('requested', 'approved', 'rejected', 'marked_paid', 'cancelled')),
  CONSTRAINT chk_worker_withdrawal_requests_review_audit CHECK (
    (status IN ('approved', 'rejected', 'marked_paid') AND reviewed_at IS NOT NULL AND reviewed_by_admin_id IS NOT NULL)
    OR (status IN ('requested', 'cancelled') AND reviewed_at IS NULL AND reviewed_by_admin_id IS NULL)
  ),
  CONSTRAINT chk_worker_withdrawal_requests_mark_audit CHECK (
    (status = 'marked_paid' AND marked_paid_at IS NOT NULL AND marked_paid_by_admin_id IS NOT NULL)
    OR (status <> 'marked_paid' AND marked_paid_at IS NULL AND marked_paid_by_admin_id IS NULL)
  ),
  INDEX idx_worker_withdrawal_requests_worker (city_code, worker_id),
  INDEX idx_worker_withdrawal_requests_status (city_code, status),
  INDEX idx_worker_withdrawal_requests_requested (city_code, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO worker_receivable_adjustments (
  adjustment_id, city_code, refund_id, source_event_id, accrual_id,
  fulfillment_id, order_id, payment_order_id, worker_id, customer_id,
  gross_adjustment, platform_fee_adjustment, worker_receivable_adjustment,
  currency, reason, status, applied_at
)
SELECT CONCAT('wra_', SUBSTRING(SHA2(CONCAT(r.refund_id, ':', la.accrual_id), 256), 1, 24)),
       r.city_code,
       r.refund_id,
       COALESCE(r.approval_event_id, CONCAT('legacy_', r.refund_id)),
       la.accrual_id,
       la.fulfillment_id,
       la.order_id,
       la.payment_order_id,
       la.worker_id,
       la.customer_id,
       -la.gross_amount,
       -la.platform_fee,
       -la.worker_receivable,
       'CNY',
       'refund.approved',
       'applied',
       COALESCE(r.approved_at, CURRENT_TIMESTAMP)
  FROM aftersale_refund_requests r
  JOIN ledger_accruals la
    ON la.city_code = r.city_code
   AND la.fulfillment_id = r.fulfillment_id
 WHERE r.status = 'approved'
ON DUPLICATE KEY UPDATE adjustment_id = adjustment_id;

UPDATE ledger_accruals la
  JOIN worker_receivable_adjustments adj
    ON adj.city_code = la.city_code
   AND adj.accrual_id = la.accrual_id
   SET la.status = 'voided'
 WHERE la.status = 'accrued';

INSERT INTO worker_receivable_balances (
  city_code, worker_id, currency, accrued_amount, adjusted_amount,
  requested_withdrawal_amount, marked_paid_amount, available_amount
)
SELECT workers.city_code,
       workers.worker_id,
       'CNY',
       COALESCE(accrued.accrued_amount, 0.00),
       COALESCE(adjusted.adjusted_amount, 0.00),
       COALESCE(active_requests.requested_amount, 0.00),
       COALESCE(marked.marked_paid_amount, 0.00),
       COALESCE(accrued.accrued_amount, 0.00)
       + COALESCE(adjusted.adjusted_amount, 0.00)
       - COALESCE(active_requests.requested_amount, 0.00)
       - COALESCE(marked.marked_paid_amount, 0.00)
  FROM (
    SELECT city_code, worker_id FROM ledger_accruals
    UNION SELECT city_code, worker_id FROM worker_receivable_adjustments
    UNION SELECT city_code, worker_id FROM worker_withdrawal_requests
  ) workers
  LEFT JOIN (
    SELECT city_code, worker_id, SUM(worker_receivable) AS accrued_amount
      FROM ledger_accruals
     GROUP BY city_code, worker_id
  ) accrued ON accrued.city_code = workers.city_code AND accrued.worker_id = workers.worker_id
  LEFT JOIN (
    SELECT city_code, worker_id, SUM(worker_receivable_adjustment) AS adjusted_amount
      FROM worker_receivable_adjustments
     GROUP BY city_code, worker_id
  ) adjusted ON adjusted.city_code = workers.city_code AND adjusted.worker_id = workers.worker_id
  LEFT JOIN (
    SELECT city_code, worker_id, SUM(amount) AS requested_amount
      FROM worker_withdrawal_requests
     WHERE status IN ('requested', 'approved')
     GROUP BY city_code, worker_id
  ) active_requests ON active_requests.city_code = workers.city_code AND active_requests.worker_id = workers.worker_id
  LEFT JOIN (
    SELECT city_code, worker_id, SUM(amount) AS marked_paid_amount
      FROM worker_withdrawal_requests
     WHERE status = 'marked_paid'
     GROUP BY city_code, worker_id
  ) marked ON marked.city_code = workers.city_code AND marked.worker_id = workers.worker_id
ON DUPLICATE KEY UPDATE
  accrued_amount = VALUES(accrued_amount),
  adjusted_amount = VALUES(adjusted_amount),
  requested_withdrawal_amount = VALUES(requested_withdrawal_amount),
  marked_paid_amount = VALUES(marked_paid_amount),
  available_amount = VALUES(available_amount);

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
     AND CONSTRAINT_NAME = 'fk_orders_customer'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'dispatch_tasks'
     AND CONSTRAINT_NAME = 'fk_dispatch_tasks_customer'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE dispatch_tasks ADD CONSTRAINT fk_dispatch_tasks_customer FOREIGN KEY (customer_id) REFERENCES customers(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_accruals'
     AND CONSTRAINT_NAME = 'fk_ledger_accruals_customer'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE ledger_accruals ADD CONSTRAINT fk_ledger_accruals_customer FOREIGN KEY (customer_id) REFERENCES customers(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'settlement_items'
     AND CONSTRAINT_NAME = 'fk_settlement_items_customer'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE settlement_items ADD CONSTRAINT fk_settlement_items_customer FOREIGN KEY (customer_id) REFERENCES customers(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'aftersale_refund_requests'
     AND CONSTRAINT_NAME = 'fk_refund_requests_customer'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE aftersale_refund_requests ADD CONSTRAINT fk_refund_requests_customer FOREIGN KEY (customer_id) REFERENCES customers(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_reviews'
     AND CONSTRAINT_NAME = 'fk_order_reviews_customer'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE order_reviews ADD CONSTRAINT fk_order_reviews_customer FOREIGN KEY (customer_id) REFERENCES customers(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_city_scopes'
     AND CONSTRAINT_NAME = 'fk_admin_city_scopes_user'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE admin_city_scopes ADD CONSTRAINT fk_admin_city_scopes_user FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'worker_certifications'
     AND CONSTRAINT_NAME = 'fk_worker_certifications_reviewer'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE worker_certifications ADD CONSTRAINT fk_worker_certifications_reviewer FOREIGN KEY (reviewer_id) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'aftersale_refund_requests'
     AND CONSTRAINT_NAME = 'fk_refund_requests_approved_admin'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE aftersale_refund_requests ADD CONSTRAINT fk_refund_requests_approved_admin FOREIGN KEY (approved_by_admin_id) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'settlement_batches'
     AND CONSTRAINT_NAME = 'fk_settlement_batches_confirmed_admin'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE settlement_batches ADD CONSTRAINT fk_settlement_batches_confirmed_admin FOREIGN KEY (confirmed_by) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'settlement_payables'
     AND CONSTRAINT_NAME = 'fk_settlement_payables_marked_admin'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE settlement_payables ADD CONSTRAINT fk_settlement_payables_marked_admin FOREIGN KEY (marked_by) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'settlement_payable_queue'
     AND CONSTRAINT_NAME = 'fk_settlement_payable_queue_enqueued_admin'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE settlement_payable_queue ADD CONSTRAINT fk_settlement_payable_queue_enqueued_admin FOREIGN KEY (enqueued_by) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'worker_receivable_statements'
     AND CONSTRAINT_NAME = 'fk_worker_receivable_statements_generated_admin'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE worker_receivable_statements ADD CONSTRAINT fk_worker_receivable_statements_generated_admin FOREIGN KEY (generated_by) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'worker_receivable_statement_reviews'
     AND CONSTRAINT_NAME = 'fk_worker_receivable_statement_reviews_admin'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE worker_receivable_statement_reviews ADD CONSTRAINT fk_worker_receivable_statement_reviews_admin FOREIGN KEY (reviewed_by) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'worker_receivable_statement_exports'
     AND CONSTRAINT_NAME = 'fk_worker_receivable_statement_exports_admin'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE worker_receivable_statement_exports ADD CONSTRAINT fk_worker_receivable_statement_exports_admin FOREIGN KEY (exported_by) REFERENCES admin_users(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO schema_migrations(version) VALUES ('032_customer_admin_fks_worker_finance')
ON DUPLICATE KEY UPDATE version = version;
