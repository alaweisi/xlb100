import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectMetrics,
  EXPECTED,
  parseBindings,
  ratchetErrors,
  readJson,
  releaseErrors,
  scanVisibleLanguage,
  syncLedger,
  validateProgression,
  validateStructure,
  writeJson,
} from "./control-lib.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docsDir = path.join(rootDir, "docs/design/ui/production-control");
const ledgerFile = path.join(docsDir, "SLICE_IMPLEMENTATION_LEDGER.json");
const baselineFile = path.join(docsDir, "UI_PRODUCTION_RATCHET_BASELINE.json");
const languageFile = path.join(docsDir, "UI_LANGUAGE_VIOLATIONS.json");
const reportFile = path.join(docsDir, "UI_PRODUCTION_BASELINE_REPORT.md");
const consoleFile = path.join(docsDir, "SLICE_ACCEPTANCE_CONSOLE.html");
const allowlistFile = path.join(rootDir, "scripts/ui-production/ui-language-allowlist.json");
const bindingFile = path.join(rootDir, "docs/design/ui/vertical-slices/FRAME_MAP_SLICE_BINDINGS.md");
const scopeFile = path.join(rootDir, "docs/design/ui/vertical-slices/SLICE_SCOPE_BASELINE.md");

function loadParsed() {
  return parseBindings(fs.readFileSync(bindingFile, "utf8"), fs.readFileSync(scopeFile, "utf8"));
}

function loadAudit() {
  const parsed = loadParsed();
  const ledger = readJson(ledgerFile);
  const allowlist = readJson(allowlistFile);
  const languageViolations = scanVisibleLanguage(rootDir, allowlist);
  const structureErrors = [...validateStructure(ledger, parsed), ...validateProgression(rootDir, ledger)];
  const metrics = collectMetrics(rootDir, ledger, languageViolations);
  return { parsed, ledger, languageViolations, structureErrors, metrics };
}

