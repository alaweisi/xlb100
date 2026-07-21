export const HOME_AUTHORITY_SHA256 = "32cb6d243e8c7dd1b662110ebf2d9cfc79fe568ea23611097a4e4b2d6e3af74c";
export const HOME_AUTHORITY_PATH = "docs/design/ui/references/customer-home-visual-truth.png";
export const HOME_EVIDENCE_ROOT = "docs/design/ui/phase25/evidence/customer";
export const HOME_QA_ITERATION = "09";

export const HOME_CATEGORY_NAMES = Object.freeze([
  "家庭保洁",
  "家电清洗",
  "家电维修",
  "上门安装",
  "管道疏通",
  "开锁换锁",
  "水电维修",
  "防水补漏/精准测漏",
  "家具家居维修保养",
  "房屋修缮/局部改造",
  "搬家搬运/拆旧清运",
  "甲醛检测治理",
  "数码办公维修",
  "洗衣洗鞋",
  "保姆月嫂/照护",
  "四害消杀",
]);

export const HOME_CAPTURE_CASES = Object.freeze([
  { state: "available", width: 320, height: 844 },
  { state: "available", width: 390, height: 844 },
  { state: "partial", width: 390, height: 844 },
  { state: "available", width: 430, height: 932 },
]);

export function homeScreenshotName({ state, width, height }, iteration = HOME_QA_ITERATION) {
  return `customer-home-${state}-${width}x${height}-${iteration}.png`;
}

export function homeReportName({ state, width, height }, iteration = HOME_QA_ITERATION) {
  return `customer-home-${state}-${width}x${height}-${iteration}.report.json`;
}

export function homeComparisonName(iteration = HOME_QA_ITERATION) {
  return `customer-home-comparison-390x844-${iteration}.png`;
}

export function validateHomeQaReport(report, captureCase) {
  const errors = [];
  if (report.version !== "1.0.0") errors.push("report version must be 1.0.0");
  if (report.role !== "customer" || report.surface !== "home") errors.push("report role/surface mismatch");
  if (report.route !== "/customer/") errors.push("report route mismatch");
  if (report.state !== captureCase.state) errors.push("report state mismatch");
  if (report.viewport?.width !== captureCase.width || report.viewport?.height !== captureCase.height) {
    errors.push("report viewport mismatch");
  }
  if (report.authoritySha256 !== HOME_AUTHORITY_SHA256) errors.push("report authority hash mismatch");
  if (!String(report.screenshot ?? "").endsWith(homeScreenshotName(captureCase))) errors.push("report screenshot mismatch");
  if (!Array.isArray(report.consoleErrors)) errors.push("report consoleErrors must be an array");
  if (!Array.isArray(report.findings)) errors.push("report findings must be an array");
  if (!['passed', 'failed'].includes(report.result)) errors.push("report result mismatch");
  for (const key of [
    "primaryInteraction",
    "noHorizontalOverflow",
    "safeAreaClear",
    "keyboardFocus",
    "touchTargets",
    "reducedMotion",
    "forcedColors",
    "noBlurFallback",
  ]) {
    if (typeof report.checks?.[key] !== "boolean") errors.push(`report check missing: ${key}`);
  }
  return errors;
}
