-- Phase 24D: city-scoped durable support conversations. Redis is fanout only.
CREATE TABLE IF NOT EXISTS support_conversations (
  conversation_id VARCHAR(64) NOT NULL, city_code VARCHAR(64) NOT NULL,
  source VARCHAR(16) NOT NULL, requester_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queueing', assigned_agent_id VARCHAR(64) NULL,
  linked_ticket_id VARCHAR(64) NULL, create_idempotency_key VARCHAR(128) NOT NULL,
  last_server_seq BIGINT UNSIGNED NOT NULL DEFAULT 0, version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), accepted_at TIMESTAMP(3) NULL,
  closed_at TIMESTAMP(3) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (conversation_id), UNIQUE KEY uq_support_conversation_city_id (city_code,conversation_id),
  UNIQUE KEY uq_support_conversation_create (city_code,source,requester_id,create_idempotency_key),
  INDEX idx_support_conversation_requester (city_code,source,requester_id,status,updated_at,conversation_id),
  INDEX idx_support_conversation_agent (city_code,assigned_agent_id,status,updated_at,conversation_id),
  CONSTRAINT fk_support_conversation_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_support_conversation_agent FOREIGN KEY (assigned_agent_id) REFERENCES admin_users(id),
  CONSTRAINT fk_support_conversation_ticket FOREIGN KEY (city_code,linked_ticket_id) REFERENCES support_tickets(city_code,ticket_id),
  CONSTRAINT chk_support_conversation_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_conversation_source CHECK (source IN ('customer','worker')),
  CONSTRAINT chk_support_conversation_status CHECK (status IN ('queueing','active','transferred','closed')),
  CONSTRAINT chk_support_conversation_times CHECK ((status='closed' AND closed_at IS NOT NULL) OR (status<>'closed' AND closed_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_conversation_participants (
  city_code VARCHAR(64) NOT NULL, conversation_id VARCHAR(64) NOT NULL,
  participant_type VARCHAR(16) NOT NULL, participant_id VARCHAR(64) NOT NULL,
  joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), left_at TIMESTAMP(3) NULL,
  last_read_server_seq BIGINT UNSIGNED NOT NULL DEFAULT 0, version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (city_code,conversation_id,participant_type,participant_id),
  INDEX idx_support_participant_identity (city_code,participant_type,participant_id,left_at,conversation_id),
  CONSTRAINT fk_support_participant_conversation FOREIGN KEY (city_code,conversation_id)
    REFERENCES support_conversations(city_code,conversation_id),
  CONSTRAINT chk_support_participant_type CHECK (participant_type IN ('customer','worker','agent'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_messages (
  message_id VARCHAR(64) NOT NULL, city_code VARCHAR(64) NOT NULL, conversation_id VARCHAR(64) NOT NULL,
  sender_type VARCHAR(16) NOT NULL, sender_id VARCHAR(64) NULL, client_message_id VARCHAR(128) NOT NULL,
  server_seq BIGINT UNSIGNED NOT NULL, message_type VARCHAR(16) NOT NULL,
  text_content TEXT NULL, media_asset_id VARCHAR(64) NULL, metadata_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (message_id),
  UNIQUE KEY uq_support_message_client (city_code,conversation_id,client_message_id),
  UNIQUE KEY uq_support_message_seq (city_code,conversation_id,server_seq),
  CONSTRAINT fk_support_message_conversation FOREIGN KEY (city_code,conversation_id)
    REFERENCES support_conversations(city_code,conversation_id),
  CONSTRAINT chk_support_message_sender CHECK (sender_type IN ('customer','worker','agent','system')),
  CONSTRAINT chk_support_message_type CHECK (message_type IN ('text','image','system')),
  CONSTRAINT chk_support_message_content CHECK (
    (message_type='text' AND text_content IS NOT NULL AND CHAR_LENGTH(text_content) BETWEEN 1 AND 4000 AND media_asset_id IS NULL)
    OR (message_type='image' AND text_content IS NULL AND media_asset_id IS NOT NULL)
    OR (message_type='system' AND media_asset_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('051_phase24d_support_realtime_conversations')
ON DUPLICATE KEY UPDATE version=version;
