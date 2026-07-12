import { spawn } from "node:child_process";
const stages=[["boundary","test:boundary:phase24e"],["contract","test:contract:phase24e"],["UI","test:ui:phase24e"],["migration","test:migration:phase24e"],["integration","test:integration:phase24e"],["typecheck","typecheck"],["build","build"],["audit","audit:critical"]];
for(const[label,script]of stages){const cli=process.env.npm_execpath;if(!cli)throw Error("npm_execpath required");const code=await new Promise((res,rej)=>{console.log(`[phase24e] ${label}`);const p=spawn(process.execPath,[cli,script],{stdio:"inherit",env:process.env});p.on("error",rej);p.on("exit",c=>res(c??1));});if(code)process.exit(code)}
console.log("[phase24e] aggregate gate passed");
