import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SURFACES = Object.freeze({
  customer: Object.freeze({ kind: "mobile-app", port: 5173, installable: true }),
  worker: Object.freeze({ kind: "mobile-app", port: 5174, installable: true }),
  admin: Object.freeze({ kind: "mobile-app", port: 5175, installable: true }),
  oa: Object.freeze({ kind: "desktop-web", port: 5176, installable: false }),
  dashboard: Object.freeze({ kind: "wallboard", port: 5177, installable: false }),
});

const fail = (message) => { throw new Error(`五端宪法检查失败：${message}`); };
const read = (root, relative) => {
  const file = path.join(root, relative);
  if (!existsSync(file)) fail(`缺少 ${relative}`);
  return readFileSync(file, "utf8");
};
const json = (root, relative) => {
  try { return JSON.parse(read(root, relative)); }
  catch (error) { fail(`${relative} 不是有效 JSON：${error.message}`); }
};
const expect = (condition, message) => { if (!condition) fail(message); };

export function checkSurfaceConstitution(root) {
  const constitution = read(root, "docs/architecture/01_XLB_FIVE_SURFACE_CONSTITUTION.md");
  const agents = read(root, "AGENTS.md");
  for (const name of Object.keys(SURFACES)) {
    expect(constitution.includes(`apps/${name}`), `产品宪法未登记 apps/${name}`);
    expect(agents.includes(`apps/${name}`), `AGENTS.md 未登记 apps/${name}`);
    const pkg = json(root, `apps/${name}/package.json`);
    expect(pkg.name === `@xlb/${name}`, `apps/${name} 包名必须为 @xlb/${name}`);
    expect(pkg.scripts?.dev === "vite" && typeof pkg.scripts?.build === "string", `apps/${name} 必须是可独立构建的 Vite 前端`);
  }

  for (const name of ["customer", "worker", "admin"]) {
    const manifest = json(root, `apps/${name}/public/manifest.webmanifest`);
    const html = read(root, `apps/${name}/index.html`);
    const main = read(root, `apps/${name}/src/main.tsx`);
    expect(manifest.display === "standalone", `apps/${name} 必须使用 standalone PWA`);
    expect(manifest.orientation === "portrait-primary", `apps/${name} 必须声明竖屏移动形态`);
    expect(Array.isArray(manifest.icons) && manifest.icons.length >= 2, `apps/${name} 必须提供应用图标`);
    expect(/rel=["']manifest["']/i.test(html), `apps/${name}/index.html 必须链接 manifest`);
    expect(/width=device-width/i.test(html), `apps/${name} 必须声明移动 viewport`);
    expect(/serviceWorker\.register/.test(main), `apps/${name} 必须注册 Service Worker`);
    expect(existsSync(path.join(root, `apps/${name}/public/sw.js`)), `apps/${name} 缺少 Service Worker 文件`);
  }

  for (const name of ["oa", "dashboard"]) {
    expect(!existsSync(path.join(root, `apps/${name}/public/manifest.webmanifest`)), `apps/${name} 不得伪装成移动 PWA`);
    const source = read(root, `apps/${name}/src/main.tsx`);
    expect(!/serviceWorker\.register/.test(source), `apps/${name} 不得注册移动 App Service Worker`);
  }

  const adminCss = read(root, "apps/admin/src/app/admin-shell.css");
  expect(/installable mobile operations app/i.test(adminCss) && /max-width:\s*430px/.test(adminCss), "Admin 必须保持手机 App 容器，不能回退为桌面后台");
  const captureB0 = read(root, "scripts/ui-production/capture-b0-01.mjs");
  expect(!/desktopViewport/.test(captureB0) && /adminAuthEvidence[\s\S]*createContext\(mobileViewport\)/.test(captureB0), "Admin 验收截图必须使用移动视口");
  const gallery = read(root, "packages/ui/src/gallery/runtimeThemeGallery.ts");
  expect(/admin-invalid-mobile[\s\S]*role:\s*"admin"[\s\S]*viewport:\s*"mobile"/.test(gallery), "Admin 主题验收场景必须是移动端");
  const sliceLedger = read(root, "docs/design/ui/vertical-slices/SLICE_LEDGER.md");
  expect(sliceLedger.includes("后台视口基线为 390×844 可安装移动 App"), "切片总账必须把 Admin 定义为移动 App");
  const oaCss = read(root, "apps/oa/src/oa-shell.css");
  expect(/grid-template-columns:\s*264px minmax\(0, 1fr\)/.test(oaCss), "OA 必须拥有桌面宽屏侧栏布局");
  const dashboardSource = read(root, "apps/dashboard/src/App.tsx");
  expect(/15_000/.test(dashboardSource) && /disconnected/.test(dashboardSource) && /stale/.test(dashboardSource), "Dashboard 必须有真实轮询、新鲜度和断流状态");

  const docker = read(root, "infra/docker/Dockerfile.frontend");
  const compose = read(root, "deploy/compose/docker-compose.staging.yml");
  const nginx = read(root, "infra/nginx/cloud-staging.conf");
  const release = read(root, "deploy/tke/release/image-release.mjs");
  for (const name of Object.keys(SURFACES)) {
    expect(docker.includes(`apps/${name}/package.json`), `前端 Dockerfile 未包含 ${name}`);
    expect(compose.includes(`APP_NAME: ${name}`), `staging Compose 未构建 ${name}`);
    expect(nginx.includes(`location /${name}/`), `反向代理缺少 /${name}/`);
    expect(release.includes(`APP_NAME=${name}`), `镜像发布清单缺少 ${name}`);
  }
  return { ok: true, surfaces: Object.keys(SURFACES), mobileApps: ["customer", "worker", "admin"], web: "oa", wallboard: "dashboard" };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const root = path.resolve(path.dirname(currentFile), "..");
  const result = checkSurfaceConstitution(root);
  process.stdout.write(`五端宪法检查通过：${result.surfaces.join(" / ")}\n`);
}
