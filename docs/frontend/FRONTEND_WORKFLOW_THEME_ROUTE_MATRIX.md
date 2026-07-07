# Frontend Workflow Theme Route Matrix

| route | workflow | Figma source | theme surface | adapter | packages/ui components | campaign theme support | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/customer/` | Customer catalog discovery | partial customer home frame | customer home shell, service category cards, banner area | customer workflow binding adapter (only one business translation layer) | `RuntimeThemeSurface`, `ServiceCard`, `CustomerAnswerCard`, `ActionDock` | future via app theme bridge | READY for C pixel repair |
| `/customer/services` | Customer service browse | partial service list frame | service list, search/filter surface | customer workflow binding adapter | `RuntimeThemeSurface`, `ServiceCard`, `Tabs`, `ActionDock` | future via app theme bridge | READY for C pixel repair |
| `/customer/order/create` | Quote to order to payment order | exact/partial create order frame | quote card, order form, payment order panel | customer workflow binding adapter | `RuntimeThemeSurface`, `CustomerQuoteCard`, `WorkflowTimeline`, `ActionDock` | future via app theme bridge | READY for C product UAT |
| `/customer/orders` | Customer order review | partial orders frame | order list/detail review surface | customer workflow binding adapter | `RuntimeThemeSurface`, `OrderCard`, `WorkflowStatePanel`, `NotWiredState` | future via app theme bridge | PARTIAL, list API missing |
| `/customer/profile` | Customer account/profile | partial profile frame | profile/account state surface | customer workflow binding adapter | `RuntimeThemeSurface`, `NotWiredState`, `CustomerAnswerCard` | future via app theme bridge | PARTIAL, profile API missing |
| `/worker/` | Worker availability overview | partial worker home/grab hall frame | availability panel, task summary | worker workflow binding adapter | `RuntimeThemeSurface`, `WorkerStatusCard`, `WorkerAnswerCard` | future via app theme bridge | PARTIAL, backend availability required |
| `/worker/tasks` | Worker task pool and fulfillment | partial task pool frame | task pool, task detail state | worker workflow binding adapter | `RuntimeThemeSurface`, `WorkerTaskCard`, `WorkflowTimeline`, `ActionDock` | future via app theme bridge | PARTIAL, task pool wiring required |
| `/worker/wallet` | Worker wallet/income | partial wallet frame | wallet summary, ledger entry surface | worker workflow binding adapter | `RuntimeThemeSurface`, `StatCard`, `NotWiredState` | future via app theme bridge | PARTIAL, wallet API missing |
| `/worker/profile` | Worker profile | partial profile frame | profile and service city surface | worker workflow binding adapter | `RuntimeThemeSurface`, `WorkerAnswerCard`, `NotWiredState` | future via app theme bridge | PARTIAL, profile wiring required |
| `/worker/certification` | Worker certification | partial certification/profile frame | certification status and submission surface | worker workflow binding adapter | `RuntimeThemeSurface`, `WorkflowStatePanel`, `NotWiredState` | future via app theme bridge | PARTIAL, certification wiring required |
| `/admin/` | Admin settlement/governance shell | derived admin frame only | admin shell/table/status visuals | existing admin route logic; no Phase 15.3T app change | `AdminToolbar`, `ScopeBadge`, `StateBadge`, `Table` | `no`（waiting for Campaign integration） | BLOCKED for Settlement/Governance exact pixel repair |

## Cross-cutting Layer Mapping

- Workflow layer source: backend API + `WorkflowUiBinding` adapters.
- Visual layer source: Figma route frame set + Runtime Theme Tokens.
- Shell decision layer: app route page + safe mobile frame mode.
- Governance:
  - 所有按钮动作必须可追溯 backend/action binding；
  - 业务禁用文本不得直接来自组件本地文案池；
  - Campaign 仅注入视觉，不改变业务路由行为。
