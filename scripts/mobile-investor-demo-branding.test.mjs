import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roles = [
  { key: "customer", mobile: "customer-mobile", name: "喜乐帮客户演示" },
  { key: "worker", mobile: "worker-mobile", name: "喜乐帮师傅演示" },
  { key: "admin", mobile: "admin-mobile", name: "喜乐帮管理演示" },
];

function filesBelow(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  });
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("all Investor Demo roles ship complete launcher, round, adaptive and splash resources", () => {
  for (const role of roles) {
    const androidApp = path.join(workspaceRoot, "apps", role.mobile, "android", "app");
    const resourceRoot = path.join(androidApp, "src", "investorDemo", "res");
    const resources = filesBelow(resourceRoot);
    assert.equal(resources.filter((file) => file.endsWith(".png")).length, 26);
    assert.ok(fs.existsSync(path.join(resourceRoot, "mipmap-anydpi-v26", "ic_launcher.xml")));
    assert.ok(fs.existsSync(path.join(resourceRoot, "mipmap-anydpi-v26", "ic_launcher_round.xml")));
    assert.ok(fs.existsSync(path.join(resourceRoot, "mipmap-xxxhdpi", "ic_launcher.png")));
    assert.ok(fs.existsSync(path.join(resourceRoot, "mipmap-xxxhdpi", "ic_launcher_round.png")));
    assert.ok(fs.existsSync(path.join(resourceRoot, "drawable-port-xxxhdpi", "splash.png")));
    assert.ok(fs.existsSync(path.join(resourceRoot, "drawable-land-xxxhdpi", "splash.png")));

    const buildGradle = fs.readFileSync(path.join(androidApp, "build.gradle"), "utf8");
    assert.match(buildGradle, /buildTypes\s*\{[\s\S]*investorDemo\s*\{/u);
    assert.match(buildGradle, /applicationIdSuffix "\.demo"/u);
    assert.match(buildGradle, /versionCode\.set\(2\)/u);
    assert.ok(buildGradle.includes(role.name));
  }
});

test("the three Investor Demo roles are visually distinct from each other and M5", () => {
  const demoIcons = roles.map((role) => path.join(
    workspaceRoot,
    "apps",
    role.mobile,
    "android",
    "app",
    "src",
    "investorDemo",
    "res",
    "mipmap-xxxhdpi",
    "ic_launcher.png",
  ));
  const demoSplashes = roles.map((role) => path.join(
    workspaceRoot,
    "apps",
    role.mobile,
    "android",
    "app",
    "src",
    "investorDemo",
    "res",
    "drawable-port-xxxhdpi",
    "splash.png",
  ));
  assert.equal(new Set(demoIcons.map(sha256)).size, roles.length);
  assert.equal(new Set(demoSplashes.map(sha256)).size, roles.length);

  for (const [index, role] of roles.entries()) {
    const m5Icon = path.join(
      workspaceRoot,
      "apps",
      role.mobile,
      "android",
      "app",
      "src",
      "main",
      "res",
      "mipmap-xxxhdpi",
      "ic_launcher.png",
    );
    assert.notEqual(sha256(demoIcons[index]), sha256(m5Icon));
  }
});
