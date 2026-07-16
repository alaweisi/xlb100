import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const requireTokens = (relative, tokens) => {
  const source = read(relative);
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`${relative} is missing production control: ${token}`);
  }
  return source;
};

const compose = requireTokens("deploy/compose/docker-compose.prod.yml", [
  "PROD_BACKEND_IMAGE:?", "MYSQL_PASSWORD_FILE", "REDIS_PASSWORD_FILE",
  "MYSQL_TLS_ENABLED: \"true\"", "REDIS_TLS_ENABLED: \"true\"",
  "AUTO_RUN_CITY_CODES:?", "read_only: true", "cap_drop: [ALL]",
  "no-new-privileges:true", "resources:", "max-size: 20m",
]);
if (/^\s+build:/mu.test(compose)) throw new Error("production compose must not contain local image builds");
if (/phase\d+|placeholder/iu.test(compose)) throw new Error("production compose must not contain placeholder image defaults");

requireTokens(".env.production.example", [
  "AUTO_RUN_CITY_CODES=", "MYSQL_PASSWORD_SECRET_FILE=", "MYSQL_TLS_CA_SECRET_FILE=",
  "REDIS_PASSWORD_SECRET_FILE=", "REDIS_TLS_CA_SECRET_FILE=", "@sha256:",
]);
const deploy = requireTokens("deploy/production/deploy-prod.ps1", [
  "@sha256:[a-fA-F0-9]{64}$", "docker compose", "pull", "--no-build", "docker image inspect",
]);
if (deploy.includes("--build")) throw new Error("production deploy must not build mutable images");
requireTokens("deploy/production/smoke-prod.ps1", [
  "dataReliability.ready", "jobWorker.state", "frontend response is not an application HTML document",
]);
requireTokens("deploy/production/check-release-window-data.ps1", [
  "RELEASE-WINDOW-READ-ONLY", "QuietWindowConfirmed", "ExpectedCommit",
  "check-ledger-replay.ps1", "check-ledger-immutability.ps1",
]);
requireTokens("infra/docker/Dockerfile.backend", ["USER node"]);
requireTokens("infra/docker/Dockerfile.frontend", ["USER node"]);

const alertRules = requireTokens("infra/observability/production-alert-rules.yml", [
  "XlbJobWorkerHeartbeatMissing", "XlbDataReliabilityNotReady", "XlbOutboxEligibleBacklogOld",
  "XlbOutboxTransactionalRowsStalled", "XlbOutboxExpiredLeases", "XlbOutboxDeadLetters",
  "XlbDispatchStreamHasNoConsumerGroup", "XlbMigrationMetricMissing", "XlbRateLimitBackendFailure",
]);
const metricsSource = read("backend/src/observability/metrics.ts");
for (const metric of alertRules.match(/xlb_[a-z0-9_]+/gu) ?? []) {
  if (!metricsSource.includes(metric)) throw new Error(`alert references an unexported metric: ${metric}`);
}
requireTokens("infra/observability/prometheus.production.yml", [
  "production-alert-rules.yml", "alertmanager:9093", "metrics_path: /metrics", "backend:3000",
]);
requireTokens("infra/observability/alertmanager.production.yml.example", [
  "xlb-oncall", "REPLACE_WITH_SECRET_MANAGER_INJECTED_ONCALL_WEBHOOK", "send_resolved: true",
]);
JSON.parse(read("infra/observability/grafana-production-dashboard.json"));
requireTokens("infra/nginx/production.conf.template", [
  "ssl_protocols TLSv1.2 TLSv1.3", "Strict-Transport-Security", "location = /metrics", "deny all",
]);

const temp = mkdtempSync(path.join(tmpdir(), "xlb-prod-config-"));
try {
  const secretPath = path.join(temp, "secret").replaceAll("\\", "/");
  writeFileSync(secretPath, "repository-readiness-only\n", { mode: 0o600 });
  const digest = `registry.invalid/xlb/app@sha256:${"a".repeat(64)}`;
  const envFile = path.join(temp, ".env.production");
  const lines = [
    "BACKEND_PORT=3000", "MYSQL_HOST=mysql.prod.internal", "MYSQL_PORT=3306",
    "MYSQL_DATABASE=xlb_prod", "MYSQL_USER=xlb_prod", "REDIS_HOST=redis.prod.internal",
    "REDIS_PORT=6380", "AUTO_RUN_CITY_CODES=hangzhou",
    `PROD_BACKEND_IMAGE=${digest}`, `PROD_CUSTOMER_IMAGE=${digest}`,
    `PROD_WORKER_IMAGE=${digest}`, `PROD_ADMIN_IMAGE=${digest}`,
    ...[
      "MYSQL_PASSWORD_SECRET_FILE", "MYSQL_TLS_CA_SECRET_FILE", "REDIS_PASSWORD_SECRET_FILE",
      "REDIS_TLS_CA_SECRET_FILE", "JWT_SECRET_FILE", "JWT_KEYS_JSON_SECRET_FILE",
      "AUTH_PHONE_HASH_SECRET_FILE", "AUTH_OTP_PEPPER_SECRET_FILE",
    ].map((name) => `${name}=${secretPath}`),
  ];
  writeFileSync(envFile, `${lines.join("\n")}\n`);
  const result = spawnSync("docker", [
    "compose", "--env-file", envFile,
    "-f", path.join(root, "deploy/compose/docker-compose.prod.yml"), "config", "--quiet",
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`production compose config failed: ${result.stderr || result.stdout}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

process.stdout.write("check-production-repository-readiness: passed\n");
