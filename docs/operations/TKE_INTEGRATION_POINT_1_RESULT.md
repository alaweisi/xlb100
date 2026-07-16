# TKE 集成点 1 验收结果

## 结论

**FAILED — 暂不启动 N4。**

N1、N2、N3 已按 `N2 -> N1 -> N3` 顺序无冲突合入独立集成分支，三个节点的离线复验均通过；但组合后的 Production 契约仍存在一个阻塞性语义缺口：Helm 强制启用 COS，而后端对象存储工厂和现有数据库约束仍只允许 `local|mock`。因此，本结果只能证明 TKE 工程骨架成立，不能证明 Production Pod 可以按当前 values 正常启动和持久化对象。

在该缺口关闭前，不应启动 N4 统一发布工具与 CI，也不得执行 TKE/TCR/COS 的云端 plan、apply 或部署。

## 集成信息

- 集成分支：`codex/tke-integration-1`
- 集成工作树：`G:\xlb100-worktrees\tke-integration-1`
- 基线：`701e7fb1fe3b7ec4b7179c4ba14a0e877169bdab`
- N2 源提交：`8a6b65afb852a910c2f201a94a052f2b222b5a85`
- N2 合并提交：`d750b7da303aa42f3c617fb76d0a31bbed84bb0e`
- N1 源提交：`62df1e68efcc4a5cfff863163fa6509e220f2c8b`
- N1 合并提交：`c06bc0535d124d140bcb65821a3fa282e6d33dad`
- N3 源提交：`863930fbc7b0f2cc683222770bc99eec55afc5af`
- N3 合并提交：`9301f04ca657e5cf7634bd805cc2fe5eb3700e7a`
- 外部操作：未 push、未部署、未执行腾讯云 plan/apply、未创建计费资源

## 节点复验

### N2：应用 TKE Readiness

- TKE Readiness/COS 配置与适配器：3 个测试文件、10 个测试通过。
- Provider readiness：7 个测试文件、36 个测试通过。
- `@xlb/config` build：通过。
- `@xlb/backend` typecheck/build/lint：通过；lint 有 1 条既有 unused-variable warning，无 error。
- `/health/live`、`/health/ready`、COS Secret 文件读取和私有对象适配器实现均已进入集成分支。

### N1：Helm 应用编排

- local/staging/production 严格 `helm lint`：通过。
- 三环境模板渲染和资源数量断言：通过。
- kubeconform：22 个资源，21 个有效、0 个无效、0 个错误、1 个 ServiceMonitor CRD 跳过。
- Production digest、高可用、COS、TLS、Secret 引用等 9 项负例：通过。
- 显式 migration Job 渲染和 `helm package`：通过。

### N3：腾讯云 IaC

- `terraform fmt -check -recursive`：通过。
- `terraform init -backend=false`：通过。
- `terraform validate`：通过。
- 无腾讯云凭据的 mock test：3 个场景通过、0 失败。
- 三个场景覆盖新建受管资源、引用现有生产资源、拒绝未确认的计费资源。

### 组合回归

- 共享契约检查：63 个测试文件、270 个测试通过，1 个 todo。
- 工作区依赖链接：17 个 `@xlb/*` 链接通过。
- `git diff --check main...HEAD`：通过。
- 高风险范围：仅既定 COS Provider 与 `infra/tencent/**`；已记录本地集成授权，没有新增敏感路径。

## 阻塞性语义缺口

当前三处事实不能同时成立：

1. `deploy/environments/tke/values-production.yaml` 强制 `provider: cos`。
2. `backend/src/providers/objectStorage/objectStorageProvider.ts` 仍拒绝 `cos`，只允许 `local|mock`。
3. `db/migrations/035_phase18_fulfillment_evidence_object_storage.sql` 的数据库约束只允许 `local|mock`、`stored_local|stored_mock`、`external_provider_executed = 0` 以及本地/mock URI。

直接在 N4 中绕过这个问题，会造成 Production Pod 启动失败，或造成对象证据写入与数据库约束冲突。

## 关闭条件

先增加一个独立高风险节点（建议命名 `codex/tke-cos-schema`），完成后重新执行集成点 1：

1. 新增不可改写旧 migration 的增量 migration，扩展 COS provider、状态、外部执行标志和 URI 约束。
2. 加法扩展 `packages/types`、`packages/validators` 与 repository 行类型。
3. 将 `TencentCosObjectStorageAdapter` 接入工厂，并设置显式、默认关闭的生产双重开关。
4. 验证旧 `local|mock` 数据兼容、COS 写入、失败重试、审计字段和回退路径。
5. 重新复跑 N2、N1、N3 与组合回归；只有新的集成结论为 `SUCCESS`，才允许 N4 开工。
