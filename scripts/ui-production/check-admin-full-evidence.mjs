import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ledger = JSON.parse(await readFile(path.join(root, "docs/design/ui/production-control/SLICE_IMPLEMENTATION_LEDGER.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "docs/design/ui/production-control/evidence/ADMIN-FULL/manifest.json"), "utf8"));
const target = ledger.slices.filter((slice) => slice.terminal === "admin" && slice.batch !== "B0");
const requiredStages = ["entry", "result", "recovery"];
const expectedCarrierIds = Array.from({ length: 15 }, (_, index) => `A-${String(index).padStart(2, "0")}`);
const errors = [];

if (target.length === 0) errors.push("总账中 admin 非 B0 切片为空");
if (manifest.actualApp !== true) errors.push("manifest.actualApp 必须为 true");
if (manifest.browser !== "Microsoft Edge") errors.push("浏览器必须为 Microsoft Edge");
if (manifest.dedicatedPort !== 4317) errors.push("ADMIN-FULL 必须使用专用端口 4317");
if (manifest.contractInterception !== true) errors.push("必须记录契约态拦截");
if (manifest.externalProviderExecution !== false) errors.push("不得声明执行外部 Provider");
if (manifest.viewport !== "1440×900") errors.push("后台证据必须使用 1440×900 桌面标准视口");
if (manifest.targetSliceCount !== target.length) errors.push(`manifest 目标数应为 ${target.length}，实际为 ${manifest.targetSliceCount}`);

for (const carrierId of expectedCarrierIds) {
  if (!manifest.evidence.some((item) => item.fileKey === `${carrierId}.base` && item.stage === "base")) errors.push(`${carrierId} 缺少 base 证据`);
}

for (const item of manifest.evidence) {
  if (!Array.isArray(item.sliceIds) || item.sliceIds.length === 0) errors.push(`${item.fileKey} 缺少 sliceIds`);
  try { await access(path.join(root, item.path)); } catch { errors.push(`${item.fileKey} 文件不存在：${item.path}`); }
}

const targetIds = new Set(target.map((slice) => slice.sliceId));
const coverage = Array.isArray(manifest.sliceCoverage) ? manifest.sliceCoverage : [];
const coverageIds = new Set(coverage.map((item) => item.sliceId));
if (coverage.length !== target.length || coverageIds.size !== target.length) {
  errors.push(`sliceCoverage 应逐条且不重复记录 ${target.length} 条，实际为 ${coverage.length} 条/${coverageIds.size} 个编号`);
}

for (const slice of target) {
  const row = coverage.find((item) => item.sliceId === slice.sliceId);
  if (!row) errors.push(`${slice.sliceId} 缺少 sliceCoverage`);
  else {
    if (row.carrierId !== slice.carrierId) errors.push(`${slice.sliceId} 的 carrierId 应为 ${slice.carrierId}，实际为 ${row.carrierId}`);
    for (const stage of requiredStages) {
      if (typeof row[stage] !== "string" || !row[stage].endsWith(`${slice.carrierId}.${stage}.png`)) errors.push(`${slice.sliceId} 的 ${stage} 路径无效`);
      else {
        try { await access(path.join(root, row[stage])); } catch { errors.push(`${slice.sliceId} 的 ${stage} 文件不存在：${row[stage]}`); }
      }
    }
  }
  for (const stage of requiredStages) {
    if (!manifest.evidence.some((item) => item.stage === stage && item.sliceIds.includes(slice.sliceId))) errors.push(`${slice.sliceId} 缺少 ${stage} 证据`);
  }
}

for (const row of coverage) {
  if (!targetIds.has(row.sliceId)) errors.push(`sliceCoverage 含总账外编号：${row.sliceId}`);
}
const coveredIds = new Set(manifest.evidence.flatMap((item) => item.sliceIds).filter((sliceId) => targetIds.has(sliceId)));
if (coveredIds.size !== target.length) errors.push(`admin 非 B0 覆盖应为 ${target.length}/${target.length}，实际为 ${coveredIds.size}/${target.length}`);

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`ADMIN-FULL evidence check passed: ${coveredIds.size}/${target.length} slices, entry/result/recovery complete, A-00–A-14 base complete.`);
