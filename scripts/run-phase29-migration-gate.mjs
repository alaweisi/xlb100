import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const require = createRequire(path.join(root, "backend", "package.json"));
const mysql = require("mysql2/promise");
const migrationName = "057_phase29_marketing_coupon";
const migrationPath = path.join(root, "db", "migrations", `${migrationName}.sql`);
const migrationText = fs.readFileSync(migrationPath, "utf8");
const migrationsThrough056 = fs.readdirSync(path.join(root, "db", "migrations"))
  .filter((name) => /^(\d{3})_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 56)
  .sort();
const tables = [
  "marketing_campaigns",
  "marketing_rule_revisions",
  "coupon_definitions",
  "coupon_grants",
  "marketing_discount_decisions",
  "coupon_reservations",
  "coupon_redemptions",
  "marketing_compensations",
  "marketing_audit_records",
];

function migrate(env = process.env) {
  const result = spawnSync(
    "npx",
    ["pnpm", "--filter", "@xlb/backend", "exec", "tsx", "src/dal/migrateCli.ts"],
    { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) throw new Error(`migration command exited ${result.status ?? 1}`);
}

async function scalar(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return String(Object.values(rows[0] ?? {})[0] ?? "");
}

async function snapshotLockedFacts(connection) {
  const [rows] = await connection.execute(
    `SELECT
       (SELECT COUNT(*) FROM orders) AS order_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',order_id,city_code,customer_id,sku_id,status,total_amount))),0)
          FROM orders) AS order_hash,
       (SELECT COUNT(*) FROM order_price_snapshots) AS snapshot_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',order_id,city_code,CAST(quote_snapshot AS CHAR)))),0)
          FROM order_price_snapshots) AS snapshot_hash,
       (SELECT COUNT(*) FROM price_rules) AS price_rule_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',price_rule_id,city_code,sku_id,base_price,currency,version,is_enabled))),0)
          FROM price_rules) AS price_rule_hash,
       (SELECT COUNT(*) FROM event_outbox) AS event_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',event_id,city_code,event_type,aggregate_type,aggregate_id,status))),0)
          FROM event_outbox) AS event_hash,
       (SELECT COUNT(*) FROM platform_event_deliveries) AS delivery_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',delivery_id,city_code,subscriber_id,event_id,status))),0)
          FROM platform_event_deliveries) AS delivery_hash,
       (SELECT COUNT(*) FROM platform_event_subscriptions) AS subscription_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',subscription_id,subscriber_id,event_type,event_major_version,status))),0)
          FROM platform_event_subscriptions) AS subscription_hash`,
  );
  return JSON.stringify(rows);
}

async function indexColumns(connection, table, index) {
  return scalar(
    connection,
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
       FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name=? AND index_name=?`,
    [table, index],
  );
}

async function checkClause(connection, table, constraint) {
  return (await scalar(
    connection,
    `SELECT LOWER(cc.check_clause)
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON cc.constraint_schema=tc.constraint_schema AND cc.constraint_name=tc.constraint_name
      WHERE tc.constraint_schema=DATABASE() AND tc.table_name=? AND tc.constraint_name=?`,
    [table, constraint],
  )).replaceAll("`", "").replaceAll("_utf8mb4", "").replaceAll("\\", "")
    .replaceAll("(", "").replaceAll(")", "")
    .replaceAll(" ", "").replaceAll("\n", "");
}

async function requireCheck(connection, table, constraint, required, forbidden = []) {
  const clause = await checkClause(connection, table, constraint);
  if (!clause) throw new Error(`${table}.${constraint} CHECK is missing`);
  for (const fragment of required) {
    if (!clause.includes(fragment.replaceAll(" ", "").toLowerCase())) {
      throw new Error(`${table}.${constraint} must contain ${fragment}; got ${clause}`);
    }
  }
  for (const fragment of forbidden) {
    if (clause.includes(fragment.replaceAll(" ", "").toLowerCase())) {
      throw new Error(`${table}.${constraint} must not contain ${fragment}; got ${clause}`);
    }
  }
}

async function requireForeignKey(connection, table, constraint, referencedTable, expectedColumns) {
  const [rows] = await connection.execute(
    `SELECT
       GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',') AS child_columns,
       GROUP_CONCAT(referenced_column_name ORDER BY ordinal_position SEPARATOR ',') AS parent_columns,
       MAX(referenced_table_name) AS parent_table
     FROM information_schema.key_column_usage
     WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_name=?
       AND referenced_table_name IS NOT NULL`,
    [table, constraint],
  );
  const row = rows[0] ?? {};
  const actual = `${row.child_columns ?? ""}->${row.parent_table ?? ""}(${row.parent_columns ?? ""})`;
  const expected = `${expectedColumns.child}->${referencedTable}(${expectedColumns.parent})`;
  if (actual !== expected) throw new Error(`${table}.${constraint} expected ${expected}, got ${actual}`);
}

async function verifySchema(connection, expectEmpty) {
  const marker = await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]);
  if (marker !== "1") throw new Error(`migration 057 marker expected 1, got ${marker}`);

  const actualTableCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema=DATABASE() AND table_name IN (${tables.map(() => "?").join(",")})`,
    tables,
  );
  if (actualTableCount !== String(tables.length)) {
    throw new Error(`expected ${tables.length} Phase29 tables, got ${actualTableCount}`);
  }

  const cityColumns = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE()
        AND table_name IN (${tables.map(() => "?").join(",")})
        AND column_name='city_code' AND is_nullable='NO'`,
    tables,
  );
  if (cityColumns !== String(tables.length)) {
    throw new Error(`all ${tables.length} Phase29 tables require non-null city_code; got ${cityColumns}`);
  }

  const expectedKeys = [
    ["marketing_campaigns", "uq_mkt_campaign_create_idem", "city_code,created_by,create_idempotency_key_hash"],
    ["marketing_rule_revisions", "uq_mkt_rule_campaign_revision", "city_code,marketing_campaign_id,revision"],
    ["marketing_rule_revisions", "uq_mkt_rule_hash_evidence", "city_code,rule_revision_id,content_hash"],
    ["coupon_definitions", "uq_coupon_def_scope_id", "city_code,marketing_campaign_id,rule_revision_id,coupon_definition_id"],
    ["coupon_grants", "uq_coupon_grant_issuance", "city_code,coupon_definition_id,customer_id,issuance_reason,issuance_ref"],
    ["coupon_grants", "uq_coupon_grant_rule_evidence", "city_code,customer_id,coupon_definition_id,rule_revision_id,coupon_grant_id"],
    ["marketing_discount_decisions", "uq_mkt_decision_issue_idem", "city_code,customer_id,issue_idempotency_key_hash"],
    ["marketing_discount_decisions", "uq_mkt_decision_order_command", "city_code,customer_id,accepted_order_command_key_hash"],
    ["marketing_discount_decisions", "uq_mkt_decision_amount_evidence", "city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor"],
    ["marketing_discount_decisions", "idx_mkt_decision_grant_rule_evidence", "city_code,customer_id,coupon_definition_id,rule_revision_id,coupon_grant_id"],
    ["coupon_reservations", "uq_coupon_reservation_blocking_grant", "city_code,blocking_grant_id"],
    ["coupon_reservations", "uq_coupon_reservation_amount_evidence", "city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor,coupon_reservation_id,order_id"],
    ["coupon_redemptions", "uq_coupon_redemption_grant", "city_code,coupon_grant_id"],
    ["coupon_redemptions", "uq_coupon_redemption_amount_evidence", "city_code,customer_id,coupon_redemption_id,currency,discount_amount_minor"],
    ["coupon_redemptions", "idx_coupon_redemption_reservation_amount", "city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor,coupon_reservation_id,order_id"],
    ["marketing_compensations", "uq_mkt_compensation_trigger", "city_code,source_coupon_redemption_id,trigger_type,trigger_id"],
    ["marketing_compensations", "uq_mkt_compensation_delivery", "city_code,source_delivery_id"],
    ["marketing_compensations", "idx_mkt_compensation_redemption_amount", "city_code,customer_id,source_coupon_redemption_id,currency,amount_minor"],
  ];
  for (const [table, index, expected] of expectedKeys) {
    const actual = await indexColumns(connection, table, index);
    if (actual !== expected) throw new Error(`${table}.${index} expected ${expected}, got ${actual}`);
  }

  await requireForeignKey(connection, "marketing_campaigns", "fk_mkt_campaign_active_rule", "marketing_rule_revisions", {
    child: "city_code,marketing_campaign_id,active_rule_revision_id",
    parent: "city_code,marketing_campaign_id,rule_revision_id",
  });
  await requireForeignKey(connection, "coupon_grants", "fk_coupon_grant_rule_evidence", "marketing_rule_revisions", {
    child: "city_code,marketing_campaign_id,rule_revision_id",
    parent: "city_code,marketing_campaign_id,rule_revision_id",
  });
  await requireForeignKey(connection, "marketing_discount_decisions", "fk_mkt_decision_grant", "coupon_grants", {
    child: "city_code,customer_id,coupon_definition_id,rule_revision_id,coupon_grant_id",
    parent: "city_code,customer_id,coupon_definition_id,rule_revision_id,coupon_grant_id",
  });
  await requireForeignKey(connection, "marketing_discount_decisions", "fk_mkt_decision_rule_evidence", "marketing_rule_revisions", {
    child: "city_code,rule_revision_id,rule_content_hash",
    parent: "city_code,rule_revision_id,content_hash",
  });
  await requireForeignKey(connection, "coupon_reservations", "fk_coupon_reservation_decision", "marketing_discount_decisions", {
    child: "city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor",
    parent: "city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor",
  });
  await requireForeignKey(connection, "coupon_reservations", "fk_coupon_reservation_order", "orders", {
    child: "city_code,order_id", parent: "city_code,order_id",
  });
  await requireForeignKey(connection, "coupon_redemptions", "fk_coupon_redemption_reservation", "coupon_reservations", {
    child: "city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor,coupon_reservation_id,order_id",
    parent: "city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor,coupon_reservation_id,order_id",
  });
  await requireForeignKey(connection, "marketing_compensations", "fk_mkt_compensation_redemption", "coupon_redemptions", {
    child: "city_code,customer_id,source_coupon_redemption_id,currency,amount_minor",
    parent: "city_code,customer_id,coupon_redemption_id,currency,discount_amount_minor",
  });
  await requireForeignKey(connection, "marketing_compensations", "fk_mkt_compensation_delivery", "platform_event_deliveries", {
    child: "city_code,source_delivery_id", parent: "city_code,delivery_id",
  });
  await requireForeignKey(connection, "marketing_compensations", "fk_mkt_compensation_source_event", "event_outbox", {
    child: "city_code,source_event_id", parent: "city_code,event_id",
  });

  for (const table of tables) {
    const cityCheckCount = await scalar(
      connection,
      `SELECT COUNT(*) FROM information_schema.table_constraints
        WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_type='CHECK'
          AND constraint_name LIKE '%\\_city'`,
      [table],
    );
    if (cityCheckCount !== "1") throw new Error(`${table} requires exactly one non-global city CHECK`);
    const cityConstraint = await scalar(
      connection,
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_type='CHECK'
          AND constraint_name LIKE '%\\_city'`,
      [table],
    );
    await requireCheck(connection, table, cityConstraint, ["city_code<>'__global__'"]);
  }
  await requireCheck(connection, "coupon_definitions", "chk_coupon_def_money", ["face_value_minor>0", "min_spend_minor>face_value_minor"]);
  await requireCheck(connection, "coupon_definitions", "chk_coupon_def_inventory", [
    "issuance_cap>0", "issued_count<=issuance_cap", "compensation_cap>0", "compensation_issued_count<=compensation_cap",
  ]);
  await requireCheck(connection, "marketing_discount_decisions", "chk_mkt_decision_money", [
    "gross_amount_minor>0", "discount_amount_minor<gross_amount_minor",
    "net_amount_minor=gross_amount_minor-discount_amount_minor", "net_amount_minor>=1",
  ]);
  await requireCheck(connection, "marketing_rule_revisions", "chk_mkt_rule_review", ["reviewed_by<>created_by"]);
  await requireCheck(
    connection,
    "marketing_rule_revisions",
    "chk_mkt_rule_publish",
    ["published_by<>reviewed_by"],
    ["published_by<>created_by"],
  );
  await requireCheck(connection, "marketing_compensations", "chk_mkt_compensation_trigger", [
    "order_cancellation", "full_refund",
  ]);

  const blockingExpression = (await scalar(
    connection,
    `SELECT LOWER(generation_expression) FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='coupon_reservations' AND column_name='blocking_grant_id'`,
  )).replaceAll("`", "").replaceAll(" ", "");
  for (const required of ["coupon_grant_id", "active", "redeemed"]) {
    if (!blockingExpression.includes(required)) {
      throw new Error(`coupon reservation blocking grant expression must include ${required}; got ${blockingExpression}`);
    }
  }

  const cascadeCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.referential_constraints
      WHERE constraint_schema=DATABASE()
        AND table_name IN (${tables.map(() => "?").join(",")})
        AND (delete_rule='CASCADE' OR update_rule='CASCADE')`,
    tables,
  );
  if (cascadeCount !== "0") throw new Error("Phase29 evidence/city FKs must not cascade");

  if (expectEmpty) {
    for (const table of tables) {
      const count = await scalar(connection, `SELECT COUNT(*) FROM \`${table}\``);
      if (count !== "0") throw new Error(`${table} must start empty, got ${count}`);
    }
  }
}

