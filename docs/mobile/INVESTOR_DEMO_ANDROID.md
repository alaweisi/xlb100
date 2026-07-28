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
- release 构建产物清单固定记录 `releaseCandidate:true`、
  `sealed:false`、`dispatchable:false`、`releaseDecision:INVESTOR_APK_HOLD`、
  `published:false`、源码 commit、API Origin、APK SHA-256、证书 SHA-256 和公钥 SHA-256。
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

脚本构建三端 production Web 资源、同步 Capacitor、执行 `assembleInvestorDemo`、
校验应用身份/版本/签名，并将**尚未封板、不可下发**的 signed release candidate 放到：

```text
.artifacts/investor-demo-rc/<source-commit>/
```

需要封存到独立候选目录时，可在当前构建进程中设置绝对路径
`XLB_INVESTOR_DEMO_ARTIFACT_BASE`；脚本仍会自动追加源码 commit，并生成
`manifest.json`、`checksums.sha256` 与 `signing-verification.json`。该变量不含
签名秘密，不改变 API Origin、签名失败关闭或 `published:false` 边界。

同一 commit 的候选文件不可被不同内容覆盖。`mobile:investor-demo:release`
从不写 `sealed:true` 或 `INVESTOR_APK_GO`。

连接 Android 设备后，统一通过仓库内脚本完成清洁安装、冷启动、UI-tree
驱动的应用信息展开、返回/后台/重启、断网/重连与脱敏日志证据：

```powershell
pnpm mobile:investor-demo:device-qa -- -ArtifactRoot <候选目录> -UiHelperRoot <android-emulator-qa-skill目录> -TargetType Physical -MinimumPhysicalDevices 2 -Mode FinalSeal
```

默认模式就是 `FinalSeal`：在任何 `adb uninstall/install` 前，脚本先固定校验
三端 role/applicationId、ArtifactRoot 内路径和文件名、manifest/checksums
SHA-256、`aapt` 包名/版本、`apksigner` 签名/证书及三证书互异。随后要求
公网 443、两台真实设备、登录/退出、短 TTL 配置和固定
Customer→Admin→Worker→Customer→Admin 业务链全部通过。所有 tap 坐标只来自
`uiautomator` tree；Staging OTP 只在内存中读取并输入，不写入截图、XML、摘要
或日志。crash、ANR、cleartext、TLS 与敏感日志匹配均为失败条件。

`-Mode DevelopmentProbe` 仅供开发诊断，可生成 HOLD 证据；它不能成为封板证据。
`FinalSeal` 遇到 443、设备、认证业务链或运行时检查 HOLD 时均非零退出。

## 严格封板入口

release candidate 之外，artifact 必须补齐并验证以下根目录材料：

- `INSTALLATION.md`、`DEMO_ACCOUNTS.md`、`DEMO_SCRIPT.md`、`DEMO_RESET.md`
- `KNOWN_SCOPE.md`、`SIMULATION_NOTICE.md`、`QA_EVIDENCE.md`
- `signing-verification.json`、`independent-apk-verification.json`
- `SECURITY_SCAN.json`、`FILE_INVENTORY.json`、`HASH_RECHECK.json`
- `RELEASE_STATUS.json`、`network-443.json`、`qa/qa-index.json`
- 两台 physical device 的三端截图、UI XML/摘要、脱敏日志和零异常 runtime checks

仅当以上材料、APK hash/签名、当前源码 commit、公网 443、两台真机和固定认证
业务链全部通过时执行：

```powershell
pnpm mobile:investor-demo:seal -- --artifact-root <候选目录>
```

严格入口才会写 `sealed:true`、`dispatchable:true` 和
`releaseDecision:INVESTOR_APK_GO`，同时仍保持 `published:false`。缺材料、伪
manifest、错误 hash、HOLD 或旧 commit APK 均失败关闭。

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
dry-run 与 apply 都会在任何 upsert 前检查固定手机号、username、phone hash
及所有其他唯一键的现有所有者；冲突摘要不输出敏感键值，且不会开始事务写入。

Staging Compose 已将 Customer/Worker/Admin Demo 变量接入 backend，并提供
默认 dry-run、profile 隔离的 reset 工具：

```powershell
pnpm staging:demo:compose:dry-run
pnpm staging:demo:compose:reset
```

两者默认读取仓库忽略的 `.env.staging.local`。示例文件中的 Demo 身份和 reset
确认项保持空值、认证/reset 开关保持 `false`；只有本地运行时显式填齐并满足后端
校验才可执行。

## 当前联网验收状态

服务器侧标准 443 监听、TLS/SAN 与 Certbot 续期已验证通过；公网 443 的 SYN 尚未到达腾讯云实例 `ins-7a8qh4gx`，当前唯一已知阻塞为腾讯云安全组，且施工上下文没有 CAM/API 权限。因此真实公网链路保持 HOLD。构建配置不会因该阻塞回退到 80 端口或占位域名。
