import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

export const MANIFEST_PATH = "docs/design/ui/phase25/evidence/customer/qa-manifest.json";

const EXPECTED_ROUTES = new Map([
  ["home", "/customer/"],
  ["services", "/customer/services"],
  ["order-create", "/customer/order/create"],
  ["orders", "/customer/orders"],
  ["aftersale", "/customer/aftersale"],
  ["support", "/customer/support"],
  ["notifications", "/customer/notifications"],
  ["coupons", "/customer/coupons"],
  ["profile", "/customer/profile"],
]);

const EXPECTED_VIEWPORTS = new Map([
  ["narrow-320", [320, 844, "default"]],
  ["target-390x844", [390, 844, "default-and-risk"]],
  ["wide-430", [430, 932, "default"]],
]);

const REQUIRED_CHECKS = [
  "authority-hash",
  "primary-interaction",
  "console-errors",
  "no-horizontal-overflow",
  "safe-area-clear",
  "keyboard-focus",
  "touch-targets",
  "reduced-motion",
  "forced-colors",
  "no-blur-fallback",
];

function normalizedPath(value) {
  return value.replaceAll("\\", "/");
}

export function loadCustomerUiQaManifest(root = process.cwd()) {
  return JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8"));
}

export function evidenceFileName(surface, state, viewport, iteration = "01") {
  return `customer-${surface}-${state}-${viewport.width}x${viewport.height}-${iteration}.png`;
}

export function buildCapturePlan(manifest, iteration = "01") {
  return manifest.surfaces.flatMap((surface) => manifest.viewports.flatMap((viewport) => {
    const states = viewport.capture === "default-and-risk"
      ? [surface.defaultState, surface.riskState]
      : [surface.defaultState];
    return states.map((state) => {
      const fileName = evidenceFileName(surface.id, state, viewport, iteration);
      return {
        surface: surface.id,
        route: surface.route,
        state,
        viewport: viewport.id,
        width: viewport.width,
        height: viewport.height,
        fileName,
        evidencePath: posix.join(manifest.evidenceRoot, fileName),
      };
    });
  }));
}

