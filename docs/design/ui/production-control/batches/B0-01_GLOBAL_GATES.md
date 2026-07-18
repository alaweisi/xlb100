# B0-01 三端 Shell 与身份/城市 Gate 正式验收批次

状态：`EDGE_VERIFIED_AWAITING_HUMAN_ACCEPTANCE`
目标：把已有 B0 候选代码转化为可追踪、全中文、真实业务接入并有 Edge 证据的正式切片；不因代码已经存在而预先记为完成。

## 本批次范围

### 顾客端

- `C.AUTH.SESSION.REQUIRED`
- `C-00` Base Frame

### 师傅端

- `W.AUTH.SESSION.UNAUTHENTICATED`
- `W.AUTH.SESSION.AUTHENTICATED`
- `W.PROFILE.ACCESS.SUSPENDED`
- `W.PROFILE.ACCESS.DISABLED`
- `W-00` Base Frame

### 后台

- `A.AUTH.SESSION.REQUIRED`
- `A.SCOPE.CITY.REQUIRED`
- `A-00` Base Frame

明确排除：订单、派单、履约、售后、结算等 B1～B5 业务页面；本批次只处理全局入口与恢复边界。

## 必须证明的业务事实

| 切片 | 进入条件 | 必须显示 | 主动作 | 持久结果/交接 |
| --- | --- | --- | --- | --- |
| `C.AUTH.SESSION.REQUIRED` | 顾客会话缺失或失效 | 验证进行中、原目标页面 | 完成顾客认证 | 回到原目标，不丢失意图 |
| `W.AUTH.SESSION.UNAUTHENTICATED` | 师傅无会话 | 手机号、验证码、目标工作台 | 获取验证码、登录 | 建立会话并进入待接任务大厅 |
| `W.AUTH.SESSION.AUTHENTICATED` | 师傅会话有效 | 当前身份、城市和退出入口 | 进入工作台 | 后续请求携带真实身份 |
| `W.PROFILE.ACCESS.SUSPENDED` | 后端判定暂停 | 暂停原因、影响范围、客服入口 | 联系客服/刷新 | 不得进入接单场景 |
| `W.PROFILE.ACCESS.DISABLED` | 后端判定停用 | 停用事实、允许的下一步 | 退出/联系客服 | 不得回落为空状态 |
| `A.AUTH.SESSION.REQUIRED` | 后台会话缺失 | 账号、验证码、原工作台 | 获取验证码、登录 | 恢复原后台目标 |
| `A.SCOPE.CITY.REQUIRED` | 会话有效但无城市范围 | 当前角色、城市选择、原目标 | 确认城市 | 带城市范围进入原工作台 |

## 四道门禁

- [x] 所有 B0-01 可见文案中文化，必要技术缩写进入中文语境；
- [x] 7 条 Slice ID 和 3 个 Base Frame 的实现字段完整；
- [x] 三端真实 App 路由可进入，Edge 截图保存在仓库证据目录；
- [x] 认证、访问状态和城市范围来自真实 API/契约状态，不使用 Demo 开关冒充业务事实；
- [x] 相关测试通过；
- [x] 总账只推进到实际达到的状态：`EDGE_VERIFIED`；
- [x] `pnpm ui:gate:ratchet` 通过；
- [x] 本批次验收命令不报告状态超前。

Human 最终验收尚未登记，因此本批次 7 条切片和 3 个 Base Frame 均未标记为 `ACCEPTED`。

## 2026-07-18 基础外壳整改复验

- 顾客端、师傅端和运营端均为真实手机 App；运营端采用五项底部主导航、角色化工具箱与全屏身份/城市/权限 Gate，不再使用桌面网页侧栏。
- 产品边界已固定：当前 `apps/admin` 是手机运营 App；未来 OA 独立承接专业网页管理，大屏独立承接实时数据展示，二者不冒充当前第三端切片。
- Edge 证据由原来的单画面升级为 22 张标准视口状态证据，七条切片逐条覆盖入口、交互/判定和结果/恢复。
- 验收台首页直接展示三张基础外壳和七条切片的状态缩略图；其余切片显示“尚未施工，无验收图”，不再误报为缺图。
- 本次复验仍只推进到 `EDGE_VERIFIED`，等待人工确认后才可登记 `ACCEPTED`。

2026-07-18 已在 Docker Desktop 的本地 `xlb-mysql-local` 与 `xlb-redis-local` 健康实例上完成认证集成验证。`xlb_local` 的 59 个迁移版本全部校验为已应用，未新增或改写结构；`tests/integration/authOtp.test.ts` 共 9 个用例全部通过，覆盖验证码锁定、一次性与并发消费、重发冷却、摘要存储、师傅令牌身份以及暂停/停用访问状态。该结果只构成工程测试证据，不替代 Human 最终验收。

## 交付报告

必须逐条列出：真实路由、源文件、API binding、权威状态、权限、进入条件、持久结果、恢复动作、测试、Edge 证据、验收人和时间。