async function expectForeignKeyRejected(label, operation) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === "ER_NO_REFERENCED_ROW_2" || error?.errno === 1452) return;
    throw new Error(`${label} expected a foreign-key rejection, got ${error?.code ?? error}`);
  }
  throw new Error(`${label} contradictory evidence was accepted`);
}

async function verifyContradictoryEvidenceRejected(connection) {
  const [quoteRows] = await connection.execute(
    `SELECT p.city_code,p.sku_id,p.price_rule_id,p.version
       FROM price_rules p
       JOIN service_skus s ON s.sku_id=p.sku_id AND s.city_code=p.city_code
      WHERE p.city_code<>'__global__' LIMIT 1`,
  );
  let quote = quoteRows[0];
  if (!quote) {
    const fixtureCity = "phase29_gate_city";
    await connection.execute(
      "INSERT INTO cities (city_code,city_name,is_open) VALUES (?, 'Phase29 Gate City', 1)",
      [fixtureCity],
    );
    await connection.execute(
      `INSERT INTO service_categories (category_id,city_code,name,is_enabled)
       VALUES ('phase29-gate-category',?,'Phase29 Gate Category',1)`,
      [fixtureCity],
    );
    await connection.execute(
      `INSERT INTO service_items (item_id,category_id,city_code,name,is_enabled)
       VALUES ('phase29-gate-item','phase29-gate-category',?,'Phase29 Gate Item',1)`,
      [fixtureCity],
    );
    await connection.execute(
      `INSERT INTO service_skus (sku_id,item_id,city_code,name,is_enabled)
       VALUES ('phase29-gate-sku','phase29-gate-item',?,'Phase29 Gate SKU',1)`,
      [fixtureCity],
    );
    await connection.execute(
      `INSERT INTO price_rules (price_rule_id,city_code,sku_id,base_price,currency,version,is_enabled)
       VALUES ('phase29-gate-price',?,'phase29-gate-sku',50.00,'CNY',1,1)`,
      [fixtureCity],
    );
    quote = {
      city_code: fixtureCity,
      sku_id: "phase29-gate-sku",
      price_rule_id: "phase29-gate-price",
      version: 1,
    };
  }

  const city = quote.city_code;
  const customer = "phase29-gate-customer";
  const campaign = "phase29-gate-campaign";
  const rule = "phase29-gate-rule-1";
  const otherRule = "phase29-gate-rule-2";
  const definition = "phase29-gate-definition";
  const grant = "phase29-gate-grant";
  const decision = "phase29-gate-decision";
  const order = "phase29-gate-order";
  const reservation = "phase29-gate-reservation";
  const redemption = "phase29-gate-redemption";
  const ruleHash = "a".repeat(64);
  const otherRuleHash = "b".repeat(64);
  const fingerprint = "c".repeat(64);

  await connection.execute(
    `INSERT INTO customers (id,phone,name,default_city_code)
     VALUES (?,?,?,?)`,
    [customer, "13900009999", "Phase29 Gate", city],
  );
  await connection.execute(
    `INSERT INTO marketing_campaigns
      (marketing_campaign_id,city_code,name,status,start_at,end_at,reviewed_by,reviewed_at,
       create_idempotency_key_hash,create_request_fingerprint,created_by)
     VALUES (?,?,?,'active',DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 DAY),
       DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 30 DAY),'gate-reviewer',CURRENT_TIMESTAMP(3),?,?,?)`,
    [campaign, city, "Phase29 Gate", "1".repeat(64), "2".repeat(64), "gate-creator"],
  );
  const insertRuleSql = `INSERT INTO marketing_rule_revisions
    (rule_revision_id,marketing_campaign_id,city_code,revision,status,allowed_sku_ids_json,
     content_hash,reviewed_by,reviewed_at,published_by,published_at,
     create_idempotency_key_hash,create_request_fingerprint,created_by)
   VALUES (?,?,?,?, 'published',JSON_ARRAY(?),?,'gate-reviewer',CURRENT_TIMESTAMP(3),
     'gate-publisher',CURRENT_TIMESTAMP(3),?,?, 'gate-creator')`;
  await connection.execute(insertRuleSql, [
    rule, campaign, city, 1, quote.sku_id, ruleHash, "3".repeat(64), "4".repeat(64),
  ]);
  await connection.execute(insertRuleSql, [
    otherRule, campaign, city, 2, quote.sku_id, otherRuleHash, "5".repeat(64), "6".repeat(64),
  ]);
  await connection.execute(
    `UPDATE marketing_campaigns SET active_rule_revision_id=? WHERE city_code=? AND marketing_campaign_id=?`,
    [rule, city, campaign],
  );
  await connection.execute(
    `INSERT INTO coupon_definitions
      (coupon_definition_id,marketing_campaign_id,rule_revision_id,city_code,name,status,currency,
       face_value_minor,min_spend_minor,issuance_cap,compensation_cap,valid_from,valid_until,
       create_idempotency_key_hash,create_request_fingerprint,created_by)
     VALUES (?,?,?,?,'Phase29 Gate','active','CNY',1000,2000,10,10,
       DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 DAY),DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 30 DAY),?,?,?)`,
    [definition, campaign, rule, city, "7".repeat(64), "8".repeat(64), "gate-creator"],
  );
  await connection.execute(
    `INSERT INTO coupon_grants
      (coupon_grant_id,coupon_definition_id,marketing_campaign_id,rule_revision_id,city_code,
       customer_id,status,issuance_reason,issuance_ref,available_at,expires_at,
       idempotency_key_hash,request_fingerprint,created_by)
     VALUES (?,?,?,?,?,?,'available','admin_manual','phase29-gate',CURRENT_TIMESTAMP(3),
       DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 30 DAY),?,?,?)`,
    [grant, definition, campaign, rule, city, customer, "9".repeat(64), "d".repeat(64), "gate-admin"],
  );

  const insertDecision = (id, ruleRevisionId, contentHash, idempotencyHash) => connection.execute(
    `INSERT INTO marketing_discount_decisions
      (discount_decision_id,city_code,customer_id,sku_id,quantity,price_rule_id,price_rule_version,
       rule_revision_id,rule_content_hash,coupon_definition_id,coupon_grant_id,currency,
       gross_amount_minor,discount_amount_minor,net_amount_minor,request_fingerprint,
       issue_idempotency_key_hash,status,expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'CNY',5000,1000,4000,?,?,'issued',
       DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 5 MINUTE))`,
    [id, city, customer, quote.sku_id, 1, quote.price_rule_id, quote.version,
      ruleRevisionId, contentHash, definition, grant, fingerprint, idempotencyHash],
  );

  await expectForeignKeyRejected("decision rule content hash", () =>
    insertDecision("phase29-gate-bad-rule-hash", rule, "f".repeat(64), "0".repeat(64)));
  await expectForeignKeyRejected("decision grant/rule revision", () =>
    insertDecision("phase29-gate-bad-grant-rule", otherRule, otherRuleHash, "e".repeat(64)));
  await insertDecision(decision, rule, ruleHash, "f".repeat(64));

  await connection.execute(
    `INSERT INTO orders
      (order_id,city_code,customer_id,sku_id,sku_name,quantity,unit,price_rule_id,price_text,
       price_type,base_price,currency,total_amount,status)
     VALUES (?,?,?,?,?,1,'session',?,'50.00','fixed',50.00,'CNY',40.00,'pending_payment')`,
    [order, city, customer, quote.sku_id, "Phase29 Gate SKU", quote.price_rule_id],
  );
  const insertReservation = (id, amount) => connection.execute(
    `INSERT INTO coupon_reservations
      (coupon_reservation_id,coupon_grant_id,discount_decision_id,order_id,city_code,customer_id,
       status,currency,discount_amount_minor,expires_at)
     VALUES (?,?,?,?,?,?,'active','CNY',?,DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL 2 MINUTE))`,
    [id, grant, decision, order, city, customer, amount],
  );
  await expectForeignKeyRejected("reservation amount/decision", () =>
    insertReservation("phase29-gate-bad-reservation", 999));
  await insertReservation(reservation, 1000);

  const insertRedemption = (id, amount) => connection.execute(
    `INSERT INTO coupon_redemptions
      (coupon_redemption_id,coupon_reservation_id,coupon_grant_id,discount_decision_id,order_id,
       city_code,customer_id,currency,discount_amount_minor,redeemed_at)
     VALUES (?,?,?,?,?,?,?,'CNY',?,CURRENT_TIMESTAMP(3))`,
    [id, reservation, grant, decision, order, city, customer, amount],
  );
  await expectForeignKeyRejected("redemption amount/reservation", () =>
    insertRedemption("phase29-gate-bad-redemption", 999));
  await insertRedemption(redemption, 1000);

  const subscriber = "phase29-gate-subscriber";
  const subscription = "phase29-gate-subscription";
  const event = "phase29-gate-source-event";
  const delivery = "phase29-gate-delivery";
  await connection.execute(
    `INSERT INTO platform_event_subscribers
      (subscriber_id,stable_name,owner_domain,handler_revision,purpose,max_pii_level,status,
       created_by_service_id,updated_by_service_id)
     VALUES (?,?,'marketing','gate-v0','ephemeral migration-gate evidence','P2','proposed','gate','gate')`,
    [subscriber, subscriber],
  );
  await connection.execute(
    `INSERT INTO platform_event_subscriptions
      (subscription_id,city_code,subscriber_id,event_type,event_major_version,
       compatibility_handler_revision,retention_class,status,lease_seconds,max_attempts,
       created_by_service_id,updated_by_service_id)
     VALUES (?,?,?,'order.reverse.applied',0,'gate-v0','R3','proposed',30,5,'gate','gate')`,
    [subscription, city, subscriber],
  );
  await connection.execute(
    `INSERT INTO event_outbox
      (event_id,event_type,event_major_version,aggregate_type,aggregate_id,city_code,payload_json,status)
     VALUES (?,'order.reverse.applied',0,'order',?,?,JSON_OBJECT(),'pending')`,
    [event, order, city],
  );
  await connection.execute(
    `INSERT INTO platform_event_deliveries
      (delivery_id,city_code,subscriber_id,subscription_id,event_id,event_type,event_major_version,
       payload_hash,aggregate_type,aggregate_id,status,max_attempts)
     VALUES (?,?,?,?,?,'order.reverse.applied',0,?,'order',?,'pending',5)`,
    [delivery, city, subscriber, subscription, event, "a".repeat(64), order],
  );
  await expectForeignKeyRejected("compensation amount/source redemption", () => connection.execute(
    `INSERT INTO marketing_compensations
      (compensation_id,city_code,customer_id,source_coupon_redemption_id,trigger_type,trigger_id,
       source_delivery_id,source_event_id,source_payload_hash,status,currency,amount_minor)
     VALUES ('phase29-gate-bad-compensation',?,?,?,'order_cancellation',?,?,?,?,'pending','CNY',999)`,
    [city, customer, redemption, order, delivery, event, "a".repeat(64)],
  ));
}

