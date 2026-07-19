import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFileSync(path.join(root, relative), "utf8");
const occurrences = (source, token) => source.split(token).length - 1;

export function loadUnitBSources() {
  return {
    nginx: read("infra/nginx/production.conf.template"),
    compose: read("deploy/compose/docker-compose.prod.yml"),
    smoke: read("deploy/production/smoke-prod.ps1"),
    env: read(".env.production.example"),
    deploy: read("deploy/production/deploy-prod.ps1"),
  };
}

export function validateUnitBProductionEdge(sources) {
  const errors = [];
  const requireToken = (name, source, token) => {
    if (!source.includes(token)) errors.push(`${name} is missing: ${token}`);
  };

  const { nginx, compose, smoke, env, deploy } = sources;

  if (nginx.includes("__DOMAIN__")) errors.push("nginx still contains the legacy __DOMAIN__ placeholder");
  requireToken("nginx", nginx, "map $http_upgrade $xlb_connection_upgrade");
  requireToken("nginx", nginx, "proxy_set_header Connection $xlb_connection_upgrade;");
  requireToken("nginx", nginx, "proxy_buffering off;");
  requireToken("nginx", nginx, "/run/secrets/tls_fullchain");
  requireToken("nginx", nginx, "/run/secrets/tls_private_key");
  requireToken("nginx", nginx, "listen 80 default_server;");
  requireToken("nginx", nginx, "listen 443 ssl default_server;");
  requireToken("nginx", nginx, "return 444;");
  if (occurrences(nginx, "location = /api/support/realtime") !== 4) {
    errors.push("nginx must expose the exact WebSocket route on api/customer/worker/admin domains");
  }
  if (occurrences(nginx, "location /api/ {") !== 3) {
    errors.push("nginx must expose same-origin /api/ on all three frontend domains");
  }
  if (occurrences(nginx, "Content-Security-Policy") !== 3) {
    errors.push("nginx must attach CSP to all three frontend domains");
  }

  for (const app of ["customer", "worker", "admin"]) {
    const marker = `server_name ${app}.\${XLB_DOMAIN};`;
    const start = nginx.indexOf(marker);
    if (start < 0) {
      errors.push(`nginx is missing the ${app} server`);
      continue;
    }
    const nextServer = nginx.indexOf("\nserver {", start + marker.length);
    const block = nginx.slice(start, nextServer < 0 ? nginx.length : nextServer);
    const websocket = block.indexOf("location = /api/support/realtime");
    const api = block.indexOf("location /api/ {");
    const frontend = block.indexOf("location / {");
    if (!(websocket >= 0 && api > websocket && frontend > api)) {
      errors.push(`${app} routing order must be exact WebSocket, /api/, then frontend fallback`);
    }
    requireToken(`${app} server`, block, `proxy_pass http://${app}:4173;`);
    requireToken(`${app} server`, block, "client_max_body_size 10m;");
  }

  const metricsStart = nginx.indexOf("location = /metrics");
  const metricsEnd = nginx.indexOf("}", metricsStart);
  const metrics = metricsStart >= 0 ? nginx.slice(metricsStart, metricsEnd + 1) : "";
  if (!metrics.includes("deny all;") || metrics.includes("proxy_pass")) {
    errors.push("public nginx /metrics must be denied without an upstream proxy");
  }

  for (const token of [
    "PROD_GATEWAY_IMAGE:?", "XLB_DOMAIN:?", "NGINX_ENVSUBST_FILTER",
    "production.conf.template:/etc/nginx/templates/default.conf.template:ro",
    "TLS_FULLCHAIN_SECRET_FILE:?", "TLS_PRIVATE_KEY_SECRET_FILE:?",
    "PROD_HTTP_BIND_ADDRESS:?", "PROD_HTTPS_BIND_ADDRESS:?",
    "uid=101,gid=101", "cap_add: [NET_BIND_SERVICE]",
  ]) requireToken("production compose", compose, token);

  for (const token of [
    "PROD_SMOKE_CITY_CODE", "PROD_SMOKE_SKU_ID", "PROD_SMOKE_ORDER_ID",
    "PROD_SMOKE_CUSTOMER_TOKEN_FILE", "/api/system/status", "/api/catalog",
    "/api/pricing/quote", "/api/support/realtime-ticket", "ClientWebSocket",
    "MaximumRedirection 0", "Content-Security-Policy", "debug-code route must return 404",
  ]) requireToken("production smoke", smoke, token);
  if (/Invoke-JsonPost\s+"[^"]*order/iu.test(smoke)) {
    errors.push("production smoke must not mutate orders");
  }
  for (const forbidden of ["/api/payments", "/api/refunds", "/api/settlements"]) {
    if (smoke.includes(forbidden)) errors.push(`production smoke must not call ${forbidden}`);
  }

  for (const token of [
    "XLB_DOMAIN=", "PROD_HTTP_BIND_ADDRESS=", "PROD_HTTPS_BIND_ADDRESS=",
    "TLS_FULLCHAIN_SECRET_FILE=", "TLS_PRIVATE_KEY_SECRET_FILE=", "PROD_GATEWAY_IMAGE=",
    "PROD_SMOKE_CITY_CODE=", "PROD_SMOKE_SKU_ID=", "PROD_SMOKE_ORDER_ID=",
    "PROD_SMOKE_CUSTOMER_TOKEN_FILE=",
  ]) requireToken("production env example", env, token);

  for (const token of ["PROD_GATEWAY_IMAGE", "TLS_FULLCHAIN_SECRET_FILE", "TLS_PRIVATE_KEY_SECRET_FILE"]) {
    requireToken("production deploy", deploy, token);
  }

  return errors;
}

export function runUnitBProductionEdgeCheck() {
  const errors = validateUnitBProductionEdge(loadUnitBSources());
  if (errors.length > 0) throw new Error(errors.join("\n"));
  process.stdout.write("check-unit-b-production-edge: passed\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runUnitBProductionEdgeCheck();
}
