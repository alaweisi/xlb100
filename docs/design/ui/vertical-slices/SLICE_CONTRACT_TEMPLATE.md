# XLB Slice Contract 模板

> 复制本文件创建单个业务切片。所有“待填写”必须在进入高保真设计前解决；不适用字段写明原因，不能留空。

## 1. Identity

| Field | Value |
| --- | --- |
| Slice ID | 待填写 |
| 中文标题 | 待填写 |
| Slice Level | business-scene / decision-scene / handoff-scene / recovery-scene / ui-variant |
| Actor | customer / worker / admin / cross-role |
| Exact Role | 待填写 |
| Domain | 待填写 |
| Route | 待填写 |
| Surface | page / dialog / bottom-sheet / drawer / component |
| Priority | P0 / P1 / P2 |
| Owner | 待填写 |

## 2. User Goal And Entry

| Field | Value |
| --- | --- |
| User Goal | 待填写 |
| Entry Trigger | 待填写 |
| Preconditions | 待填写 |
| Entry Slice IDs | 待填写 |

## 3. Backend Truth

| Field | Value |
| --- | --- |
| Workflow Name | 待填写 |
| Backend State | 待填写 |
| State Source | backend / api-contract / frontend-derived-from-api / not-wired-policy |
| Contract Docs | 待填写 |
| Endpoints | 待填写 |
| Backend Modules | 待填写 |
| Identity Source | 待填写 |
| City Scope | 待填写 |
| Permission Source | 待填写 |

### Authoritative Facts

- 待填写

### Forbidden Claims

- 待填写

## 4. State Narrative

| Question | Answer |
| --- | --- |
| Current Step | 待填写 |
| Current Owner | 待填写 |
| Next Available Step | 待填写 |
| Blocked Reason | 待填写或说明不适用 |
| Estimated Time | 待填写、未知或说明不适用 |
| Recovery Path | 待填写 |
| Terminal | true / false |

## 5. Actions

为每个 Primary、Secondary、Tertiary、Destructive 动作复制一张表。

| Field | Value |
| --- | --- |
| Action ID | 待填写 |
| Label | 待填写 |
| Kind | primary / secondary / tertiary / destructive |
| Enabled | true / false |
| Disabled Reason Code | 待填写或 null |
| Source | backend / api-derived / not-wired |
| Endpoint | 待填写或说明不适用 |
| Method | GET / POST / PUT / PATCH / DELETE / N/A |
| Confirm Required | true / false |
| Idempotency Required | true / false |
| Audit Required | true / false |
| City Scope Required | true / false |
| Success Transition | 待填写 |
| Failure Presentation | 待填写 |
| Recovery Action | 待填写 |

## 6. Handoff

| Field | Value |
| --- | --- |
| Handoff Type | none / same-actor / cross-actor / system-worker |
| Next Actor | 待填写或 N/A |
| Trigger Event | 待填写或 N/A |
| Receiving Slice ID | 待填写或 N/A |
| Shared Business ID | 待填写或 N/A |
| Facts Transferred | 待填写或 N/A |
| Freshness Expectation | realtime / polling / refresh / bounded delay / N/A |
| Notification Effect | 待填写或 N/A |

## 7. Exception And Recovery Matrix

| Situation | Applicable | Presentation | User Copy | Allowed Actions | Recovery Slice ID |
| --- | --- | --- | --- | --- | --- |
| Loading failure | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| Empty | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| Offline / timeout | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| 401 identity expired | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| 403 permission/city | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| 409 conflict | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| 422 validation | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| Duplicate/idempotent | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| Partial success | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |
| Not wired | yes/no | 待填写 | 待填写 | 待填写 | 待填写 |

## 8. Design Binding

| Field | Value |
| --- | --- |
| Figma Binding | exact / partial / derived / DESIGN_SOURCE_MISSING |
| Figma Page | 待填写 |
| Frame Name | Actor / Domain / Scenario / State |
| Node ID | 待建立 |
| Reference Sources | 待填写 |
| Reference Only / Do Not Inherit | 待填写 |
| Viewport | 待填写 |
| UI Slots | 待填写 |
| Components | 待填写 |
| Runtime Tokens | 待填写 |
| Responsive Rules | 待填写 |
| Motion / Haptic / Sound | 待填写或说明不适用 |

## 9. Copy And Accessibility

| Field | Value |
| --- | --- |
| Page Title | 待填写 |
| State Title | 待填写 |
| Explanation | 待填写 |
| Primary CTA | 待填写 |
| Secondary CTA | 待填写或 N/A |
| Disabled Reason Copy | 待填写或 N/A |
| Loading Copy | 待填写 |
| Empty Copy | 待填写 |
| Error Copy | 待填写 |
| Success Copy | 待填写 |
| Screen Reader Title | 待填写 |
| Live Region | 待填写或 N/A |
| Focus Order / Return | 待填写 |
| Keyboard Support | 待填写或 N/A |
| Non-color Status Cue | 待填写 |

## 10. Evidence

| Field | Value |
| --- | --- |
| Fixture | 待填写 |
| API Evidence | 待填写 |
| Figma Evidence | 待填写 |
| Screenshot Evidence | 待填写 |
| Interaction Evidence | 待填写 |
| Accessibility Evidence | 待填写 |
| Cross-actor Evidence | 待填写或 N/A |

## 11. Definition Of Ready

- [ ] ID、角色、目标和切片边界明确。
- [ ] 后端状态、接口、权限和城市范围有来源。
- [ ] 可展示事实与禁止声称内容明确。
- [ ] 动作合同完整。
- [ ] 前序、后序和跨端交接完整。
- [ ] 异常和恢复路径完整。
- [ ] Figma 参考与不继承内容明确。
- [ ] 可以通过合法测试数据进入该状态。

## 12. Definition Of Done

- [ ] Frame 或 Component Variant 完成并可追溯到 Slice ID。
- [ ] 主操作、状态和禁用原因与后端一致。
- [ ] 适用的 Loading、Empty、Error、Conflict 状态已覆盖。
- [ ] 跨端事实一致且有证据。
- [ ] 无假数据、假状态或本地假成功。
- [ ] 响应式、无障碍和交互证据齐全。
- [ ] WorkflowUiBinding 与实现已同步。
