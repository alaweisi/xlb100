-- Stage 2C-2: migration concurrency, checksum, and execution evidence controls.
-- Depends on: 057_phase29_marketing_coupon.sql
-- The baseline rows are immutable checksums of normalized 000-057 migration SQL.

SET @add_checksum_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'schema_migrations'
        AND column_name = 'checksum_sha256'
    ),
    'SELECT 1',
    'ALTER TABLE schema_migrations ADD COLUMN checksum_sha256 CHAR(64) NULL AFTER version'
  )
);
PREPARE add_checksum_stmt FROM @add_checksum_sql;
EXECUTE add_checksum_stmt;
DEALLOCATE PREPARE add_checksum_stmt;

SET @add_duration_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'schema_migrations'
        AND column_name = 'execution_duration_ms'
    ),
    'SELECT 1',
    'ALTER TABLE schema_migrations ADD COLUMN execution_duration_ms BIGINT UNSIGNED NULL AFTER applied_at'
  )
);
PREPARE add_duration_stmt FROM @add_duration_sql;
EXECUTE add_duration_stmt;
DEALLOCATE PREPARE add_duration_stmt;

SET @add_executor_sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'schema_migrations'
        AND column_name = 'executor_id'
    ),
    'SELECT 1',
    'ALTER TABLE schema_migrations ADD COLUMN executor_id VARCHAR(128) NULL AFTER execution_duration_ms'
  )
);
PREPARE add_executor_stmt FROM @add_executor_sql;
EXECUTE add_executor_stmt;
DEALLOCATE PREPARE add_executor_stmt;

