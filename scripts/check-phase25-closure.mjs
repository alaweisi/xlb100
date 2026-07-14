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
const phase28DecisionPath = join(root, "docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md");
const phase28MigrationPath = join(root, "db/migrations/056_phase28_review_reputation.sql");
const phase28Authorized =
  currentState.includes("Phase 27 | LOCKED") &&
  existsSync(phase28DecisionPath) &&
  readFileSync(phase28DecisionPath, "utf8").includes("HUMAN APPROVED") &&
  existsSync(phase28MigrationPath);
const phase28RuntimeFiles = new Set([
  "backend/src/events/eventOutbox.ts",
  "backend/src/events/platformDeliveryRepository.ts",
  "backend/src/events/platformDeliveryService.ts",
  "backend/src/events/platformEventCompatibility.ts",
  "backend/src/order/orderTraceRoutes.ts",
  "backend/src/review/orderReviewRepository.ts",
  "backend/src/review/orderReviewRoutes.ts",
  "backend/src/review/orderReviewService.ts",
  "backend/src/review/reputationProjectionWorker.ts",
  "backend/src/review/reputationRepository.ts",
  "backend/src/review/reputationService.ts",
  "backend/src/review/reviewModerationRepository.ts",
  "backend/src/review/reviewModerationService.ts",
  "backend/src/review/reviewQueueCursorPolicy.ts",
  "db/migrations/056_phase28_review_reputation.sql",
  "packages/api-client/src/admin.ts",
  "packages/api-client/src/customer.ts",
  "packages/api-client/src/index.ts",
  "packages/api-client/src/reviewReputation.ts",
  "packages/api-client/src/worker.ts",
]);
const phase29MigrationPath = join(root, "db/migrations/057_phase29_marketing_coupon.sql");
const phase29EntryPath = join(root, "docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md");
const phase29ArchitecturePath = join(root, "docs/architecture/29_XLB_MARKETING_COUPON.md");
const phase29ContractPath = join(root, "docs/contracts/CONTRACT_MARKETING_COUPON.md");
const phase29RegistryPath = join(root, "docs/governance/phase-registry.json");
const phase29Authorized =
  currentState.includes("Phase 29 — Marketing / Coupon MVP (IN PROGRESS)") &&
  currentState.includes("D01–D24") &&
  existsSync(phase29EntryPath) &&
  readFileSync(phase29EntryPath, "utf8").includes("Every row below is **HUMAN APPROVED**") &&
  readFileSync(phase29EntryPath, "utf8").includes("| D24 |") &&
  existsSync(phase29ArchitecturePath) &&
  readFileSync(phase29ArchitecturePath, "utf8").includes("ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED") &&
  existsSync(phase29ContractPath) &&
  readFileSync(phase29ContractPath, "utf8").includes("Phase 29 human-approved contract") &&
  existsSync(phase29RegistryPath) &&
  readFileSync(phase29RegistryPath, "utf8").includes("Entry decisions D01-D24 are approved for continuous construction through independent acceptance.") &&
  existsSync(phase29MigrationPath) &&
  existsSync(phase29ContractPath);
const phase29RuntimePatterns = [
  /^backend\/src\/marketing\/(?:[A-Za-z0-9]+\.ts|README\.md)$/,
  /^backend\/src\/app\.ts$/,
  /^backend\/src\/enterprise\/enterpriseService\.ts$/,
  /^backend\/src\/events\/(?:eventOutbox|platformDeliveryService|platformEventCompatibility)\.ts$/,
  /^backend\/src\/order\/(?:orderRepository|orderRoutes|orderService|orderTraceRoutes)\.ts$/,
  /^backend\/src\/pricing\/pricingRepository\.ts$/,
  /^db\/migrations\/057_phase29_marketing_coupon\.sql$/,
  /^db\/dictionary\/(?:TABLES|CITY_CODE_COLUMNS|SHARDING_KEYS)\.md$/,
  /^packages\/api-client\/src\/(?:admin|customer|index|marketing|responseValidators)\.ts$/,
];
for (const file of changed) {
  if (["backend/", "db/", "deploy/", "infra/", "packages/api-client/"].some((prefix) => file.startsWith(prefix))) {
    if (phase29Authorized && phase29RuntimePatterns.some((pattern) => pattern.test(file))) continue;
    if (phase28Authorized && phase28RuntimeFiles.has(file)) continue;
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
const migration056 = readdirSync(join(root, "db/migrations")).filter((name) => /^056[_-].*\.sql$/i.test(name));
if (
  migration056.length > 0 &&
  (!phase28Authorized || migration056.length !== 1 || migration056[0] !== "056_phase28_review_reputation.sql")
) {
  throw new Error("[phase25-closure] unauthorized migration 056 is forbidden");
}
const migration057 = readdirSync(join(root, "db/migrations")).filter((name) => /^057[_-].*\.sql$/i.test(name));
if (
  migration057.length > 0 &&
  (!phase29Authorized || migration057.length !== 1 || migration057[0] !== "057_phase29_marketing_coupon.sql")
) {
  throw new Error("[phase25-closure] unauthorized migration 057 is forbidden");
}
process.stdout.write("[phase25-closure] PASS aggregate scope, evidence artifacts, and OA/Dashboard truthfulness verified\n");
