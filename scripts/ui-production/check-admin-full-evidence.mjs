import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.join(root, "docs/design/ui/production-control/evidence/ADMIN-FULL");
const ledger = JSON.parse(await readFile(path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(evidenceDir, "manifest.json"), "utf8"));
const adminSlices = ledger.slices.filter((slice) => slice.terminal === "admin");
const target = adminSlices.filter((slice) => slice.batch !== "B0");
const requiredStages = ["entry", "result", "recovery"];
const expectedCarrierIds = Array.from({ length: 15 }, (_, index) => `A-${String(index).padStart(2, "0")}`);
const expectedSpecialKeys = ["GATE.identity", "GATE.city", "GATE.role-denied", "GATE.dispatch-denied", "SHELL.tools", "A-08.table", "A-01.conflict"];
const errors = [];

if (target.length !== 96) errors.push(`总账中运营应用非 B0 切片应为 96，实际为 ${target.length}`);
if (manifest.actualApp !== true) errors.push("manifest.actualApp 必须为 true");
if (manifest.surface !== "mobile-operations-app") errors.push("surface 必须为 mobile-operations-app");
if (manifest.browser !== "Microsoft Edge") errors.push("浏览器必须为 Microsoft Edge");
if (manifest.dedicatedPort !== 4317) errors.push("ADMIN-FULL 必须使用专用端口 4317");
if (manifest.contractInterception !== true) errors.push("必须记录契约态拦截");
if (manifest.externalProviderExecution !== false) errors.push("不得声明执行外部 Provider");
if (manifest.viewport?.width !== 390 || manifest.viewport?.height !== 844) errors.push("运营应用证据必须使用 390×844 手机视口");
if (manifest.orientation !== "portrait") errors.push("运营应用证据必须为竖屏");
if (manifest.minimumTouchTarget !== 44) errors.push("最小触控目标必须声明为 44px");
if (manifest.targetSliceCount !== target.length) errors.push(`manifest 目标数应为 ${target.length}，实际为 ${manifest.targetSliceCount}`);

const evidenceByKey = new Map(manifest.evidence.map((item) => [item.fileKey, item]));
for (const carrierId of expectedCarrierIds) {
  const base = evidenceByKey.get(`${carrierId}.base`);
  if (!base || base.stage !== "base") errors.push(`${carrierId} 缺少 mobile base 证据`);
  else {
    if (base.layout?.bottomNavigationItems !== 5) errors.push(`${carrierId}.base 缺少五项移动底栏`);
    if (carrierId === "A-02" && base.layout?.hasDetailBack !== true) errors.push("A-02.base 缺少详情返回按钮");
  }
  if (carrierId !== "A-00") {
    for (const stage of requiredStages) if (!evidenceByKey.has(`${carrierId}.${stage}`)) errors.push(`${carrierId} 缺少 ${stage} 画面`);
  }
}