CREATE TABLE IF NOT EXISTS migration_checksum_baselines (
  version VARCHAR(64) NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version),
  CONSTRAINT chk_migration_baseline_checksum
    CHECK (checksum_sha256 REGEXP '^[0-9a-f]{64}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_checksum_baselines (version, checksum_sha256)
VALUES
  ('000_init', 'a345c59f90f5396bf2bdf05035a68110646332e66446173d9fdf161248ab31cf'),
  ('001_city_foundation', '1955223619fb85c9ce5914f819c850199e80ae13f29d4fbe628ae64a8755795d'),
  ('002_dal_scope_foundation', 'bb2eb46bfc19279253fd6290ae3c67f6b95728155efa77f42239690a692f7df6'),
  ('003_admin_scope_global_marker', '57ab900a164219a5127275cd524b6ca1b2e21fcd4a6d099a2adc622a6031c8cc'),
  ('004_cityconfig_catalog_pricing_foundation', 'd115c58127a55b384e1a3dbe3ba468a6672d70c2750bb2a20cff73cc286a89f3'),
  ('005_official_pricing_display_fields', '5b971c7fa0e0dd1a3b02e45f0fb427f76358a986ff81daa4a3ce6b1b1aab3c6a'),
  ('006_order_payment_outbox_foundation', '2a60ce6a6bc10ab98b4b58c42208d6d076c05c78d1bba7554a489dbcc22142e1'),
  ('007_dispatch_outbox_city_stream_foundation', '796cd9e7290296e82697c79674dbfa04a76ffa6e015147aecb58f3671df0b295'),
  ('008_worker_pool_taskpool_readiness_foundation', '749d68305c69e43268590aca8de1234c0b9e511b372ca2d5ba98074584bd7abf'),
  ('009_certification_worker_eligibility_foundation', 'f47e888f0fc99ae451ba7fef633a8fe97028287bf49d44c0786f5feeabdc93c6'),
  ('010_worker_accept_fulfillment_skeleton_foundation', 'cc66c872537d6ff0ecc3134231d9c5d52249546280234994107be8b4801d12c0'),
  ('011_fulfillment_start_complete_foundation', '5db130f3a77ce2c86c08a217c20893fbb33a1fd9b8fb160980f444544ef936dd'),
  ('012_ledger_accrual_foundation', 'c36658a6fde2fb1d4886e16a71f592fa9f13fee341f2fb60db95ec98dea02511'),
  ('013_settlement_preparation_foundation', '2fdf4aa13588ec45bd43c8945dd52f49ae0d575403c9d897a963cff0887d1701'),
  ('014_settlement_confirmation', 'b6c40ed7fec21922053ddbc4f623a30b153db9b6c2ca19eb0644f15540dd457b'),
  ('015_settlement_payable_readiness', '42b8ddb5da214cf9f0aab8c3cdecea4bdb6d984ddcf054788706a5ac17065a6d'),
  ('016_settlement_payable_queue', '58955aaaed979ff116b16634328fb67fbeb677a5697d7ccd96dd4664bf67ddb0'),
  ('017_worker_receivable_statement', 'a424ccb42fb37578bca04723c4755bdc68c02dc9bca6c2e29469f4f803c0ae2b'),
  ('018_worker_receivable_statement_review', '88f6e6427953e1fe7283ca232fafda78848ef20384a36c09484f5557affb212f'),
  ('019_worker_receivable_statement_export', 'a3e01b0a361b2f03ade1d4f562cae25b4d6d5e9b48120ea9fc5903dd37c37a46'),
  ('020_settlement_action_governance_intents', 'c5d0945e1b55c56dfc9015c4bb09c78ec3ea5b293c118f055291500bface5d5c'),
  ('021_settlement_action_governance_reviews', '6210c0356e313e7a6b7d786f06121e3345ce561c5f20a84d255f5add328bd059'),
  ('022_settlement_action_governance_evidence_bundles', '8f9a3dfab4c4e22c453fd8cd381bc7d3c6b2e12fd3f7a3c9e8e4ccf19d2b8090'),
  ('023_settlement_action_governance_readiness_packets', 'b77602f1dfce7ccee2a78a0f837e3be9dadb955c08bd1297a992cfa36780f01c'),
  ('025_settlement_execution_dry_run_plans', '3b5376c345e1f3b08eb96e13da4d67ad6192e2326a1b02055fa516d3e9ccf98a'),
  ('026_settlement_execution_preparation_envelope', 'ad8533d5bfa9aa8073f04cad07d0fb45121e8eaa7763d16e8088ba402bf71438'),
  ('027_aftersale_refund_reversal', '161d3902e6b7054e40619936466409e6c866019c3f1188665c47cbe2fe224436'),
  ('028_customers_admin_users', 'd95fac551620b82ff83ee980848f0670f7152432ef4440a7b99e8fb662c243b5'),
  ('029_order_service_address_schedule', '156a88d03c075650fbd340b5482bdd4c3ddb65a41c0fd5c94d2ea8450386e186'),
  ('030_order_review_mvp', 'dcbb228570df4620e853906c4dec52205feea473449069118a13ecee313778e9'),
  ('031_dispatch_simulation_mvp', 'f27e253461b7967a4aea79e75bb4e2a1b886c0341b7fb8fb422a6e709c970a35'),
  ('032_customer_admin_fks_worker_finance', '0a5d1e560fdcd3038078903c08fd6896f1b424fd43f42fd45a1beab8e3a23f70'),
  ('033_phase16_sku_pricing_standards', 'aa55f884604c0a607c1922393bd7a127d74b08433686302fb81f9420c3a1c2b3'),
  ('034_phase17_order_reverse_aftersale_complaints', '974236babfc21f051e30222c28eee93e91c319bd4abc3cfdfa8fbff2618e1c59'),
  ('035_phase18_fulfillment_evidence_object_storage', '5eaddb06e203a61b4130d76e163945a97dcdfbfb25de03ee5b60977d9907f2c0'),
  ('036_phase18_city_reference_hardening', 'cd47f58b0a50a18621e213b4d2b115a1dbecb61485403d00fbba91c3bf52351b'),
  ('037_phase19_enterprise_openapi_webhooks', '25b40c67636c96078450c71a7554667935b13cf7d58cee3d287cf15438d2fb3a'),
  ('038_phase19_enterprise_tenant_hardening', 'b54a0c2be65816b2b9e38eed27b58ee38c045e39e697bf303a1bda1a22aec3c9'),
  ('039_phase20_lbs_lite_dispatch', '5a84aaf42249158e0d6589d24e85d22a4ad9049f172d67caec5418372d793f1b'),
  ('040_phase21_customer_operations', '4b1d7189571294363c1315eddb7a19d468e47dd3de584162b09a2b7498260df0'),
  ('041_phase21_customer_address_idempotency', 'c0624990f0f92493e916593425698701452396a1e45b59ae2824add812590da9'),
  ('042_phase22_enterprise_order_tenant_immutability', '7412ab66b62bc8fba59aba0dd430c35671e8c9234e1213713ad57af4cce3ffb4'),
  ('043_phase23a_worker_phone_identity_hash', '716759e34194efe765dccc20c41438a9a50d809c5cbdc2bc32fd412b37ed3fb8'),
  ('044_phase23b_event_outbox_reliability', '01dfeab28c239050bebd67d3e01d7c465bf643694592a5e42ecfdf8836a584ee'),
  ('045_phase23c_frontend_engineering', '68769e9d2790860a4996869bd7ece3e5a3f258494bfbbb3977d5aca1166dc62e'),
  ('046_phase23d_query_path_indexes', 'fe11b5a38783bdb5e25128af578148d74e34719680665375a7df4956e9a25a59'),
  ('047_phase24b_support_ticket_mvp', 'd3e73ea6887c50caec48ed877d42a75c90ce8deadaa1375b4d57d440b6fdb4e6'),
  ('048_phase24c_support_agents_skill_groups', 'fac1ac1f90c444cb11b5b6db0de07fbbb906c4b00a0b00de20cfa2277a8708df'),
  ('049_phase24c_support_routing_sla_policies', '4143456dc0f546d27c4b0778fcd33a4965c2cd5da8a79fe642f595d4b27b7dcf'),
  ('050_phase24c_support_sla_breach_workbench', '21b83a63833b5f6ba6f28724e9c3c85aa5ff17c06a0abc794a73f6280833c8e9'),
  ('051_phase24d_support_realtime_conversations', '3671e21acff705ad223d9d0b8dba34edb5cb9b83e4230f635e2381fd53dd5aca'),
  ('052_phase24e_support_bot_knowledge_base', '229b8b5e45b901d6388a75a0073156bc351f97db5f7059d9a7576d66c2ba58d1'),
  ('053_phase24f_support_quality', '6777413fd74bc485ef29c4f3c11813dfae1294139d4f7bd64bfaa5baf59859ea'),
  ('054_phase27a_platform_delivery_foundation', 'ab46e6b5227af89f321da8e7a54bf75373fa8868dbf8bb1a09b7e7d47cc4e206'),
  ('055_phase27b_notification_projection_foundation', 'e597e126638b3365419e5770120482e82d234038d7dbac7d521b5d553302f042'),
  ('056_phase28_review_reputation', '8120f595dd69ec3cf47fee61cbe8911237196c3b9693c147ab02f1b2a8bd6b7f'),
  ('057_phase29_marketing_coupon', '8699c20e53ebd94aec13f5d74da5dd1babffacf659a2f1177b65243abb003c37')
ON DUPLICATE KEY UPDATE checksum_sha256 = VALUES(checksum_sha256);

UPDATE schema_migrations AS applied
JOIN migration_checksum_baselines AS baseline ON baseline.version = applied.version
SET applied.checksum_sha256 = baseline.checksum_sha256
WHERE applied.checksum_sha256 IS NULL;

CREATE TABLE IF NOT EXISTS migration_execution_history (
  migration_execution_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version VARCHAR(64) NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  status ENUM('running', 'succeeded', 'failed') NOT NULL,
  executor_id VARCHAR(128) NOT NULL,
  started_at TIMESTAMP(3) NOT NULL,
  finished_at TIMESTAMP(3) NULL,
  execution_duration_ms BIGINT UNSIGNED NULL,
  error_message VARCHAR(2000) NULL,
  PRIMARY KEY (migration_execution_id),
  INDEX idx_migration_history_version_started (version, started_at),
  INDEX idx_migration_history_status_started (status, started_at),
  CONSTRAINT chk_migration_history_checksum
    CHECK (checksum_sha256 REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT chk_migration_history_completion CHECK (
    (status = 'running' AND finished_at IS NULL AND execution_duration_ms IS NULL)
    OR (status IN ('succeeded', 'failed') AND finished_at IS NOT NULL
      AND execution_duration_ms IS NOT NULL)
  ),
  CONSTRAINT chk_migration_history_error CHECK (
    (status = 'failed' AND error_message IS NOT NULL)
    OR (status <> 'failed' AND error_message IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version)
VALUES ('058_stage2c2_migration_control')
ON DUPLICATE KEY UPDATE version = version;
