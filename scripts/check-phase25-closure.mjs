import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "docs/reports/PHASE25_GATE1DEF_SHARED_FOUNDATION_REPORT.md",
  "docs/reports/PHASE25_CUSTOMER_GATE2_GATE3_AUDIT.md",
  "docs/reports/PHASE25_GATE4_GATE5_WORKER_ADMIN_AUDIT.md",
  "docs/reports/PHASE25_GATE6_OA_READINESS_REPORT.md",
  "docs/reports/PHASE25_GATE7_DASHBOARD_READINESS_REPORT.md",
  "scripts/check-phase25-gate1def.mjs",
  "scripts/check-phase25-readiness-gates.mjs",
];
for (const file of required) if (!existsSync(join(root, file))) throw new Error(`[phase25-closure] missing ${file}`);
for (const app of ["oa", "dashboard"]) if (existsSync(join(root, "apps", app, "src"))) throw new Error(`[phase25-closure] forbidden fake ${app} runtime`);
const changed = [
  ...execFileSync("git", ["diff", "--name-only", "fb055b1"], { cwd: root, encoding: "utf8" }).split(/\r?\n/),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split(/\r?\n/),
].filter(Boolean).map((file) => file.replaceAll("\\", "/"));
const currentState = readFileSync(join(root, "docs/CURRENT_STATE.md"), "utf8");
const phase27aRuntimeAuthorized =
  currentState.includes("Phase27A Platform Delivery Foundation") &&
  (currentState.includes("RUNTIME ENTRY AUTHORIZED") ||
    currentState.includes("HUMAN ACCEPTED — NOT LOCKED"));
const phase27aRuntimeFiles = new Set([
  "backend/src/events/platformDeliveryPolicy.ts",
  "backend/src/events/platformEventCompatibility.ts",
  "backend/src/events/platformDeliveryRepository.ts",
  "backend/src/events/platformDeliveryService.ts",
  "db/migrations/054_phase27a_platform_delivery_foundation.sql",
]);
const phase27bB1Authorized =
  currentState.includes("Phase 27B | B1 IMPLEMENTED") ||
  currentState.includes("Phase 27B | B1 ACCEPTED") ||
  currentState.includes("Phase 27B | B2 IMPLEMENTED") ||
  currentState.includes("Phase 27B | B2/C/D ACCEPTED") ||
  currentState.includes("Phase 27 | LOCKED");
const phase27bB1RuntimeFiles = new Set([
  ...phase27aRuntimeFiles,
  "backend/src/notification/notificationProjectionPolicy.ts",
  "backend/src/notification/notificationRepository.ts",
  "backend/src/notification/notificationService.ts",
  "db/migrations/055_phase27b_notification_projection_foundation.sql",
]);
const phase27Continuation = currentState.includes("Phase 27B | B2 IMPLEMENTED") ||
  currentState.includes("Phase 27B | B2/C/D ACCEPTED") ||
  currentState.includes("Phase 27 | LOCKED");
const phase27ContinuationPatterns = [
  /^backend\/src\/events\/platform(?:DeliveryPolicy|EventCompatibility|DeliveryRepository|DeliveryService)\.ts$/,
  /^backend\/src\/notification\/[A-Za-z0-9]+\.ts$/,
  /^backend\/src\/routes\/notificationRoutes\.ts$/,
  /^backend\/src\/app\.ts$/,
  /^packages\/api-client\/src\/(?:index|customer|worker|notification)\.ts$/,
  /^db\/migrations\/05[45]_[a-z0-9_]+\.sql$/,
];
for (const file of changed) {
  if (["backend/", "db/", "deploy/", "infra/", "packages/api-client/"].some((prefix) => file.startsWith(prefix))) {
    if (phase27Continuation && phase27ContinuationPatterns.some((pattern) => pattern.test(file))) continue;
    if (phase27bB1Authorized && phase27bB1RuntimeFiles.has(file)) continue;
    if (phase27aRuntimeAuthorized && phase27aRuntimeFiles.has(file)) continue;
    throw new Error(`[phase25-closure] prohibited change: ${file}`);
  }
}
const migration054 = readdirSync(join(root, "db/migrations")).filter((name) => /^054[_-].*\.sql$/i.test(name));
if (
  migration054.length > 0 &&
  (!phase27aRuntimeAuthorized || migration054.length !== 1 || migration054[0] !== "054_phase27a_platform_delivery_foundation.sql")
) {
  throw new Error("[phase25-closure] unauthorized migration 054 is forbidden");
}
const migration055 = readdirSync(join(root, "db/migrations")).filter((name) => /^055[_-].*\.sql$/i.test(name));
if (
  migration055.length > 0 &&
  (!phase27bB1Authorized || migration055.length !== 1 || migration055[0] !== "055_phase27b_notification_projection_foundation.sql")
) {
  throw new Error("[phase25-closure] unauthorized migration 055 is forbidden");
}
process.stdout.write("[phase25-closure] PASS aggregate scope, evidence artifacts, and OA/Dashboard truthfulness verified\n");
