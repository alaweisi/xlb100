import assert from "node:assert/strict";
import test from "node:test";
import {
  loadUnitBSources,
  validateUnitBProductionEdge,
} from "./check-unit-b-production-edge.mjs";

test("accepts the checked-in Unit B production edge contract", () => {
  assert.deepEqual(validateUnitBProductionEdge(loadUnitBSources()), []);
});

test("rejects a frontend domain without same-origin API routing", () => {
  const sources = loadUnitBSources();
  const marker = "server_name customer.${XLB_DOMAIN};";
  const start = sources.nginx.indexOf(marker);
  const end = sources.nginx.indexOf("\nserver {", start + marker.length);
  const block = sources.nginx.slice(start, end).replace("location /api/ {", "location /broken-api/ {");
  sources.nginx = sources.nginx.slice(0, start) + block + sources.nginx.slice(end);
  assert.match(validateUnitBProductionEdge(sources).join("\n"), /same-origin|customer routing order/u);
});

test("rejects a WebSocket route without the upgrade connection contract", () => {
  const sources = loadUnitBSources();
  sources.nginx = sources.nginx.replaceAll(
    "proxy_set_header Connection $xlb_connection_upgrade;",
    "proxy_set_header Connection close;",
  );
  assert.match(validateUnitBProductionEdge(sources).join("\n"), /Connection/u);
});

test("rejects a smoke scaffold that mutates orders", () => {
  const sources = loadUnitBSources();
  sources.smoke += '\nInvoke-JsonPost "create order" "/api/orders" @{} @{}\n';
  assert.match(validateUnitBProductionEdge(sources).join("\n"), /must not mutate orders/u);
});

test("rejects a production compose file without a gateway", () => {
  const sources = loadUnitBSources();
  sources.compose = sources.compose.replace("PROD_GATEWAY_IMAGE:?", "REMOVED_GATEWAY_IMAGE:?");
  assert.match(validateUnitBProductionEdge(sources).join("\n"), /PROD_GATEWAY_IMAGE/u);
});

test("rejects TKE frontend hosts without same-origin WebSocket routing", () => {
  const sources = loadUnitBSources();
  sources.helmIngress = sources.helmIngress.replace("path: /api/support/realtime", "path: /broken-realtime");
  assert.match(validateUnitBProductionEdge(sources).join("\n"), /TKE frontend hosts/u);
});

test("rejects a frontend image without CSP", () => {
  const sources = loadUnitBSources();
  sources.frontendServe = sources.frontendServe.replace("Content-Security-Policy", "Removed-Security-Policy");
  assert.match(validateUnitBProductionEdge(sources).join("\n"), /Content-Security-Policy/u);
});
