CREATE TABLE business_order_tenant_ownership (
  city_code VARCHAR(64) NOT NULL,
  business_client_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (city_code, business_client_id, order_id),
  UNIQUE KEY uq_business_order_owner_order (city_code, order_id),
  CONSTRAINT fk_business_order_owner_client
    FOREIGN KEY (city_code, business_client_id)
    REFERENCES business_clients(city_code, business_client_id),
  CONSTRAINT fk_business_order_owner_order
    FOREIGN KEY (city_code, order_id)
    REFERENCES orders(city_code, order_id),
  CONSTRAINT chk_business_order_owner_city CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO business_order_tenant_ownership(city_code, business_client_id, order_id)
SELECT city_code, business_client_id, order_id
FROM business_orders;

ALTER TABLE business_orders
  ADD CONSTRAINT fk_business_order_tenant_ownership
  FOREIGN KEY (city_code, business_client_id, order_id)
  REFERENCES business_order_tenant_ownership(city_code, business_client_id, order_id);

INSERT INTO schema_migrations(version)
VALUES ('042_phase22_enterprise_order_tenant_immutability');
