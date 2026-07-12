-- Phase 24E: city-scoped knowledge base, immutable revisions, local Bot audit runs.
-- Append-only. Migration 024 remains a permanent gap. No external NLU provider is introduced.
-- Depends on 051_phase24d_support_realtime_conversations.

CREATE TABLE IF NOT EXISTS support_kb_articles (
  article_id VARCHAR(64) NOT NULL, city_code VARCHAR(64) NOT NULL,
  slug VARCHAR(128) NOT NULL, category_id VARCHAR(64) NULL, sku_id VARCHAR(64) NULL,
  language VARCHAR(32) NOT NULL, lifecycle_status VARCHAR(16) NOT NULL DEFAULT 'draft',
  current_draft_version_id VARCHAR(64) NULL, published_version_id VARCHAR(64) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  create_idempotency_key VARCHAR(128) NOT NULL, create_request_fingerprint CHAR(64) NOT NULL,
  mutation_idempotency_key VARCHAR(128) NULL, mutation_request_fingerprint CHAR(64) NULL,
  created_by_admin_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (article_id), UNIQUE KEY uq_support_kb_article_city_id (city_code,article_id),
  UNIQUE KEY uq_support_kb_article_slug_language (city_code,slug,language),
  UNIQUE KEY uq_support_kb_article_create (city_code,created_by_admin_id,create_idempotency_key),
  INDEX idx_support_kb_article_list (city_code,lifecycle_status,language,updated_at,article_id),
  CONSTRAINT fk_support_kb_article_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_support_kb_article_category FOREIGN KEY (category_id,city_code)
    REFERENCES service_categories(category_id,city_code),
  CONSTRAINT fk_support_kb_article_sku FOREIGN KEY (sku_id,city_code)
    REFERENCES service_skus(sku_id,city_code),
  CONSTRAINT fk_support_kb_article_creator FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id),
  CONSTRAINT chk_support_kb_article_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_kb_article_slug CHECK (slug REGEXP '^[a-z0-9][a-z0-9_-]{1,127}$'),
  CONSTRAINT chk_support_kb_article_language CHECK (language REGEXP '^[a-z]{2,8}(-[a-z0-9]{2,8}){0,3}$'),
  CONSTRAINT chk_support_kb_article_status CHECK (lifecycle_status IN ('draft','published','archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_kb_article_versions (
  article_version_id VARCHAR(64) NOT NULL, city_code VARCHAR(64) NOT NULL,
  article_id VARCHAR(64) NOT NULL, revision INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL, summary VARCHAR(500) NULL, body_markdown MEDIUMTEXT NOT NULL,
  keywords_json JSON NOT NULL, intent_tags_json JSON NOT NULL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by_admin_id VARCHAR(64) NOT NULL, submitted_by_admin_id VARCHAR(64) NULL,
  reviewed_by_admin_id VARCHAR(64) NULL, review_note VARCHAR(1000) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at TIMESTAMP(3) NULL, reviewed_at TIMESTAMP(3) NULL,
  content_sha256 CHAR(64) NOT NULL,
  PRIMARY KEY (article_version_id),
  UNIQUE KEY uq_support_kb_version_city_id (city_code,article_version_id),
  UNIQUE KEY uq_support_kb_version_revision (city_code,article_id,revision),
  INDEX idx_support_kb_version_article (city_code,article_id,created_at,article_version_id),
  CONSTRAINT fk_support_kb_version_article FOREIGN KEY (city_code,article_id)
    REFERENCES support_kb_articles(city_code,article_id),
  CONSTRAINT fk_support_kb_version_creator FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id),
  CONSTRAINT fk_support_kb_version_submitter FOREIGN KEY (submitted_by_admin_id) REFERENCES admin_users(id),
  CONSTRAINT fk_support_kb_version_reviewer FOREIGN KEY (reviewed_by_admin_id) REFERENCES admin_users(id),
  CONSTRAINT chk_support_kb_version_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_kb_version_revision CHECK (revision > 0),
  CONSTRAINT chk_support_kb_version_content CHECK (
    CHAR_LENGTH(title) BETWEEN 1 AND 200 AND CHAR_LENGTH(body_markdown) BETWEEN 1 AND 50000),
  CONSTRAINT chk_support_kb_version_review CHECK (review_status IN ('draft','pending_review','approved','rejected')),
  CONSTRAINT chk_support_kb_version_keywords_json CHECK (JSON_TYPE(keywords_json)='ARRAY'),
  CONSTRAINT chk_support_kb_version_intents_json CHECK (JSON_TYPE(intent_tags_json)='ARRAY')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='support_kb_articles'
    AND constraint_name='fk_support_kb_article_draft_version')=0,
  'ALTER TABLE support_kb_articles ADD CONSTRAINT fk_support_kb_article_draft_version FOREIGN KEY (city_code,current_draft_version_id) REFERENCES support_kb_article_versions(city_code,article_version_id)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='support_kb_articles'
    AND constraint_name='fk_support_kb_article_published_version')=0,
  'ALTER TABLE support_kb_articles ADD CONSTRAINT fk_support_kb_article_published_version FOREIGN KEY (city_code,published_version_id) REFERENCES support_kb_article_versions(city_code,article_version_id)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS support_kb_review_events (
  review_event_id VARCHAR(64) NOT NULL, city_code VARCHAR(64) NOT NULL,
  article_id VARCHAR(64) NOT NULL, article_version_id VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL, actor_admin_id VARCHAR(64) NOT NULL,
  note VARCHAR(1000) NULL, idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (review_event_id), UNIQUE KEY uq_support_kb_review_city_id (city_code,review_event_id),
  UNIQUE KEY uq_support_kb_review_idempotency (city_code,article_version_id,idempotency_key),
  INDEX idx_support_kb_review_version (city_code,article_version_id,created_at,review_event_id),
  CONSTRAINT fk_support_kb_review_article FOREIGN KEY (city_code,article_id)
    REFERENCES support_kb_articles(city_code,article_id),
  CONSTRAINT fk_support_kb_review_version FOREIGN KEY (city_code,article_version_id)
    REFERENCES support_kb_article_versions(city_code,article_version_id),
  CONSTRAINT fk_support_kb_review_actor FOREIGN KEY (actor_admin_id) REFERENCES admin_users(id),
  CONSTRAINT chk_support_kb_review_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_kb_review_action CHECK (action IN ('submitted','approved','rejected','published','archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='support_messages'
    AND index_name='uq_support_message_city_conversation_id')=0,
  'ALTER TABLE support_messages ADD UNIQUE KEY uq_support_message_city_conversation_id (city_code,conversation_id,message_id)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS support_bot_runs (
  bot_run_id VARCHAR(64) NOT NULL, city_code VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(64) NOT NULL, trigger_message_id VARCHAR(64) NOT NULL,
  provider VARCHAR(16) NOT NULL, provider_status VARCHAR(32) NOT NULL,
  external_provider_executed TINYINT(1) NOT NULL DEFAULT 0,
  provider_rule_version VARCHAR(64) NOT NULL, intent VARCHAR(128) NULL,
  confidence_basis_points INT UNSIGNED NOT NULL,
  sensitive_classification VARCHAR(32) NULL,
  decision VARCHAR(16) NOT NULL, reason_codes_json JSON NOT NULL,
  matched_article_version_ids_json JSON NOT NULL,
  response_message_id VARCHAR(64) NULL, idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (bot_run_id), UNIQUE KEY uq_support_bot_run_city_id (city_code,bot_run_id),
  UNIQUE KEY uq_support_bot_run_trigger (city_code,conversation_id,trigger_message_id),
  UNIQUE KEY uq_support_bot_run_idempotency (city_code,conversation_id,idempotency_key),
  INDEX idx_support_bot_run_audit (city_code,decision,created_at,bot_run_id),
  CONSTRAINT fk_support_bot_run_conversation FOREIGN KEY (city_code,conversation_id)
    REFERENCES support_conversations(city_code,conversation_id),
  CONSTRAINT fk_support_bot_run_trigger FOREIGN KEY (city_code,conversation_id,trigger_message_id)
    REFERENCES support_messages(city_code,conversation_id,message_id),
  CONSTRAINT fk_support_bot_run_response FOREIGN KEY (city_code,conversation_id,response_message_id)
    REFERENCES support_messages(city_code,conversation_id,message_id),
  CONSTRAINT chk_support_bot_run_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_bot_run_provider CHECK (provider IN ('deterministic','mock')),
  CONSTRAINT chk_support_bot_run_provider_status CHECK (provider_status IN ('matched_local','no_match_local','forced_mock')),
  CONSTRAINT chk_support_bot_run_external CHECK (external_provider_executed=0),
  CONSTRAINT chk_support_bot_run_confidence CHECK (confidence_basis_points <= 10000),
  CONSTRAINT chk_support_bot_run_decision CHECK (decision IN ('reply','hand_off','no_match')),
  CONSTRAINT chk_support_bot_run_reasons CHECK (JSON_TYPE(reason_codes_json)='ARRAY'),
  CONSTRAINT chk_support_bot_run_matches CHECK (JSON_TYPE(matched_article_version_ids_json)='ARRAY')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('052_phase24e_support_bot_knowledge_base')
ON DUPLICATE KEY UPDATE version=version;
