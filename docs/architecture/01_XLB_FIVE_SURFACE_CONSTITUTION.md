# XLB 五端产品宪法

状态：自 2026-07-19 起生效。本文是 XLB 前端端形态、运行载体和部署映射的最高优先级事实源；历史文档与本文冲突时，以本文和根目录 `AGENTS.md` 为准。

## 1. 五端不可混淆

| 目录 | 产品身份 | 主要设备 | 载体与布局 | 权限/用途 |
| --- | --- | --- | --- | --- |
| `apps/customer` | 顾客端 | 手机 | 可安装移动 App（PWA/Capacitor-ready），竖屏、底部主导航、安全区 | 顾客选服务、下单、履约跟踪和售后 |
| `apps/worker` | 师傅端 | 手机 | 可安装移动 App（PWA/原生封装-ready），竖屏、触控优先、安全区 | 师傅接单、履约、收益和个人工作资料 |
| `apps/admin` | 移动后台 | 手机 | 可安装移动 App（PWA），竖屏、底部主导航、紧凑运营卡片 | 城市运营人员随身处理审核、派单、客服和治理事项 |
| `apps/oa` | 总部 OA 总后台 | 电脑 | 桌面网页，宽屏侧栏、密集工作台、键盘与多任务优先 | 与 Admin 共享全部业务能力，使用独立总部身份并拥有更高权限等级 |
| `apps/dashboard` | 总部实时大屏 | 电视/大屏 | 只读 16:9 wallboard，1920×1080 基准，无表单式操作 | 展示真实即时状态、数据新鲜度、断流和告警，不执行业务写操作 |

`admin` 不是 OA 的响应式别名，也不是桌面管理网页。`oa` 不是第四个移动 App。`dashboard` 不是 Admin/OA 的“首页看板”，而是独立只读大屏。

## 2. 同功能不等于同载体

- Admin 与 OA 复用 `packages/types`、`packages/validators`、`@xlb/api-client` 和可复用业务页面能力，不复制业务契约。
- Admin 与 OA 读取同一业务数据库、同一状态机和同一聚合口径；禁止为两个载体维护含义不同的同名数据。
- Admin 采用移动信息架构；OA 采用桌面信息架构。相同业务动作必须分别适配触控短任务和键盘/宽屏批量任务。
- OA 的“级别更高”必须由服务端 appType、角色、范围和审计合同实现，不能只靠前端隐藏/显示按钮。该认证授权变更属于高风险工程，需按 `AGENTS.md` 单独确认后施工。
- OA 使用独立 `/api/auth/oa/*` 登录、独立浏览器会话和 `appType=oa` 令牌。只有 `admin` 角色且在 `admin_city_scopes` 拥有 `__global__` 标记的账号可登录；总部账号仍须为每次业务访问明确选择真实城市。

## 3. Dashboard 数据纪律

- 只读取真实服务端状态或已批准聚合接口；不得用静态数字、随机数或本地模拟冒充实时业务数据。
- 使用独立 `appType=dashboard` 只读令牌和独立浏览器会话，不得复用 OA 或 Admin 的高权限令牌。
- 每个指标必须显示来源状态、采集/刷新时间和 freshness；断流、过期、部分失败必须显式展示。
- 正式大屏以 MySQL 只读运营聚合返回总部总量和城市明细，15 秒刷新；客户端不得自行推导或修补业务数字。
- Dashboard 不包含审批、编辑、退款、出款、派单等业务写入口。

## 4. 构建与部署映射

五个目录必须是五个独立可构建前端产物和五个独立路由：`/customer/`、`/worker/`、`/admin/`、`/oa/`、`/dashboard/`。

- Customer、Worker、Admin 必须具备 `manifest.webmanifest`、standalone display、应用图标、Service Worker 注册和移动 viewport。
- OA 与 Dashboard 不注册移动 PWA，不使用底部主导航或手机宽度容器。
- Docker、Compose、反向代理、镜像发布清单和 CI 路径必须同时识别五端。
- 外部 deploy、push、生产数据和公开发布仍须在执行前取得单独授权。

## 5. 验收基准

- Customer / Worker / Admin：390×844 主证据，至少补充 360×800 和 430×932；触控目标、安全区、键盘遮挡和 standalone 模式通过。
- OA：1440×900 主证据，补充 1280×800；侧栏、表格密度、键盘焦点、批量工作流通过。
- Dashboard：1920×1080 主证据；远距离可读、16:9 缩放、fresh/stale/disconnected/partial/error 状态通过。
- 五端都必须有 loading、empty、error 和 success/ready 状态；Dashboard 额外要求 stale、disconnected、partial。

## 6. 自动守门

运行 `pnpm check:app-surfaces`。该命令应在架构预检、CI 和发布准备中阻止：目录缺失、Admin 非移动 PWA、OA/Dashboard 占位、五端构建或部署映射缺失等回归。
