-- Phase 20: LBS-lite dispatch with local/mock geo and tenant-safe location references.

ALTER TABLE dispatch_tasks
  ADD UNIQUE KEY uq_dispatch_task_city_id (city_code, dispatch_task_id),
  ADD COLUMN target_latitude DECIMAL(9,6) NULL AFTER last_reason,
  ADD COLUMN target_longitude DECIMAL(9,6) NULL AFTER target_latitude,
  ADD COLUMN geo_provider_envelope_json JSON NULL AFTER target_longitude;

CREATE TABLE worker_dispatch_preferences (
  worker_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  service_radius_km DECIMAL(6,2) NOT NULL DEFAULT 10.00,
  location_sharing_enabled TINYINT(1) NOT NULL DEFAULT 0,
  rating_score DECIMAL(4,2) NOT NULL DEFAULT 5.00,
  penalty_score DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id, city_code),
  CONSTRAINT fk_worker_dispatch_preferences_binding FOREIGN KEY (worker_id, city_code)
    REFERENCES worker_city_bindings(worker_id, city_code),
  CONSTRAINT chk_worker_dispatch_radius CHECK (service_radius_km BETWEEN 1 AND 50),
  CONSTRAINT chk_worker_dispatch_rating CHECK (rating_score BETWEEN 0 AND 5),
  CONSTRAINT chk_worker_dispatch_penalty CHECK (penalty_score >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE worker_locations (
  location_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  accuracy_meters DECIMAL(8,2) NOT NULL,
  captured_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'worker_device',
  privacy_level VARCHAR(16) NOT NULL DEFAULT 'private_exact',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (location_id),
  UNIQUE KEY uq_worker_location_city_worker (city_code, worker_id),
  CONSTRAINT fk_worker_location_binding FOREIGN KEY (worker_id, city_code)
    REFERENCES worker_city_bindings(worker_id, city_code),
  CONSTRAINT chk_worker_location_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_location_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_worker_location_lng CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT chk_worker_location_accuracy CHECK (accuracy_meters BETWEEN 0 AND 5000),
  CONSTRAINT chk_worker_location_expiry CHECK (expires_at > captured_at),
  CONSTRAINT chk_worker_location_privacy CHECK (privacy_level = 'private_exact')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historical simulation tests removed city bindings after creating offers. Preserve those
-- audit rows by restoring disabled bindings; disabled rows never enter the candidate pool.
INSERT IGNORE INTO worker_city_bindings(worker_id, city_code, is_enabled)
SELECT DISTINCT o.worker_id, o.city_code, 0
FROM dispatch_offers o
JOIN worker_profiles p ON p.worker_id=o.worker_id
JOIN cities c ON c.city_code=o.city_code;

ALTER TABLE dispatch_offers
  ADD COLUMN eta_minutes INT NULL AFTER distance_km,
  ADD COLUMN rank_score DECIMAL(12,4) NULL AFTER eta_minutes,
  ADD COLUMN expires_at TIMESTAMP NULL AFTER rank_score,
  ADD COLUMN geo_provider_envelope_json JSON NULL AFTER expires_at,
  DROP FOREIGN KEY fk_dispatch_offers_task,
  ADD CONSTRAINT fk_dispatch_offer_task_city FOREIGN KEY (city_code, dispatch_task_id)
    REFERENCES dispatch_tasks(city_code, dispatch_task_id),
  ADD CONSTRAINT fk_dispatch_offer_worker_city FOREIGN KEY (worker_id, city_code)
    REFERENCES worker_city_bindings(worker_id, city_code);

ALTER TABLE dispatch_events
  DROP FOREIGN KEY fk_dispatch_events_task,
  ADD CONSTRAINT fk_dispatch_event_task_city FOREIGN KEY (city_code, dispatch_task_id)
    REFERENCES dispatch_tasks(city_code, dispatch_task_id);

INSERT INTO worker_dispatch_preferences(worker_id, city_code, location_sharing_enabled)
SELECT worker_id, city_code, 0 FROM worker_city_bindings
ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id);

INSERT INTO schema_migrations(version) VALUES ('039_phase20_lbs_lite_dispatch');
