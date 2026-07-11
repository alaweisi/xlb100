# PHASE8I_STATEMENT_AUDIT_QUERY_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**路径：** `G:\xlb100`  
**阶段：** Phase 8I — Statement Audit Query Foundation  
**报告日期：** 2026-07-04  

## Lock status — **IMPLEMENTED / PENDING LOCK**

| Item | Value |
|------|-------|
| **Merged to main** | no |
| **Tag** | none |
| **Branch** | `phase8i-statement-audit-query-foundation` |
| **Baseline main** | `a2a7679` — Phase 8H LOCKED |
| **Phase 8H tag (retained)** | `xlb-phase8h-worker-receivable-statement-export-package` → `a2a7679` |
| **Phase 8I** | **IMPLEMENTED** — pending Lock |
| **Phase 8J** | **NOT started** |

---

## 1. Executive Summary

### 本 Phase 做了什么

为 operator / internal admin 提供 worker receivable statement → review → export 的**只读审计查询**基础能力。新增 3 个 `GET` API，纯 SELECT 查询，零写入。

### 本 Phase 没做什么

- 未写 event_outbox
- 未改任何状态（statement/review/export/queue/payable/batch）
- 未改 ledger_entries / order / payment / fulfillment
- 未新增业务表（migration 020 不需要，已有索引足够）
- 未接 UI
- 未碰 payout / paid / provider / payment_instruction / notification / refund / aftersale

### 是否满足只读审计查询目标

**是。** 三个 audit API 覆盖 statement + review + export 全链路只读查询。

---

## 2. Baseline

| 项 | 值 |
|----|-----|
| start branch | `main` @ `a2a7679` |
| start HEAD | `a2a76796776a05554f316adba5c8e0c08910d670` |
| 8H tag | `xlb-phase8h-worker-receivable-statement-export-package` → `a2a7679` |
| worktree | clean |

---

## 3. Implementation Summary

| 类别 | 内容 |
|------|------|
| 新增 API | `GET /api/internal/settlement/worker-statement-audit` (list)<br>`GET /api/internal/settlement/worker-statement-audit/:statementId` (detail)<br>`GET /api/internal/settlement/worker-statement-export-audit` (export list) |
| 新增 repository | `workerReceivableStatementAuditRepository.ts` |
| 新增 service | `workerReceivableStatementAuditService.ts` |
| 新增 types | `StatementAuditQuery`, `StatementAuditItem`, `StatementAuditListResponse`, `StatementAuditDetailResponse`, `ExportAuditQuery`, `ExportAuditItem` |
| 新增 validators | `statementAuditQuerySchema`, `statementAuditItemSchema`, `statementAuditListResponseSchema`, `statementAuditDetailResponseSchema`, `exportAuditQuerySchema`, `exportAuditItemSchema`, `exportAuditListResponseSchema` |
| 新增 api-client 方法 | `listStatementAudit`, `getStatementAuditDetail`, `listExportAudit` |
| migration 020 | **未创建** — 已有索引 (`idx_*_city`, `idx_*_worker`, `idx_*_generated_at/reviewed_at/exported_at`) 足够 |
| 新增 tests | unit (1), integration (3), contract (1), security (1) |
| 新增 gates | 8 个 Phase 8I gate scripts |
| 更新 preflight | Phase 0–8I pass-through |

---

## 4. API Surface

### 4.1 List Statement Audit

```
GET /api/internal/settlement/worker-statement-audit
```

Query params (all optional): cityCode, workerId, statementId, reviewDecision, hasReview, hasExport, exportFormat, statementCreatedFrom, statementCreatedTo, reviewedFrom, reviewedTo, exportedFrom, exportedTo, limit (default 50, max 200), cursor

Response: `{ ok: true, items: StatementAuditItem[], nextCursor: string | null }`

### 4.2 Statement Audit Detail

```
GET /api/internal/settlement/worker-statement-audit/:statementId
```

Response: `{ ok: true, statement, review: null | Review, export: null | Export, exportedOutboxEvent: null | OutboxEvent }`

### 4.3 Export Audit List

```
GET /api/internal/settlement/worker-statement-export-audit
```

