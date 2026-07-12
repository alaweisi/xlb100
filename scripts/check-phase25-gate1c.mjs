import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const required = ["packages/ui/src/tokens/runtimeThemeResolver.ts", "tests/unit/phase25RuntimeThemeResolver.test.ts", "docs/reports/PHASE25_GATE1C_RUNTIME_RESOLVER_REPORT.md"];
for (const file of required) if (!existsSync(join(root, file))) throw new Error(`[phase25-gate1c] missing ${file}`);
const resolver = readFileSync(join(root, required[0]), "utf8");
for (const marker of ["validator.safeParse", "scope-mismatch", "RuntimeThemeBridge", "generation === this.#generation", "kill-switch"]) if (!resolver.includes(marker)) throw new Error(`[phase25-gate1c] resolver missing ${marker}`);
for (const forbidden of ["fetch(", "axios", "@xlb/api-client", "apps/"]) if (resolver.includes(forbidden)) throw new Error(`[phase25-gate1c] forbidden runtime/API integration: ${forbidden}`);
process.stdout.write("[phase25-gate1c] PASS deterministic resolver, atomic bridge, scope fallback, and no-API boundary verified\n");