export function validateCustomerUiQaInfrastructure(root, manifest) {
  const errors = [];
  if (manifest.version !== "1.0.0") errors.push(`unsupported manifest version: ${manifest.version}`);
  if (manifest.role !== "customer") errors.push(`role must be customer: ${manifest.role}`);
  if (manifest.evidenceRoot !== "docs/design/ui/phase25/evidence/customer") {
    errors.push(`unexpected evidence root: ${manifest.evidenceRoot}`);
  }
  if (manifest.reportSchema !== "docs/design/ui/phase25/evidence/customer/qa-report.schema.json") {
    errors.push(`unexpected report schema: ${manifest.reportSchema}`);
  }
  if (manifest.filePattern !== "customer-{surface}-{state}-{width}x{height}-{iteration}.png") {
    errors.push(`unexpected file pattern: ${manifest.filePattern}`);
  }

  const checks = new Set(manifest.requiredChecks ?? []);
  for (const check of REQUIRED_CHECKS) if (!checks.has(check)) errors.push(`missing required check: ${check}`);
  if (checks.size !== REQUIRED_CHECKS.length) errors.push("required checks contain duplicates or unapproved entries");

  const authorityPath = join(root, manifest.authority?.path ?? "");
  if (!existsSync(authorityPath)) {
    errors.push(`missing authority image: ${manifest.authority?.path}`);
  } else {
    const actualHash = createHash("sha256").update(readFileSync(authorityPath)).digest("hex");
    if (actualHash !== manifest.authority.sha256) errors.push(`authority hash mismatch: ${actualHash}`);
  }

  const viewportIds = new Set();
  for (const viewport of manifest.viewports ?? []) {
    if (viewportIds.has(viewport.id)) errors.push(`duplicate viewport: ${viewport.id}`);
    viewportIds.add(viewport.id);
    const expected = EXPECTED_VIEWPORTS.get(viewport.id);
    if (!expected || expected[0] !== viewport.width || expected[1] !== viewport.height || expected[2] !== viewport.capture) {
      errors.push(`unexpected viewport contract: ${viewport.id}`);
    }
  }
  if (viewportIds.size !== EXPECTED_VIEWPORTS.size) errors.push(`expected 3 viewports, got ${viewportIds.size}`);

  const surfaceIds = new Set();
  const routes = new Set();
  const cards = new Set();
  for (const surface of manifest.surfaces ?? []) {
    if (surfaceIds.has(surface.id)) errors.push(`duplicate surface: ${surface.id}`);
    if (routes.has(surface.route)) errors.push(`duplicate route: ${surface.route}`);
    if (cards.has(surface.pageCard)) errors.push(`duplicate page card: ${surface.pageCard}`);
    surfaceIds.add(surface.id);
    routes.add(surface.route);
    cards.add(surface.pageCard);

    if (EXPECTED_ROUTES.get(surface.id) !== surface.route) errors.push(`unexpected route for ${surface.id}: ${surface.route}`);
    if (!surface.route.startsWith("/customer/")) errors.push(`non-customer route: ${surface.route}`);
    if (!surface.defaultState || !surface.riskState || surface.defaultState === surface.riskState) {
      errors.push(`surface requires distinct default/risk states: ${surface.id}`);
    }
    if (!/^[a-z0-9-]+$/.test(surface.defaultState) || !/^[a-z0-9-]+$/.test(surface.riskState)) {
      errors.push(`state names must be filename-safe: ${surface.id}`);
    }

    const pageCardPath = join(root, surface.pageCard);
    if (!existsSync(pageCardPath)) {
      errors.push(`missing page card: ${surface.pageCard}`);
    } else {
      const pageCard = readFileSync(pageCardPath, "utf8");
      if (!pageCard.includes(`| route / role | \`${surface.route}\` / customer |`)) {
        errors.push(`page card route/role mismatch: ${surface.pageCard}`);
      }
    }
  }
  if (surfaceIds.size !== EXPECTED_ROUTES.size) errors.push(`expected 9 surfaces, got ${surfaceIds.size}`);
  for (const id of EXPECTED_ROUTES.keys()) if (!surfaceIds.has(id)) errors.push(`missing surface: ${id}`);

  const evidenceRoot = join(root, manifest.evidenceRoot ?? "");
  if (!existsSync(evidenceRoot)) errors.push(`missing evidence root: ${manifest.evidenceRoot}`);
  const reportSchemaPath = join(root, manifest.reportSchema ?? "");
  if (!existsSync(reportSchemaPath)) {
    errors.push(`missing report schema: ${manifest.reportSchema}`);
  } else {
    const reportSchema = JSON.parse(readFileSync(reportSchemaPath, "utf8"));
    if (reportSchema.$id !== "customer-ui-qa-report.schema.json") errors.push("unexpected QA report schema id");
    if (!reportSchema.properties?.result?.enum?.includes("passed") || !reportSchema.properties?.result?.enum?.includes("failed")) {
      errors.push("QA report schema must support passed and failed results");
    }
    const severities = reportSchema.properties?.findings?.items?.properties?.severity?.enum;
    if (JSON.stringify(severities) !== JSON.stringify(["P0", "P1", "P2", "P3"])) {
      errors.push("QA report schema must freeze P0-P3 severity order");
    }
  }

  const plan = buildCapturePlan(manifest);
  const files = new Set(plan.map((item) => item.fileName));
  if (plan.length !== 36 || files.size !== 36) errors.push(`expected 36 unique captures, got ${plan.length}/${files.size}`);
  for (const item of plan) {
    if (!/^customer-[a-z0-9-]+-[a-z0-9-]+-(320x844|390x844|430x932)-\d{2}\.png$/.test(item.fileName)) {
      errors.push(`invalid evidence filename: ${item.fileName}`);
    }
    if (normalizedPath(item.evidencePath) !== item.evidencePath) errors.push(`evidence path must be POSIX: ${item.evidencePath}`);
  }

  return errors;
}

export function missingEvidence(root, plan) {
  return plan.filter((item) => !existsSync(join(root, item.evidencePath)));
}
