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

同一 commit 的封存文件不可被不同内容覆盖。

## 当前联网验收状态

服务器侧标准 443 监听、TLS/SAN 与 Certbot 续期已验证通过；公网 443 的 SYN 尚未到达腾讯云实例 `ins-7a8qh4gx`，当前唯一已知阻塞为腾讯云安全组，且施工上下文没有 CAM/API 权限。因此真实公网链路保持 HOLD。构建配置不会因该阻塞回退到 80 端口或占位域名。
