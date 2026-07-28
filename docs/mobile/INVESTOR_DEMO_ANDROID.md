# Investor Demo Android 构建

本构建模式仅用于未发布的投资人演示候选包，与 Engineering M5 的应用身份、资源和签名入口相互独立。

## 固定边界

- API Origin 固定为 `https://123.207.198.136`，即标准 HTTPS 443。
- 不允许 `:80`、`*.engineering-rc.invalid` 或其他回退 Origin。
- 三端 applicationId：
  - `com.xlb100.customer.demo`
  - `com.xlb100.worker.demo`
  - `com.xlb100.admin.demo`
- 三端版本均为 `versionCode=2`、`versionName=0.2.0-investor-demo`。
- 构建产物清单固定记录 `published:false`、源码 commit、API Origin、APK SHA-256、证书 SHA-256 和公钥 SHA-256。
- 客户端、师傅端、管理端必须使用三套不同的仓库外 keystore。

## 签名环境

每一端均需完整提供以下四项；缺少任意一项即失败关闭：

```text
XLB_CUSTOMER_ANDROID_DEMO_KEYSTORE_PATH
XLB_CUSTOMER_ANDROID_DEMO_STORE_PASSWORD
XLB_CUSTOMER_ANDROID_DEMO_KEY_ALIAS
XLB_CUSTOMER_ANDROID_DEMO_KEY_PASSWORD

XLB_WORKER_ANDROID_DEMO_KEYSTORE_PATH
XLB_WORKER_ANDROID_DEMO_STORE_PASSWORD
XLB_WORKER_ANDROID_DEMO_KEY_ALIAS
XLB_WORKER_ANDROID_DEMO_KEY_PASSWORD

XLB_ADMIN_ANDROID_DEMO_KEYSTORE_PATH
XLB_ADMIN_ANDROID_DEMO_STORE_PASSWORD
XLB_ADMIN_ANDROID_DEMO_KEY_ALIAS
XLB_ADMIN_ANDROID_DEMO_KEY_PASSWORD
```

`*_KEYSTORE_PATH` 必须指向仓库外的现有文件，三端路径不得重复。不得在仓库内创建或保存 keystore、密码或 signing environment 文件。

## 构建入口

先验证不需要签名凭据的边界：

```powershell
pnpm mobile:investor-demo:test
pnpm mobile:m0:test
pnpm mobile:m0:typecheck
pnpm mobile:m0:validate
pnpm mobile:m0:doctor
```

在工作区无已跟踪改动且三套签名环境完整时构建：

```powershell
pnpm mobile:investor-demo:release
```

脚本构建三端 production Web 资源、同步 Capacitor、执行 `assembleInvestorDemo`、校验应用身份/版本/签名，并将封存候选放到：

```text
.artifacts/investor-demo-rc/<source-commit>/
```

需要封存到独立候选目录时，可在当前构建进程中设置绝对路径
`XLB_INVESTOR_DEMO_ARTIFACT_BASE`；脚本仍会自动追加源码 commit，并生成
`manifest.json`、`checksums.sha256` 与 `signing-verification.json`。该变量不含
签名秘密，不改变 API Origin、签名失败关闭或 `published:false` 边界。

同一 commit 的封存文件不可被不同内容覆盖。

连接 Android 设备后，统一通过仓库内脚本完成清洁安装、冷启动、UI-tree
驱动的应用信息展开、返回/后台/重启、断网/重连与脱敏日志证据：

```powershell
pnpm mobile:investor-demo:device-qa -- -ArtifactRoot <封存目录> -UiHelperRoot <android-emulator-qa-skill目录> -TargetType Physical -MinimumPhysicalDevices 2
```

脚本默认要求两台真实设备；数量不足时写入 `DEVICE_UAT_BLOCKED` 证据并失败
关闭。所有 tap 坐标只来自 `uiautomator` dump 和 `ui_pick.py`，同时保存
`ui_tree_summarize.py` 摘要。

## 固定演示身份与数据重置

APK 与后端共同消费 `@xlb/types` 中的固定演示身份清单。师傅端固定使用
杭州演示师傅手机号，管理端固定使用杭州低权限演示管理员用户名；这些标识
不是密码，实际验证码仍由 Staging 的短期、一次性 OTP 流程生成。

根目录提供两个明确入口：

```powershell
pnpm staging:demo:bootstrap:dry-run
pnpm staging:demo:reset
```

两个命令都不会代填安全条件。执行者仍须显式提供
`NODE_ENV=staging`、`STAGING_DEMO_RESET_ENABLED=true`、
`STAGING_DEMO_RESET_CONFIRMATION=RESET_XLB_INVESTOR_DEMO_V1`，并使
`STAGING_DEMO_RESET_EXPECTED_HOST` / `STAGING_DEMO_RESET_EXPECTED_DATABASE`
与实际 MySQL 目标精确一致。脚本会再次校验非 production host/database、
固定身份与连接后的 `SELECT DATABASE()`；任一条件不满足即失败关闭。

## 当前联网验收状态

服务器侧标准 443 监听、TLS/SAN 与 Certbot 续期已验证通过；公网 443 的 SYN 尚未到达腾讯云实例 `ins-7a8qh4gx`，当前唯一已知阻塞为腾讯云安全组，且施工上下文没有 CAM/API 权限。因此真实公网链路保持 HOLD。构建配置不会因该阻塞回退到 80 端口或占位域名。
