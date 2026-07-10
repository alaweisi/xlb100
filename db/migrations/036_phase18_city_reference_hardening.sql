-- Phase 18 hardening: enforce city and parent-subject consistency at the database boundary.

ALTER TABLE orders
  ADD UNIQUE KEY uq_orders_city_order (city_code, order_id);

ALTER TABLE fulfillments
  ADD UNIQUE KEY uq_fulfillments_city_order_fulfillment (city_code, order_id, fulfillment_id);

ALTER TABLE aftersale_complaints
  ADD UNIQUE KEY uq_complaints_city_order_complaint (city_code, order_id, complaint_id);

ALTER TABLE media_assets
  ADD UNIQUE KEY uq_media_city_order_fulfillment_asset (city_code, order_id, fulfillment_id, media_asset_id),
  ADD CONSTRAINT fk_media_city_order_fulfillment
    FOREIGN KEY (city_code, order_id, fulfillment_id)
    REFERENCES fulfillments (city_code, order_id, fulfillment_id),
  ADD CONSTRAINT fk_media_city_order_complaint
    FOREIGN KEY (city_code, order_id, complaint_id)
    REFERENCES aftersale_complaints (city_code, order_id, complaint_id);

ALTER TABLE fulfillment_evidence
  ADD CONSTRAINT fk_evidence_city_order_fulfillment
    FOREIGN KEY (city_code, order_id, fulfillment_id)
    REFERENCES fulfillments (city_code, order_id, fulfillment_id),
  ADD CONSTRAINT fk_evidence_city_order_media
    FOREIGN KEY (city_code, order_id, fulfillment_id, media_asset_id)
    REFERENCES media_assets (city_code, order_id, fulfillment_id, media_asset_id),
  ADD CONSTRAINT fk_evidence_city_order_complaint
    FOREIGN KEY (city_code, order_id, complaint_id)
    REFERENCES aftersale_complaints (city_code, order_id, complaint_id);

ALTER TABLE fulfillment_customer_confirmations
  ADD CONSTRAINT fk_confirmation_city_order_fulfillment
    FOREIGN KEY (city_code, order_id, fulfillment_id)
    REFERENCES fulfillments (city_code, order_id, fulfillment_id),
  ADD CONSTRAINT fk_confirmation_city_order_complaint
    FOREIGN KEY (city_code, order_id, complaint_id)
    REFERENCES aftersale_complaints (city_code, order_id, complaint_id);

INSERT INTO schema_migrations(version) VALUES ('036_phase18_city_reference_hardening')
ON DUPLICATE KEY UPDATE version=version;