Query params (all optional): cityCode, workerId, statementId, exportFormat, contentHash, exportedFrom, exportedTo, limit, cursor

Response: `{ ok: true, items: ExportAuditItem[], nextCursor: string | null }`

### City Scope 行为

- 所有查询强制 city scope（通过 request context / `assertCityScopedContext`）
- detail 跨城返回 404
- 不支持的 cityCode 返回 403/404（按现有规则）

---

## 5. DB Boundary Evidence

- 运行时仅 SELECT（repository 中无 INSERT/UPDATE/DELETE）
- migration 020 未创建（已有索引足够）
- 无状态变更
- 不写 event_outbox

---

## 6. City Scope Evidence

验证项目（由集成测试覆盖）：
- list 查询仅返回当前 city data
- detail cross-city 返回 404
- query cityCode 参数不可越权

---

## 7. Read-only Invariant Evidence

验证项目（由 audit read-only invariant 测试覆盖）：
- 查询前后 statement/review/export/outbox count 不变
- content_hash 不变
- 不新增 outbox event
- 不重算 content_hash

---

## 8. Forbidden Zone Evidence

- 无 payout / paid / settlement paid
- 无 payment_instruction
- 无 provider
- 无 notification consumer
- 无 refund / aftersale / reversal
- 无 UI 改动 (apps/*)
- 无 ledger_entries 修改

---

## 9. Test Results

> 将在全量验证后填写

| Check | Result |
|-------|--------|
| build | |
| typecheck | |
| targeted tests | |
| full tests | |
| preflight | |
| 8B-8H gates | |
| 8I gates | |

---

## 10. Files Changed

### backend
- `backend/src/settlement/workerReceivableStatementAuditRepository.ts` (new)
- `backend/src/settlement/workerReceivableStatementAuditService.ts` (new)
- `backend/src/settlement/settlementRoutes.ts` (modified)

### packages
- `packages/types/src/settlement.ts` (modified)
- `packages/types/src/index.ts` (modified)
- `packages/validators/src/settlementSchema.ts` (modified)
- `packages/validators/src/index.ts` (modified)
- `packages/api-client/src/settlement.ts` (modified)

### tests
- `tests/unit/workerReceivableStatementAuditService.test.ts` (new)
- `tests/integration/workerReceivableStatementAudit.test.ts` (new)
- `tests/integration/workerReceivableStatementAuditCityScoped.test.ts` (new)
- `tests/integration/workerReceivableStatementAuditReadOnlyInvariant.test.ts` (new)
- `tests/contract/workerReceivableStatementAudit.contract.test.ts` (new)
- `tests/security/workerReceivableStatementAuditGates.test.ts` (new)

### scripts
- `scripts/check-worker-receivable-statement-audit-readonly.ps1` (new)
- `scripts/check-worker-receivable-statement-audit-no-mutation-routes.ps1` (new)
- `scripts/check-worker-receivable-statement-audit-city-scope.ps1` (new)
- `scripts/check-worker-receivable-statement-audit-index-only-migration.ps1` (new)
- `scripts/check-worker-receivable-statement-audit-no-ui.ps1` (new)
- `scripts/check-worker-receivable-statement-audit-forbidden-zone.ps1` (new)
- `scripts/check-worker-receivable-statement-audit-no-outbox-write.ps1` (new)
- `scripts/check-worker-receivable-statement-audit-route-order.ps1` (new)
- `scripts/preflight-architecture.ps1` (modified)

### docs
- `docs/reports/PHASE8I_STATEMENT_AUDIT_QUERY_FOUNDATION_REPORT.md` (new)

---

## 11. Known Issues

- `reference.md` 内容滞后（Readiness Scan 中发现），本 Phase 不修
- CURRENT_STATE 将在 Lock/Post-Lock 时更新

---

## 12. Commits

| # | Message | Hash |
|---|---------|------|
| 1 | feat(settlement): add phase 8i statement audit query foundation | (pending) |
| 2 | docs(reports): add phase 8i implementation report | (pending) |

---

## 13. Final Statement

- **未 merge main**
- **未 tag**
- **未 post-lock**
- **Phase 8I 仅完成 implementation，等待总指挥审查和 Lock Prompt**
- **Phase 8J 未启动**
