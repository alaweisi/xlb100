import { existsSync, realpathSync, readdirSync } from "node:fs";
import path from "node:path";

const root = realpathSync(process.cwd());
const workspaceRoots = [
  path.join(root, "backend"),
  path.join(root, "tests"),
  ...["apps", "packages"].flatMap((directory) => {
    const parent = path.join(root, directory);
    if (!existsSync(parent)) return [];
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name));
  }),
];

const failures = [];
let checked = 0;

for (const workspace of workspaceRoots) {
  if (!existsSync(path.join(workspace, "package.json"))) continue;
  const scopeDirectory = path.join(workspace, "node_modules", "@xlb");
  if (!existsSync(scopeDirectory)) continue;

  for (const entry of readdirSync(scopeDirectory, { withFileTypes: true })) {
    const dependency = path.join(scopeDirectory, entry.name);
    const target = realpathSync(dependency);
    checked += 1;
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      failures.push(`${path.relative(root, dependency)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write("workspace dependency links escape the current repository:\n");
  for (const failure of failures) process.stderr.write(`  ${failure}\n`);
  process.stderr.write("Run: pnpm install --frozen-lockfile --force\n");
  process.exit(1);
}

process.stdout.write(`workspace dependency links passed (${checked} @xlb links)\n`);
