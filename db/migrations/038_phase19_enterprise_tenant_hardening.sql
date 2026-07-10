-- Phase 19 audit hardening: bind optional agreements and webhook deliveries to the same enterprise tenant.

ALTER TABLE business_agreement_prices
  ADD UNIQUE KEY uq_business_agreement_city_client_id
    (city_code, business_client_id, agreement_price_id);

ALTER TABLE business_orders
  DROP FOREIGN KEY fk_business_order_agreement,
  ADD CONSTRAINT fk_business_order_agreement_client
    FOREIGN KEY (city_code, business_client_id, agreement_price_id)
    REFERENCES business_agreement_prices(city_code, business_client_id, agreement_price_id);

ALTER TABLE business_webhook_subscriptions
  ADD UNIQUE KEY uq_business_webhook_city_client_subscription
    (city_code, business_client_id, subscription_id);

ALTER TABLE business_webhook_deliveries
  DROP FOREIGN KEY fk_business_delivery_subscription,
  ADD CONSTRAINT fk_business_delivery_subscription_client
    FOREIGN KEY (city_code, business_client_id, subscription_id)
    REFERENCES business_webhook_subscriptions(city_code, business_client_id, subscription_id);

INSERT INTO schema_migrations(version)
VALUES ('038_phase19_enterprise_tenant_hardening');