for (const fileKey of expectedSpecialKeys) if (!evidenceByKey.has(fileKey)) errors.push(`缺少特殊移动证据 ${fileKey}`);
for (const fileKey of ["GATE.identity", "GATE.city", "GATE.role-denied", "GATE.dispatch-denied"]) {
  if (evidenceByKey.get(fileKey)?.layout?.hasGate !== true) errors.push(`${fileKey} 不是移动全屏 Gate`);
}
if (evidenceByKey.get("SHELL.tools")?.layout?.toolCount !== 14) errors.push("SHELL.tools 必须显示 14 个工作台");
if (!(evidenceByKey.get("A-08.table")?.layout?.labeledTableCells > 0) || evidenceByKey.get("A-08.table")?.layout?.unlabeledTableCells !== 0) errors.push("A-08.table 必须显示非空且每个字段带 data-label 的移动表格卡片");
if (evidenceByKey.get("A-01.conflict")?.layout?.hasConflictState !== true) errors.push("A-01.conflict 未显示冲突恢复状态");
if (!manifest.evidence.some((item) => item.stage === "entry" && item.layout?.hasLoadingState)) errors.push("证据集中缺少真实加载状态");
if (!manifest.evidence.some((item) => item.stage === "result" && item.layout?.hasEmptyState)) errors.push("证据集中缺少真实空结果状态");
if (!manifest.evidence.some((item) => item.stage === "recovery" && item.layout?.hasErrorState)) errors.push("证据集中缺少真实错误恢复状态");

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const item of manifest.evidence) {
  if (!Array.isArray(item.sliceIds) || item.sliceIds.length === 0) errors.push(`${item.fileKey} 缺少 sliceIds`);
  if (item.layout?.innerWidth !== 390 || item.layout?.innerHeight !== 844) errors.push(`${item.fileKey} 运行时视口不是 390×844`);
  if (item.layout?.documentScrollWidth !== 390 || item.layout?.bodyScrollWidth !== 390) errors.push(`${item.fileKey} 存在横向溢出`);
  if (!Array.isArray(item.layout?.touchViolations) || item.layout.touchViolations.length !== 0) errors.push(`${item.fileKey} 存在小于 44px 的触控目标`);
  try {
    const absolutePath = path.join(root, item.path);
    await access(absolutePath);
    const dimensions = pngDimensions(await readFile(absolutePath));
    if (!dimensions || dimensions.width !== 390 || dimensions.height !== 844) errors.push(`${item.fileKey} PNG 不是 390×844，实际为 ${dimensions ? `${dimensions.width}×${dimensions.height}` : "非 PNG"}`);
  } catch {
    errors.push(`${item.fileKey} 文件不存在：${item.path}`);
  }
}

const declaredPngNames = new Set(manifest.evidence.map((item) => path.basename(item.path)));
const diskPngNames = new Set((await readdir(evidenceDir)).filter((name) => name.endsWith(".png")));
for (const name of diskPngNames) if (!declaredPngNames.has(name)) errors.push(`目录混入 manifest 外旧截图：${name}`);
for (const name of declaredPngNames) if (!diskPngNames.has(name)) errors.push(`manifest 声明截图不存在：${name}`);
if (declaredPngNames.size !== 64 || diskPngNames.size !== 64) errors.push(`移动证据应为 64 张，manifest=${declaredPngNames.size}，目录=${diskPngNames.size}`);

const targetIds = new Set(target.map((slice) => slice.sliceId));
const coverage = Array.isArray(manifest.sliceCoverage) ? manifest.sliceCoverage : [];
const coverageIds = new Set(coverage.map((item) => item.sliceId));
if (coverage.length !== target.length || coverageIds.size !== target.length) errors.push(`sliceCoverage 应逐条且不重复记录 ${target.length} 条，实际为 ${coverage.length}/${coverageIds.size}`);

for (const slice of target) {
  const row = coverage.find((item) => item.sliceId === slice.sliceId);
  if (!row) {
    errors.push(`${slice.sliceId} 缺少 sliceCoverage`);
    continue;
  }
  if (row.carrierId !== slice.carrierId) errors.push(`${slice.sliceId} carrierId 应为 ${slice.carrierId}，实际为 ${row.carrierId}`);
  for (const stage of requiredStages) {
    if (typeof row[stage] !== "string" || !row[stage].endsWith(`${slice.carrierId}.${stage}.png`)) errors.push(`${slice.sliceId} 的 ${stage} 路径无效`);
    const evidence = manifest.evidence.find((item) => item.stage === stage && item.sliceIds.includes(slice.sliceId));
    if (!evidence) errors.push(`${slice.sliceId} 缺少 ${stage} 证据映射`);
  }
}
for (const row of coverage) if (!targetIds.has(row.sliceId)) errors.push(`sliceCoverage 含总账外编号：${row.sliceId}`);

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`ADMIN-FULL mobile evidence passed: 64 Edge screenshots, 15 mobile bases, 4 gates, 14 tools, labeled table cards, ${coverageIds.size}/${target.length} slices × entry/result/recovery.`);
