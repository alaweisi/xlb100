-- Phase 17: order reverse requests and aftersale complaint workflow.

CREATE TABLE IF NOT EXISTS order_reverse_requests (
  reverse_request_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  reverse_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  reason VARCHAR(500) NOT NULL,
  requested_scheduled_at DATETIME NULL,
  requested_time_slot VARCHAR(32) NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  review_note VARCHAR(1000) NULL,
  reviewed_by_admin_id VARCHAR(64) NULL,
  reviewed_at TIMESTAMP NULL,
  applied_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (reverse_request_id),
  CONSTRAINT fk_order_reverse_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_order_reverse_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT chk_order_reverse_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_order_reverse_type CHECK (reverse_type IN ('cancel','reschedule','reassign')),
  CONSTRAINT chk_order_reverse_status CHECK (status IN ('requested','approved','rejected','applied')),
  CONSTRAINT chk_order_reverse_schedule CHECK (
    (reverse_type = 'reschedule' AND requested_scheduled_at IS NOT NULL AND requested_time_slot IN ('morning','afternoon','evening'))
    OR (reverse_type <> 'reschedule' AND requested_scheduled_at IS NULL AND requested_time_slot IS NULL)
  ),
  UNIQUE KEY uq_order_reverse_idempotency (city_code, customer_id, idempotency_key),
  INDEX idx_order_reverse_city_order (city_code, order_id, created_at),
  INDEX idx_order_reverse_city_status (city_code, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aftersale_complaints (
  complaint_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'normal',
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  idempotency_key VARCHAR(128) NOT NULL,
  assigned_admin_id VARCHAR(64) NULL,
  resolution_type VARCHAR(32) NULL,
  resolution_note TEXT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  closed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (complaint_id),
  CONSTRAINT fk_aftersale_complaint_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_aftersale_complaint_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT chk_aftersale_complaint_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_aftersale_complaint_category CHECK (category IN (
    'service_quality','price_dispute','material','timeliness','attitude','safety','damage','other'
  )),
  CONSTRAINT chk_aftersale_complaint_priority CHECK (priority IN ('normal','urgent','critical')),
  CONSTRAINT chk_aftersale_complaint_status CHECK (status IN (
    'submitted','triaged','in_progress','waiting_customer','resolved','closed','rejected'
  )),
  CONSTRAINT chk_aftersale_complaint_resolution CHECK (resolution_type IS NULL OR resolution_type IN (
    'rework','reassign','refund_intent','compensation_intent','explanation','no_fault'
  )),
  UNIQUE KEY uq_aftersale_complaint_idempotency (city_code, customer_id, idempotency_key),
  INDEX idx_aftersale_complaint_city_order (city_code, order_id, submitted_at),
  INDEX idx_aftersale_complaint_city_status (city_code, status, priority, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aftersale_repair_orders (
  repair_order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  complaint_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NULL,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  service_note TEXT NULL,
  created_by_admin_id VARCHAR(64) NOT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (repair_order_id),
  CONSTRAINT fk_aftersale_repair_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_aftersale_repair_complaint FOREIGN KEY (complaint_id) REFERENCES aftersale_complaints(complaint_id),
  CONSTRAINT fk_aftersale_repair_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_aftersale_repair_worker FOREIGN KEY (worker_id) REFERENCES worker_profiles(worker_id),
  CONSTRAINT chk_aftersale_repair_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_aftersale_repair_status CHECK (status IN ('requested','assigned','in_progress','completed','cancelled')),
  INDEX idx_aftersale_repair_city_complaint (city_code, complaint_id, created_at),
  INDEX idx_aftersale_repair_city_worker (city_code, worker_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aftersale_liability_decisions (
  liability_decision_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  complaint_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  liable_party VARCHAR(32) NOT NULL,
  worker_liability_percent INT NOT NULL DEFAULT 0,
  platform_liability_percent INT NOT NULL DEFAULT 0,
  customer_liability_percent INT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  decided_by_admin_id VARCHAR(64) NOT NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (liability_decision_id),
  CONSTRAINT fk_aftersale_liability_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_aftersale_liability_complaint FOREIGN KEY (complaint_id) REFERENCES aftersale_complaints(complaint_id),
  CONSTRAINT fk_aftersale_liability_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT chk_aftersale_liability_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_aftersale_liability_party CHECK (liable_party IN ('platform','worker','customer','merchant','shared','no_fault')),
  CONSTRAINT chk_aftersale_liability_percent CHECK (
    worker_liability_percent BETWEEN 0 AND 100
    AND platform_liability_percent BETWEEN 0 AND 100
    AND customer_liability_percent BETWEEN 0 AND 100
    AND (
      (liable_party = 'no_fault' AND worker_liability_percent + platform_liability_percent + customer_liability_percent = 0)
      OR (liable_party <> 'no_fault' AND worker_liability_percent + platform_liability_percent + customer_liability_percent = 100)
    )
  ),
  UNIQUE KEY uq_aftersale_liability_complaint (city_code, complaint_id),
  INDEX idx_aftersale_liability_city_order (city_code, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aftersale_compensation_intents (
  compensation_intent_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  complaint_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  intent_type VARCHAR(32) NOT NULL,
  requested_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  approved_amount DECIMAL(12,2) NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'proposed',
  provider_execution_status VARCHAR(32) NOT NULL DEFAULT 'not_executed',
  proposed_by_admin_id VARCHAR(64) NOT NULL,
  decided_by_admin_id VARCHAR(64) NULL,
  decision_note TEXT NULL,
  proposed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  PRIMARY KEY (compensation_intent_id),
  CONSTRAINT fk_aftersale_compensation_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_aftersale_compensation_complaint FOREIGN KEY (complaint_id) REFERENCES aftersale_complaints(complaint_id),
  CONSTRAINT fk_aftersale_compensation_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT chk_aftersale_compensation_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_aftersale_compensation_type CHECK (intent_type IN ('refund','service_credit','cash','fee_waiver','rework')),
  CONSTRAINT chk_aftersale_compensation_status CHECK (status IN ('proposed','approved','rejected')),
  CONSTRAINT chk_aftersale_compensation_amount CHECK (
    requested_amount >= 0 AND (approved_amount IS NULL OR approved_amount >= 0)
  ),
  CONSTRAINT chk_aftersale_compensation_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_aftersale_compensation_not_executed CHECK (provider_execution_status = 'not_executed'),
  INDEX idx_aftersale_compensation_city_complaint (city_code, complaint_id, proposed_at),
  INDEX idx_aftersale_compensation_city_status (city_code, status, proposed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aftersale_timeline_events (
  timeline_event_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  complaint_id VARCHAR(64) NULL,
  reverse_request_id VARCHAR(64) NULL,
  repair_order_id VARCHAR(64) NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR(64) NULL,
  content TEXT NOT NULL,
  payload_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (timeline_event_id),
  CONSTRAINT fk_aftersale_timeline_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_aftersale_timeline_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_aftersale_timeline_complaint FOREIGN KEY (complaint_id) REFERENCES aftersale_complaints(complaint_id),
  CONSTRAINT fk_aftersale_timeline_reverse FOREIGN KEY (reverse_request_id) REFERENCES order_reverse_requests(reverse_request_id),
  CONSTRAINT fk_aftersale_timeline_repair FOREIGN KEY (repair_order_id) REFERENCES aftersale_repair_orders(repair_order_id),
  CONSTRAINT chk_aftersale_timeline_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_aftersale_timeline_actor CHECK (actor_type IN ('customer','worker','admin','system')),
  INDEX idx_aftersale_timeline_city_order (city_code, order_id, created_at),
  INDEX idx_aftersale_timeline_city_complaint (city_code, complaint_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('034_phase17_order_reverse_aftersale_complaints')
ON DUPLICATE KEY UPDATE version=version;
