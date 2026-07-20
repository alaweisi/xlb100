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
    helmIngress: read("deploy/helm/xlb/templates/ingress.yaml"),
    tkeProduction: read("deploy/environments/tke/values-production.yaml"),
    tkeStaging: read("deploy/environments/tke/values-staging.yaml"),
    frontendDocker: read("infra/docker/Dockerfile.frontend"),
    frontendServe: read("infra/docker/frontend-serve.json"),
    frontendServeStaging: read("infra/docker/frontend-serve.staging.json"),
    cloudBundle: read("deploy/tke/bundle/generate-cloud-bundle.mjs"),
  };
}

export function validateUnitBProductionEdge(sources) {
  const errors = [];
  const requireToken = (name, source, token) => {
    if (!source.includes(token)) errors.push(`${name} is missing: ${token}`);
  };

  const {
    nginx, compose, smoke, env, deploy, helmIngress, tkeProduction,
    tkeStaging, frontendDocker, frontendServe, frontendServeStaging, cloudBundle,
  } = sources;

  if (nginx.includes("__DOMAIN__")) errors.push("nginx still contains the legacy __DOMAIN__ placeholder");
  requireToken("nginx", nginx, "map $http_upgrade $xlb_connection_upgrade");
  requireToken("nginx", nginx, "proxy_set_header Connection $xlb_connection_upgrade;");
  requireToken("nginx", nginx, "proxy_buffering off;");
  requireToken("nginx", nginx, "/run/secrets/tls_fullchain");
  requireToken("nginx", nginx, "/run/secrets/tls_private_key");
  requireToken("nginx", nginx, "listen 80 default_server;");
  requireToken("nginx", nginx, "listen 443 ssl default_server;");
  requireToken("nginx", nginx, "return 444;");
  if (occurrences(nginx, "location = /api/support/realtime") !== 6) {
    errors.push("nginx must expose the exact WebSocket route on api and all five app domains");
  }
  if (occurrences(nginx, "location /api/ {") !== 5) {
    errors.push("nginx must expose same-origin /api/ on all five frontend domains");
  }
  if (occurrences(nginx, "Content-Security-Policy") !== 5) {
    errors.push("nginx must attach CSP to all five frontend domains");
  }

  for (const app of ["customer", "worker", "admin", "oa", "dashboard"]) {
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

  const frontendRangeStart = helmIngress.indexOf('{{- range $name := list "customer" "worker" "admin"');
  const frontendRangeEnd = helmIngress.indexOf("{{- end }}", frontendRangeStart);
  const frontendIngress = frontendRangeStart >= 0 && frontendRangeEnd > frontendRangeStart
    ? helmIngress.slice(frontendRangeStart, frontendRangeEnd)
    : "";
  const realtimePath = frontendIngress.indexOf("path: /api/support/realtime");
  const sameOriginApiPath = frontendIngress.indexOf("path: /api", realtimePath + 1);
  const frontendFallbackPath = frontendIngress.indexOf("path: /", sameOriginApiPath + 1);
  if (!(realtimePath >= 0 && sameOriginApiPath > realtimePath && frontendFallbackPath > sameOriginApiPath)) {
    errors.push("TKE frontend hosts must route realtime, /api, then frontend fallback");
  }
  if (occurrences(frontendIngress, 'name: {{ include "xlb.fullname" $ }}-backend') !== 2) {
    errors.push("TKE same-origin realtime and API routes must both target backend");
  }
  for (const [name, values] of [["production", tkeProduction], ["staging", tkeStaging]]) {
    requireToken(`TKE ${name} values`, values, "className: qcloud");
    requireToken(`TKE ${name} values`, values, "ingress.cloud.tencent.com/listen-ports");
    requireToken(`TKE ${name} values`, values, "ingress.cloud.tencent.com/auto-rewrite");
    requireToken(`TKE ${name} values`, values, "enabled: true");
  }
  requireToken("cloud bundle", cloudBundle, "ingress.cloud.tencent.com/listen-ports");
  requireToken("cloud bundle", cloudBundle, "ingress.cloud.tencent.com/auto-rewrite");

  requireToken("frontend image", frontendDocker, "serve@14.2.6");
  requireToken("frontend image", frontendDocker, "ARG FRONTEND_SERVE_CONFIG=infra/docker/frontend-serve.json");
  requireToken("frontend image", frontendDocker, "cp \"$FRONTEND_SERVE_CONFIG\" apps/$APP_NAME/dist/serve.json");
  try {
    const serveConfig = JSON.parse(frontendServe);
    const headers = Object.fromEntries((serveConfig.headers?.[0]?.headers ?? []).map(header => [header.key, header.value]));
    for (const name of [
      "Strict-Transport-Security", "Content-Security-Policy", "X-Content-Type-Options",
      "Referrer-Policy", "Permissions-Policy",
    ]) {
      if (!headers[name]) errors.push(`frontend image security policy is missing ${name}`);
    }
    if (!headers["Content-Security-Policy"]?.includes("connect-src 'self'")) {
      errors.push("frontend CSP must allow same-origin secure WebSocket connections");
    }
  } catch {
    errors.push("frontend image security policy must be valid JSON");
  }
  try {
    const serveConfig = JSON.parse(frontendServeStaging);
    const headers = Object.fromEntries((serveConfig.headers?.[0]?.headers ?? []).map(header => [header.key, header.value]));
    if (!headers["Content-Security-Policy"]?.includes("connect-src 'self'")) {
      errors.push("staging frontend CSP must allow same-origin API and WebSocket connections");
    }
    if (headers["Strict-Transport-Security"] || headers["Content-Security-Policy"]?.includes("upgrade-insecure-requests")) {
      errors.push("HTTP staging frontend policy must not force unavailable HTTPS");
    }
  } catch {
    errors.push("staging frontend security policy must be valid JSON");
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
