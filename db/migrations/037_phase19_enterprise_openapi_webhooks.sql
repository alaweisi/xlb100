-- Phase 19: city/client-scoped enterprise platform, API credentials, webhooks, and bill snapshots.

ALTER TABLE event_outbox
  ADD UNIQUE KEY uq_event_outbox_city_event (city_code, event_id);

CREATE TABLE business_clients (
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  client_code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  billing_mode VARCHAR(32) NOT NULL,
  billing_customer_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (business_client_id),
  UNIQUE KEY uq_business_client_city_id (city_code, business_client_id),
  UNIQUE KEY uq_business_client_city_code (city_code, client_code),
  CONSTRAINT fk_business_client_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_business_client_customer FOREIGN KEY (billing_customer_id) REFERENCES customers(id),
  CONSTRAINT chk_business_client_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_business_client_status CHECK (status IN ('active','suspended','closed')),
  CONSTRAINT chk_business_client_billing CHECK (billing_mode IN ('single','monthly'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_client_contacts (
  contact_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(255) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id),
  UNIQUE KEY uq_business_contact_primary (city_code, business_client_id, is_primary),
  INDEX idx_business_contact_city_client (city_code, business_client_id),
  CONSTRAINT fk_business_contact_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT chk_business_contact_city CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_api_credentials (
  credential_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  secret_hash CHAR(64) NOT NULL,
  scopes_json JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP NULL,
  last_used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  PRIMARY KEY (credential_id),
  UNIQUE KEY uq_business_credential_prefix (key_prefix),
  INDEX idx_business_credential_city_client (city_code, business_client_id, status),
  CONSTRAINT fk_business_credential_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT chk_business_credential_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_business_credential_hash CHECK (secret_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_business_credential_status CHECK (status IN ('active','revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_agreement_prices (
  agreement_price_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  effective_from TIMESTAMP NOT NULL,
  effective_to TIMESTAMP NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agreement_price_id),
  UNIQUE KEY uq_business_agreement_city_client_sku (city_code, business_client_id, sku_id),
  CONSTRAINT fk_business_agreement_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT fk_business_agreement_sku FOREIGN KEY (sku_id, city_code)
    REFERENCES service_skus(sku_id, city_code),
  CONSTRAINT chk_business_agreement_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_business_agreement_price CHECK (unit_price > 0),
  CONSTRAINT chk_business_agreement_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_business_agreement_status CHECK (status IN ('active','disabled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_orders (
  business_order_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  external_order_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  agreement_price_id VARCHAR(64) NULL,
  pricing_source VARCHAR(16) NOT NULL,
  request_snapshot_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_order_id),
  UNIQUE KEY uq_business_order_city_id (city_code, business_order_id),
  UNIQUE KEY uq_business_order_external (city_code, business_client_id, external_order_id),
  UNIQUE KEY uq_business_order_idempotency (city_code, business_client_id, idempotency_key),
  UNIQUE KEY uq_business_order_order (city_code, order_id),
  CONSTRAINT fk_business_order_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT fk_business_order_order FOREIGN KEY (city_code, order_id)
    REFERENCES orders(city_code, order_id),
  CONSTRAINT fk_business_order_agreement FOREIGN KEY (agreement_price_id)
    REFERENCES business_agreement_prices(agreement_price_id),
  CONSTRAINT chk_business_order_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_business_order_hash CHECK (request_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_business_order_pricing CHECK (pricing_source IN ('public','agreement'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_webhook_subscriptions (
  subscription_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  callback_url VARCHAR(1024) NOT NULL,
  event_types_json JSON NOT NULL,
  signing_secret_ciphertext TEXT NOT NULL,
  signing_secret_last4 CHAR(4) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (subscription_id),
  UNIQUE KEY uq_business_webhook_city_subscription (city_code, subscription_id),
  INDEX idx_business_webhook_city_client (city_code, business_client_id, status),
  CONSTRAINT fk_business_webhook_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT chk_business_webhook_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_business_webhook_status CHECK (status IN ('active','paused'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_webhook_deliveries (
  delivery_id VARCHAR(64) NOT NULL,
  subscription_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  payload_json JSON NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  signature VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP NULL,
  provider_envelope_json JSON NULL,
  last_error VARCHAR(500) NULL,
  delivered_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (delivery_id),
  UNIQUE KEY uq_business_delivery_subscription_event (city_code, subscription_id, event_id),
  INDEX idx_business_delivery_retry (city_code, status, next_retry_at),
  CONSTRAINT fk_business_delivery_subscription FOREIGN KEY (city_code, subscription_id)
    REFERENCES business_webhook_subscriptions(city_code, subscription_id),
  CONSTRAINT fk_business_delivery_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT fk_business_delivery_event FOREIGN KEY (city_code, event_id)
    REFERENCES event_outbox(city_code, event_id),
  CONSTRAINT chk_business_delivery_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_business_delivery_hash CHECK (payload_sha256 REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_business_delivery_status CHECK (status IN ('pending','delivered','retry_wait','dead_letter')),
  CONSTRAINT chk_business_delivery_attempts CHECK (attempt_count BETWEEN 0 AND max_attempts AND max_attempts BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE enterprise_bill_snapshots (
  bill_id VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  order_count INT NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  snapshot_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_at TIMESTAMP NULL,
  PRIMARY KEY (bill_id),
  UNIQUE KEY uq_enterprise_bill_period (city_code, business_client_id, period_start, period_end),
  CONSTRAINT fk_enterprise_bill_client FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT chk_enterprise_bill_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_enterprise_bill_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_enterprise_bill_status CHECK (status IN ('draft','issued')),
  CONSTRAINT chk_enterprise_bill_totals CHECK (order_count >= 0 AND total_amount >= 0),
  CONSTRAINT chk_enterprise_bill_period CHECK (period_end > period_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('037_phase19_enterprise_openapi_webhooks');
