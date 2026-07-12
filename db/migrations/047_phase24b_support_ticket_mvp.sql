-- Phase 24B: independent, city-scoped customer support ticket MVP.
-- Support links to locked domains but never mutates their records.

CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  source VARCHAR(32) NOT NULL,
  requester_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NULL,
  type VARCHAR(32) NOT NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'normal',
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  subject VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  related_order_id VARCHAR(64) NULL,
  related_worker_id VARCHAR(64) NULL,
  linked_aftersale_complaint_id VARCHAR(64) NULL,
  assigned_agent_id VARCHAR(64) NULL,
  assigned_skill_group_id VARCHAR(64) NULL,
  sla_first_response_due_at TIMESTAMP(3) NULL,
  sla_resolution_due_at TIMESTAMP(3) NULL,
  first_responded_at TIMESTAMP(3) NULL,
  resolved_at TIMESTAMP(3) NULL,
  closed_at TIMESTAMP(3) NULL,
  resolution_code VARCHAR(64) NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (ticket_id),
  CONSTRAINT fk_support_ticket_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_support_ticket_order FOREIGN KEY (city_code, related_order_id)
    REFERENCES orders(city_code, order_id),
  CONSTRAINT fk_support_ticket_complaint FOREIGN KEY
    (city_code, related_order_id, linked_aftersale_complaint_id)
    REFERENCES aftersale_complaints(city_code, order_id, complaint_id),
  CONSTRAINT fk_support_ticket_worker_binding FOREIGN KEY (related_worker_id, city_code)
    REFERENCES worker_city_bindings(worker_id, city_code),
  CONSTRAINT fk_support_ticket_business_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT chk_support_ticket_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_ticket_source CHECK (source IN ('customer','worker','enterprise','admin','system')),
  CONSTRAINT chk_support_ticket_type CHECK (type IN (
    'order_question','order_dispute','service_complaint','withdrawal_issue','account_issue','safety','other'
  )),
  CONSTRAINT chk_support_ticket_priority CHECK (priority IN ('low','normal','high','urgent','critical')),
  CONSTRAINT chk_support_ticket_status CHECK (status IN (
    'open','processing','waiting_requester','escalated','resolved','closed'
  )),
  CONSTRAINT chk_support_ticket_enterprise CHECK (
    (source = 'enterprise' AND business_client_id IS NOT NULL)
    OR (source <> 'enterprise' AND business_client_id IS NULL)
  ),
  CONSTRAINT chk_support_ticket_complaint_order CHECK (
    linked_aftersale_complaint_id IS NULL OR related_order_id IS NOT NULL
  ),
  CONSTRAINT chk_support_ticket_resolution CHECK (
    (status IN ('resolved','closed') AND resolution_code IS NOT NULL AND resolved_at IS NOT NULL)
    OR (status NOT IN ('resolved','closed') AND resolution_code IS NULL AND resolved_at IS NULL)
  ),
  CONSTRAINT chk_support_ticket_closed_at CHECK (
    (status = 'closed' AND closed_at IS NOT NULL)
    OR (status <> 'closed' AND closed_at IS NULL)
  ),
  UNIQUE KEY uq_support_ticket_city_ticket (city_code, ticket_id),
  UNIQUE KEY uq_support_ticket_create_idempotency (city_code, source, requester_id, idempotency_key),
  UNIQUE KEY uq_support_ticket_enterprise_idempotency
    (city_code, source, business_client_id, requester_id, idempotency_key),
  INDEX idx_support_ticket_queue (city_code, status, priority, created_at, ticket_id),
  INDEX idx_support_ticket_agent (city_code, assigned_agent_id, status, updated_at, ticket_id),
  INDEX idx_support_ticket_skill_group (city_code, assigned_skill_group_id, status, priority, created_at, ticket_id),
  INDEX idx_support_ticket_order (city_code, related_order_id, created_at, ticket_id),
  INDEX idx_support_ticket_complaint (city_code, linked_aftersale_complaint_id),
  INDEX idx_support_ticket_requester (city_code, source, requester_id, created_at, ticket_id),
  INDEX idx_support_ticket_sla (city_code, status, sla_resolution_due_at, ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_events (
  ticket_event_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  ticket_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR(64) NULL,
  visibility VARCHAR(32) NOT NULL,
  content TEXT NULL,
  payload_json JSON NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (ticket_event_id),
  CONSTRAINT fk_support_ticket_event_ticket FOREIGN KEY (city_code, ticket_id)
    REFERENCES support_tickets(city_code, ticket_id),
  CONSTRAINT chk_support_ticket_event_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_ticket_event_type CHECK (event_type IN (
    'created','commented','assigned','status_changed','escalated','resolved','reopened','closed'
  )),
  CONSTRAINT chk_support_ticket_event_actor CHECK (actor_type IN (
    'customer','worker','admin','operator','system','bot'
  )),
  CONSTRAINT chk_support_ticket_event_visibility CHECK (visibility IN ('requester','internal','all')),
  CONSTRAINT chk_support_ticket_event_actor_id CHECK (
    (actor_type IN ('system','bot') AND actor_id IS NULL)
    OR (actor_type NOT IN ('system','bot') AND actor_id IS NOT NULL)
  ),
  UNIQUE KEY uq_support_ticket_event_city_event (city_code, ticket_event_id),
  UNIQUE KEY uq_support_ticket_event_idempotency (city_code, ticket_id, idempotency_key),
  INDEX idx_support_ticket_event_timeline (city_code, ticket_id, created_at, ticket_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('047_phase24b_support_ticket_mvp')
ON DUPLICATE KEY UPDATE version=version;