async function applyMigrationsThrough056(connection) {
  for (const file of migrationsThrough056) {
    await connection.query(fs.readFileSync(path.join(root, "db", "migrations", file), "utf8"));
    const version = file.replace(/\.sql$/, "");
    await connection.execute(
      "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version=version",
      [version],
    );
  }
  const baseline = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='056_phase28_review_reputation'",
  );
  if (baseline !== "1") throw new Error("temporary baseline requires migration 056 exactly once");
  const marker = await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]);
  if (marker !== "0") throw new Error("temporary 000-056 baseline must not contain migration 057");
}

const createTables = [...migrationText.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (JSON.stringify(createTables) !== JSON.stringify(tables)) {
  throw new Error(`migration 057 table ledger mismatch: ${createTables.join(",")}`);
}
const insertTargets = [...migrationText.matchAll(/INSERT\s+INTO\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (insertTargets.length !== 1 || insertTargets[0] !== "schema_migrations") {
  throw new Error(`migration 057 must contain no seed/data INSERT; found ${insertTargets.join(",")}`);
}
const alteredTables = [...migrationText.matchAll(/ALTER\s+TABLE\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (alteredTables.some((table) => !tables.includes(table))) {
  throw new Error(`migration 057 must not alter locked tables; found ${alteredTables.join(",")}`);
}
if (/\b058_/i.test(migrationText)) throw new Error("migration 057 must not reference migration 058+");
if (/ON\s+(DELETE|UPDATE)\s+CASCADE/i.test(migrationText)) throw new Error("migration 057 must not cascade");
if (/CREATE\s+(TRIGGER|EVENT|PROCEDURE|FUNCTION)/i.test(migrationText)) {
  throw new Error("migration 057 must not create triggers, schedulers, procedures, or functions");
}
if (/INSERT\s+INTO\s+(platform_event_subscriptions|platform_event_deliveries)/i.test(migrationText)) {
  throw new Error("migration 057 must not activate platform subscriptions or deliveries");
}

const common = { host: process.env.MYSQL_HOST ?? "127.0.0.1", port: Number(process.env.MYSQL_PORT ?? 3306) };
const currentConfig = {
  ...common,
  database: process.env.MYSQL_DATABASE ?? "xlb_local",
  user: process.env.MYSQL_USER ?? "xlb",
  password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
  multipleStatements: true,
};

const current = await mysql.createConnection(currentConfig);
try {
  const sourceBefore = await snapshotLockedFacts(current);
  // A local pre-Lock 057 may already carry the marker from an earlier gate run.
  // Execute the idempotent migration text so that this still proves in-place
  // convergence from that exercised schema; the CLI paths below prove normal apply.
  await current.query(migrationText);
  await current.query(migrationText);
  migrate();
  migrate();
  await verifySchema(current, false);
  if (await snapshotLockedFacts(current) !== sourceBefore) {
    throw new Error("migration 057 changed locked Order, Pricing, Outbox, or Platform Delivery facts");
  }
} finally {
  await current.end();
}

const rootConfig = {
  ...common,
  user: process.env.MYSQL_ROOT_USER ?? "root",
  password: process.env.MYSQL_ROOT_PASSWORD ?? "xlb_root_password",
};
const rootConnection = await mysql.createConnection(rootConfig);

async function withTemporaryDatabase(label, callback) {
  const database = `xlb_phase29_gate_${label}_${Date.now()}`;
  if (!/^xlb_phase29_gate_[a-z]+_[0-9]+$/.test(database)) throw new Error("unsafe temporary database name");
  await rootConnection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  try {
    const env = { ...process.env, MYSQL_DATABASE: database, MYSQL_USER: rootConfig.user, MYSQL_PASSWORD: rootConfig.password };
    const connection = await mysql.createConnection({ ...rootConfig, database, multipleStatements: true });
    try { await callback({ connection, env }); } finally { await connection.end(); }
  } finally {
    await rootConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  }
}

try {
  await withTemporaryDatabase("empty", async ({ connection, env }) => {
    migrate(env);
    migrate(env);
    await verifySchema(connection, true);
    await verifyContradictoryEvidenceRejected(connection);
  });

  await withTemporaryDatabase("upgrade", async ({ connection, env }) => {
    await applyMigrationsThrough056(connection);
    const sourceBefore = await snapshotLockedFacts(connection);
    migrate(env);
    migrate(env);
    await verifySchema(connection, true);
    if (await snapshotLockedFacts(connection) !== sourceBefore) {
      throw new Error("000-056 upgrade changed locked Order, Pricing, Outbox, or Platform Delivery facts");
    }
  });

  await withTemporaryDatabase("partial", async ({ connection, env }) => {
    await applyMigrationsThrough056(connection);
    const sourceBefore = await snapshotLockedFacts(connection);
    const interruptionBoundary = migrationText.indexOf("CREATE TABLE IF NOT EXISTS marketing_discount_decisions");
    if (interruptionBoundary <= 0) throw new Error("cannot locate true partial-DDL interruption boundary");
    await connection.query(migrationText.slice(0, interruptionBoundary));
    const partialTableCount = await scalar(
      connection,
      `SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema=DATABASE() AND table_name IN (${tables.map(() => "?").join(",")})`,
      tables,
    );
    if (partialTableCount !== "4") throw new Error(`true partial-DDL setup expected 4 tables, got ${partialTableCount}`);
    const partialMarker = await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]);
    if (partialMarker !== "0") throw new Error("true partial-DDL setup must not write migration 057 marker");

    migrate(env);
    migrate(env);
    await verifySchema(connection, true);
    if (await snapshotLockedFacts(connection) !== sourceBefore) {
      throw new Error("partial-DDL recovery changed locked Order, Pricing, Outbox, or Platform Delivery facts");
    }
  });
} finally {
  await rootConnection.end();
}

process.stdout.write(
  "Phase 29 migration 057 existing/empty/000-056-upgrade/true-partial-DDL/double-replay/constraint Gate PASS\n",
);