function markdownReport(audit) {
  const { metrics, structureErrors, languageViolations, ledger } = audit;
  const terminalRows = Object.entries(EXPECTED.terminals)
    .map(([terminal, count]) => `| ${terminal} | ${count} |`)
    .join("\n");
  const firstViolations = languageViolations.slice(0, 30)
    .map((item) => `- \`${item.file}:${item.line}\`：${item.text}`)
    .join("\n") || "- 无";
  return `# XLB UI 生产总控基线报告

> 本报告只陈述可验证事实。\`DEFINED\` 不等于已实现，控制台可打开不等于商业切片已交付。

## 总体状态

| 指标 | 当前值 | 发布要求 |
| --- | ---: | ---: |
| 正式切片 | ${metrics.sliceCount} | 214 |
| Carrier | ${metrics.carrierCount} | 36 |
| 顶层画面计划 | ${ledger.framePlan.total} | 104 |
| 中文完成 | ${metrics.localizedCount} | 214 |
| 真实商业链路资料完整 | ${metrics.businessReadyCount} | 214 |
| Edge 证据完整 | ${metrics.evidenceReadyCount} | 214 |
| Base Frame 已验收 | ${metrics.baseAcceptedCount} | 36 |
| 最终 ACCEPTED | ${metrics.acceptedCount} | 214 |
| 可见英文违规 | ${metrics.languageViolationCount} | 0 |

## 三端范围

| 端 | 切片数 |
| --- | ---: |
${terminalRows}

## 四道门禁

1. **全中文**：${metrics.languageViolationCount === 0 && metrics.localizedCount === 214 ? "通过" : "未通过"}。
2. **214 条可追踪并最终验收**：${metrics.acceptedCount === 214 ? "通过" : "未通过"}。
3. **全量效果可查看**：${metrics.evidenceReadyCount === 214 && metrics.baseAcceptedCount === 36 ? "通过" : "未通过"}。
4. **真实商业 App**：${metrics.businessReadyCount === 214 ? "通过" : "未通过"}。

## 结构错误

${structureErrors.length ? structureErrors.map((item) => `- ${item}`).join("\n") : "- 无。214 条绑定与机器总账结构一致。"}

## 首批可见英文债务（最多显示 30 条）

${firstViolations}

完整清单：\`UI_LANGUAGE_VIOLATIONS.json\`。
`;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function consoleHtml(audit) {
  const { ledger, metrics } = audit;
  const data = JSON.stringify({ metrics, carriers: ledger.carriers, slices: ledger.slices }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>喜乐帮三端切片验收控制台</title>
  <style>
    :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:#f5f3ef;color:#211c17}
    *{box-sizing:border-box}body{margin:0}.shell{max-width:1600px;margin:auto;padding:28px}.hero{background:#201a2c;color:#fff;border-radius:28px;padding:28px;box-shadow:0 20px 56px #1d162429}.hero h1{margin:0 0 8px;font-size:28px}.hero p{margin:0;color:#d8d0e2}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}.metric{background:#fff;border:1px solid #e2ddd6;border-radius:18px;padding:16px}.metric strong{display:block;font-size:26px}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.controls input,.controls select,.controls button{min-height:44px;border:1px solid #cfc7bd;border-radius:12px;padding:0 12px;background:#fff}.controls button{cursor:pointer}.controls input{min-width:320px;flex:1}.page-info{align-self:center;min-width:120px;text-align:center}.notice{border-left:4px solid #d97706;background:#fff7e8;padding:14px 16px;border-radius:12px;margin:18px 0}.table-wrap{overflow:auto;background:#fff;border:1px solid #e2ddd6;border-radius:20px}table{width:100%;border-collapse:collapse;min-width:1180px}th,td{padding:12px;text-align:left;border-bottom:1px solid #eee8e1;vertical-align:top}th{position:sticky;top:0;background:#f6f1eb}.status{display:inline-block;border-radius:999px;padding:3px 9px;background:#eee8f4}.status.ACCEPTED{background:#dff4e8;color:#116536}.bad{color:#b42318}.good{color:#116536}a{color:#315ec9}</style>
</head>
<body><main class="shell">
  <section class="hero"><h1>喜乐帮三端切片验收控制台</h1><p>这是实际 App 的生产验收索引，不是第四端，也不复制 Demo 页面。只有真实路由、API、测试和 Edge 证据齐备的切片才能验收。</p></section>
  <section class="metrics" id="metrics"></section>
  <div class="notice">当前控制台只显示事实与缺口。没有证据的切片会保持红灯，不使用占位截图冒充完成。</div>
  <section class="controls"><input id="query" type="search" placeholder="按切片编号、承载容器或业务场景搜索"><select id="terminal"><option value="">全部端</option><option value="customer">顾客端</option><option value="worker">师傅端</option><option value="admin">后台</option></select><select id="batch"><option value="">全部批次</option>${[0,1,2,3,4,5].map((n)=>`<option value="B${n}">B${n}</option>`).join("")}</select><select id="status"><option value="">全部状态</option><option value="DEFINED">已定义</option><option value="READY">可施工</option><option value="IMPLEMENTED">已实现</option><option value="API_INTEGRATED">已接入接口</option><option value="TESTED">已测试</option><option value="EDGE_VERIFIED">Edge 已验</option><option value="ACCEPTED">已验收</option></select><button id="prev" type="button">上一页</button><span class="page-info" id="pageInfo"></span><button id="next" type="button">下一页</button></section>
  <div class="table-wrap"><table><thead><tr><th>切片编号</th><th>端/批次</th><th>承载容器与场景</th><th>当前状态</th><th>真实页面/接口</th><th>中文</th><th>Edge 证据</th><th>测试/验收</th></tr></thead><tbody id="rows"></tbody></table></div>
</main><script>
const model=${data};
const metrics=[['正式切片',model.metrics.sliceCount+'/214'],['顶层画面计划','104'],['中文完成',model.metrics.localizedCount+'/214'],['真实业务完整',model.metrics.businessReadyCount+'/214'],['Edge证据',model.metrics.evidenceReadyCount+'/214'],['最终验收',model.metrics.acceptedCount+'/214'],['可见英文',model.metrics.languageViolationCount]];
document.querySelector('#metrics').innerHTML=metrics.map(([k,v])=>'<div class="metric"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
const escape=value=>String(value??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const terminalName={customer:'顾客端',worker:'师傅端',admin:'后台'};const statusName={DEFINED:'已定义',READY:'可施工',IMPLEMENTED:'已实现',API_INTEGRATED:'已接入接口',TESTED:'已测试',EDGE_VERIFIED:'Edge 已验',ACCEPTED:'已验收'};const expressionName={GATE:'身份/权限门禁',STATE_FRAME:'完整状态画面',REGION:'页面区域',OVERLAY:'操作浮层'};
let page=0;const pageSize=40;
function render(){const q=document.querySelector('#query').value.trim().toLowerCase();const terminal=document.querySelector('#terminal').value;const batch=document.querySelector('#batch').value;const status=document.querySelector('#status').value;const filtered=model.slices.filter(x=>(!terminal||x.terminal===terminal)&&(!batch||x.batch===batch)&&(!status||x.status===status)&&(!q||JSON.stringify(x).toLowerCase().includes(q)));const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pageCount-1);const items=filtered.slice(page*pageSize,(page+1)*pageSize);document.querySelector('#pageInfo').textContent='第 '+(page+1)+' / '+pageCount+' 页 · '+filtered.length+' 条';document.querySelector('#prev').disabled=page===0;document.querySelector('#next').disabled=page>=pageCount-1;document.querySelector('#rows').innerHTML=items.map(x=>{const evidence=(x.edgeEvidence||[]).map(e=>'<a href="../../../../'+escape(e.file)+'">Edge截图</a>').join('、')||'<span class="bad">缺失</span>';const sources=(x.implementation?.sourceFiles||[]).map(file=>escape(file)).join('<br>')||'<span class="bad">未绑定</span>';const tests=(x.tests||[]).map(t=>escape(typeof t==='string'?t:t.file)).join('<br>')||'<span class="bad">未绑定</span>';return '<tr><td><strong>'+escape(x.sliceId)+'</strong><br>'+escape(expressionName[x.expression]||x.expression)+'</td><td>'+escape(terminalName[x.terminal]||x.terminal)+'<br>'+escape(x.batch)+'</td><td>'+escape(x.carrierId)+' '+escape(x.carrierName)+'<br><small>'+escape(x.designPath)+'</small></td><td><span class="status '+escape(x.status)+'">'+escape(statusName[x.status]||x.status)+'</span></td><td>'+escape(x.implementation?.route||'未绑定')+'<br>'+sources+'</td><td class="'+(x.localization?.status==='COMPLETE'?'good':'bad')+'">'+(x.localization?.status==='COMPLETE'?'完成':'待完成')+'</td><td>'+evidence+'</td><td>'+tests+'<br>'+escape(x.acceptance?.acceptedBy||'未验收')+'</td></tr>'}).join('');}
for(const id of ['query','terminal','batch','status'])document.querySelector('#'+id).addEventListener('input',()=>{page=0;render()});document.querySelector('#prev').addEventListener('click',()=>{page-=1;render()});document.querySelector('#next').addEventListener('click',()=>{page+=1;render()});render();
</script></body></html>`;
}

function consoleHtmlV2(audit) {
  const { ledger, metrics } = audit;
  const data = JSON.stringify({ metrics, carriers: ledger.carriers, slices: ledger.slices }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>喜乐帮三端 UI 生产验收台</title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#211d19;background:#f2f0ec}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8f6f2,#eeeae4)}button,input,select{font:inherit}.shell{max-width:1560px;margin:auto;padding:32px}.hero{display:flex;justify-content:space-between;gap:24px;align-items:end;background:#201a2c;color:#fff;border-radius:30px;padding:32px;box-shadow:0 22px 58px #1d162429}.hero h1{margin:0 0 10px;font-size:30px}.hero p{max-width:850px;margin:0;color:#d8d0e2;line-height:1.65}.badge{white-space:nowrap;border:1px solid #ffffff38;border-radius:999px;padding:9px 14px;background:#ffffff12}.metrics{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:12px;margin:18px 0}.metric{background:#fff;border:1px solid #e2ddd6;border-radius:18px;padding:16px}.metric span{color:#726a61;font-size:13px}.metric strong{display:block;margin-top:5px;font-size:26px}.notice{border:1px solid #ecd6a7;background:#fff8e8;padding:14px 16px;border-radius:14px;margin:18px 0;color:#68480d}.section{margin:30px 0}.head{margin-bottom:14px}.head h2{margin:0 0 4px;font-size:23px}.head p{margin:0;color:#726a61}.base-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.base-card,.slice-card{background:#fff;border:1px solid #ded8d0;border-radius:22px;overflow:hidden;box-shadow:0 14px 36px #4936210e}.preview{display:block;background:#dedad4;aspect-ratio:16/10;overflow:hidden}.preview img{width:100%;height:100%;object-fit:cover;object-position:top}.base-card.mobile .preview img{object-fit:contain}.copy{padding:16px}.copy h3{margin:8px 0 6px}.copy p{margin:0;color:#726a61;font-size:13px;line-height:1.55}.slice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.slice-card{padding:18px}.slice-title{display:flex;justify-content:space-between;gap:12px}.slice-title h3{margin:0;font-size:17px}.slice-title small{display:block;color:#786f66;margin-top:5px}.status{display:inline-block;white-space:nowrap;border-radius:999px;padding:5px 9px;background:#eee8f4;color:#5e4776;font-size:12px}.status.EDGE_VERIFIED,.status.ACCEPTED{background:#dff4e8;color:#116536}.evidence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}.evidence{display:block;text-decoration:none;color:inherit;border:1px solid #e7e1d9;border-radius:13px;overflow:hidden;background:#f8f5f0}.evidence img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top}.evidence.mobile img{object-fit:contain}.evidence span{display:block;padding:8px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.controls input,.controls select,.controls button{min-height:44px;border:1px solid #cfc7bd;border-radius:12px;padding:0 12px;background:#fff}.controls input{min-width:280px;flex:1}.page-info{align-self:center;min-width:120px;text-align:center}.table-wrap{overflow:auto;background:#fff;border:1px solid #ded8d0;border-radius:20px}table{width:100%;border-collapse:collapse;min-width:1080px}th,td{padding:12px;text-align:left;border-bottom:1px solid #eee8e1;vertical-align:top}th{background:#f6f1eb}.pending{color:#8a6422}.bad{color:#b42318}.good{color:#116536}a{color:#315ec9}@media(max-width:980px){.shell{padding:18px}.hero{align-items:start;flex-direction:column}.metrics{grid-template-columns:repeat(2,1fr)}.base-grid,.slice-grid{grid-template-columns:1fr}.evidence-grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main class="shell"><section class="hero"><div><h1>喜乐帮三端 UI 生产验收台</h1><p>这里呈现真实顾客端、师傅端和后台的商业场景。每条切片按“入口 → 交互/判定 → 结果/恢复”给出 Edge 证据；没有真实页面、接口、测试和截图的内容不会冒充竣工。</p></div><span class="badge">竣工模式：全量验收</span></section><section class="metrics" id="metrics"></section><div class="notice">施工期间不安排逐页人工确认。三端全量页面、214 条切片证据和自动门禁完成后，再从本页执行一次人工总验收；人工确认后才进入 ACCEPTED。</div>
<section class="section"><div class="head"><h2>36 个业务画面总览</h2><p>顾客端与师傅端为移动 App，后台为桌面运营工作区；点击画面可查看原尺寸 Edge 截图。</p></div><div class="base-grid" id="baseFrames"></div></section>
<section class="section"><div class="head"><h2>三端切片证据概况</h2><p>下方总账可按端、批次和状态筛选，并逐条打开入口、结果与恢复证据。</p></div><div class="slice-grid" id="batchSlices"></div></section>
<section class="section"><div class="head"><h2>214 条切片总账</h2><p>“尚未施工”表示还没有进入生产批次，因此没有验收图是正常状态。</p></div><div class="controls"><input id="query" type="search" placeholder="按切片编号、承载容器或业务场景搜索"><select id="terminal"><option value="">全部端</option><option value="customer">顾客端</option><option value="worker">师傅端</option><option value="admin">后台</option></select><select id="batch"><option value="">全部批次</option>${[0,1,2,3,4,5].map((n)=>`<option value="B${n}">B${n}</option>`).join("")}</select><select id="status"><option value="">全部状态</option><option value="DEFINED">尚未施工</option><option value="READY">可施工</option><option value="IMPLEMENTED">已实现</option><option value="API_INTEGRATED">已接入接口</option><option value="TESTED">已测试</option><option value="EDGE_VERIFIED">Edge 已验</option><option value="ACCEPTED">已验收</option></select><button id="prev">上一页</button><span class="page-info" id="pageInfo"></span><button id="next">下一页</button></div><div class="table-wrap"><table><thead><tr><th>切片编号</th><th>端/批次</th><th>承载容器与场景</th><th>状态</th><th>真实页面</th><th>中文</th><th>Edge 证据</th><th>测试/验收</th></tr></thead><tbody id="rows"></tbody></table></div></section>
</main><script>const model=${data};const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));const root='../../../../';const terminalName={customer:'顾客端',worker:'师傅端',admin:'后台'};const statusName={DEFINED:'尚未施工',READY:'可施工',IMPLEMENTED:'已实现',API_INTEGRATED:'已接入接口',TESTED:'已测试',EDGE_VERIFIED:'Edge 已验',ACCEPTED:'已验收'};const expressionName={GATE:'身份/权限门禁',STATE_FRAME:'完整状态画面',REGION:'页面区域',OVERLAY:'操作浮层'};
const baseIds=model.carriers.map(x=>x.carrierId);const metrics=[['正式切片',model.metrics.sliceCount+'/214'],['中文完成',model.metrics.localizedCount+'/214'],['商业链路资料',model.metrics.businessReadyCount+'/214'],['Edge 证据',model.metrics.evidenceReadyCount+'/214'],['最终人工验收',model.metrics.acceptedCount+'/214'],['可见英文',model.metrics.languageViolationCount]];document.querySelector('#metrics').innerHTML=metrics.map(([k,v])=>'<div class="metric"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
const terminalHelp={customer:'顾客端移动业务画面',worker:'师傅端移动工作画面',admin:'后台桌面运营画面'};document.querySelector('#baseFrames').innerHTML=baseIds.map(id=>{const c=model.carriers.find(x=>x.carrierId===id);const e=(c.baseFrame.edgeEvidence||[]).find(x=>x.stage==='base')||c.baseFrame.edgeEvidence?.[0];const preview=e?'<a class="preview" href="'+root+esc(e.file)+'"><img alt="'+esc(c.carrierName)+'" src="'+root+esc(e.file)+'"></a>':'<div class="preview" style="display:grid;place-items:center;color:#8a6422">证据尚未齐备</div>';return '<article class="base-card '+(c.terminal==='admin'?'':'mobile')+'">'+preview+'<div class="copy"><span class="status '+esc(c.baseFrame.status)+'">'+esc(statusName[c.baseFrame.status])+'</span><h3>'+esc(id+' · '+c.name)+'</h3><p>'+esc(terminalHelp[c.terminal]+' · '+c.surface)+'</p></div></article>'}).join('');
document.querySelector('#batchSlices').innerHTML=['customer','worker','admin'].map(terminal=>{const items=model.slices.filter(x=>x.terminal===terminal),verified=items.filter(x=>x.status==='EDGE_VERIFIED').length,accepted=items.filter(x=>x.status==='ACCEPTED').length;return '<article class="slice-card"><div class="slice-title"><div><h3>'+esc(terminalName[terminal])+'</h3><small>正式切片 '+items.length+' 条</small></div><span class="status '+(verified===items.length?'EDGE_VERIFIED':'')+'">Edge '+verified+'/'+items.length+'</span></div><p>最终人工验收：'+accepted+'/'+items.length+'；请在下方总账筛选该端查看逐条证据。</p></article>'}).join('');
let page=0;const pageSize=40;function render(){const q=document.querySelector('#query').value.trim().toLowerCase(),terminal=document.querySelector('#terminal').value,batch=document.querySelector('#batch').value,status=document.querySelector('#status').value;const filtered=model.slices.filter(x=>(!terminal||x.terminal===terminal)&&(!batch||x.batch===batch)&&(!status||x.status===status)&&(!q||JSON.stringify(x).toLowerCase().includes(q)));const count=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,count-1);const items=filtered.slice(page*pageSize,(page+1)*pageSize);document.querySelector('#pageInfo').textContent='第 '+(page+1)+' / '+count+' 页 · '+filtered.length+' 条';document.querySelector('#prev').disabled=page===0;document.querySelector('#next').disabled=page>=count-1;document.querySelector('#rows').innerHTML=items.map(x=>{const pending=x.status==='DEFINED';const evidence=(x.edgeEvidence||[]).map(e=>'<a href="'+root+esc(e.file)+'">'+esc(e.label||e.stage)+'</a>').join('<br>')||(pending?'<span class="pending">尚未施工，无验收图</span>':'<span class="bad">证据不完整</span>');const sources=(x.implementation?.sourceFiles||[]).map(esc).join('<br>')||(pending?'<span class="pending">待施工绑定</span>':'<span class="bad">未绑定</span>');const tests=(x.tests||[]).map(t=>esc(typeof t==='string'?t:t.file)).join('<br>')||(pending?'<span class="pending">待施工</span>':'<span class="bad">未绑定</span>');return '<tr><td><strong>'+esc(x.sliceId)+'</strong><br>'+esc(expressionName[x.expression]||x.expression)+'</td><td>'+esc(terminalName[x.terminal])+'<br>'+esc(x.batch)+'</td><td>'+esc(x.carrierId)+' '+esc(x.carrierName)+'<br><small>'+esc(x.designPath)+'</small></td><td><span class="status '+esc(x.status)+'">'+esc(statusName[x.status])+'</span></td><td>'+esc(x.implementation?.route||'待施工绑定')+'<br>'+sources+'</td><td class="'+(x.localization?.status==='COMPLETE'?'good':'pending')+'">'+(x.localization?.status==='COMPLETE'?'完成':'待施工')+'</td><td>'+evidence+'</td><td>'+tests+'<br>'+esc(x.acceptance?.acceptedBy||'未人工验收')+'</td></tr>'}).join('')};['query','terminal','batch','status'].forEach(id=>document.querySelector('#'+id).addEventListener('input',()=>{page=0;render()}));document.querySelector('#prev').onclick=()=>{page--;render()};document.querySelector('#next').onclick=()=>{page++;render()};render();</script></body></html>`;
}

function writeAuditArtifacts(audit) {
  writeJson(languageFile, { generatedAt: new Date().toISOString(), count: audit.languageViolations.length, violations: audit.languageViolations });
  fs.writeFileSync(reportFile, markdownReport(audit), "utf8");
  fs.writeFileSync(consoleFile, consoleHtmlV2(audit), "utf8");
}

const command = process.argv[2] ?? "audit";

if (command === "sync") {
  const parsed = loadParsed();
  const existing = fs.existsSync(ledgerFile) ? readJson(ledgerFile) : null;
  writeJson(ledgerFile, syncLedger(parsed, existing));
  console.log(`UI_PRODUCTION_SYNC slices=${parsed.slices.length} carriers=${parsed.carriers.length}`);
} else {
  if (!fs.existsSync(ledgerFile)) throw new Error("缺少 SLICE_IMPLEMENTATION_LEDGER.json，请先运行 ui:control:sync");
  const audit = loadAudit();
  if (["audit", "baseline", "console", "ratchet", "release"].includes(command)) writeAuditArtifacts(audit);
  if (command === "baseline") {
    writeJson(baselineFile, { generatedAt: new Date().toISOString(), ...audit.metrics });
    console.log(`UI_PRODUCTION_BASELINE ${JSON.stringify(audit.metrics)}`);
  } else if (command === "check") {
    if (audit.structureErrors.length) {
      console.error(audit.structureErrors.join("\n"));
      process.exitCode = 1;
    } else console.log(`UI_PRODUCTION_STRUCTURE_OK slices=${audit.metrics.sliceCount} carriers=${audit.metrics.carrierCount}`);
  } else if (command === "ratchet") {
    const errors = [...audit.structureErrors, ...ratchetErrors(audit.metrics, readJson(baselineFile))];
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log("UI_PRODUCTION_RATCHET_OK");
  } else if (command === "release") {
    const errors = releaseErrors(rootDir, audit.ledger, audit.structureErrors, audit.languageViolations);
    if (errors.length) {
      console.error(`UI_PRODUCTION_RELEASE_BLOCKED\n${errors.join("\n")}`);
      process.exitCode = 1;
    } else console.log("UI_PRODUCTION_RELEASE_OK accepted=214");
  } else if (["audit", "console"].includes(command)) {
    console.log(`UI_PRODUCTION_AUDIT ${JSON.stringify(audit.metrics)}`);
    console.log(`console=${path.relative(rootDir, consoleFile)}`);
  } else if (!['baseline','check','ratchet','release'].includes(command)) {
    throw new Error(`未知命令：${command}`);
  }
}
