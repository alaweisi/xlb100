# Customer UI Design QA

## 2026-07-20 全路由整改最终结果

- 使用 UI Master 八阶段完成顾客端 10 个 Carrier、9 条正式路由和登录门整改。
- Microsoft Edge 在 390×844 下拍摄 20 张正常/高风险状态图，全部通过统一 Shell、无横向滚动、底部导航和 44px 触控门禁。
- Microsoft Edge 在 1440×900 下逐一检查 9 条正式路由，App 画布均不超过 430px；下单页不会再退化为全宽电脑表单。
- 62 条业务切片映射：`docs/design/ui/CUSTOMER_62_SLICE_EDGE_EVIDENCE.md`。
- 最终截图与机器报告：`artifacts/design-qa/customer-edge-full-2026-07-20/`。
- 结果：通过。

## Comparison target

- Source visual truth: `C:\Users\kong\Downloads\已生成图像 2.png`
- Primary implementation route: `/customer/order/create?skuId=sku_home_daily_2h`
- Viewport: `390 × 844`
- Matched state: booking address step `2 / 4`, selected service, completed address/contact fields
- Combined comparison: `artifacts/design-qa/customer-2026-07-19/comparison-reference-vs-order-address.png`
- State coverage contact sheet: `artifacts/design-qa/customer-2026-07-19/state-coverage-loading-empty-error-success.png`
- Automated browser report: `artifacts/design-qa/customer-2026-07-19/qa-report.json`

## Full-view comparison evidence

- The reference and rendered implementation were resized to the same `390 × 844` viewport and inspected side by side in one combined image.
- The implementation now matches the reference hierarchy: centered booking title, four-step progress, selected-service glass summary, deep-green section labels, lightweight divider form, warm orange primary action, and five-item bottom navigation with an elevated center action.
- Liquid Glass is limited to navigation, search, selected-service summary, and action docks. Content and form surfaces remain stable and readable.

## Focused findings and resolutions

- [Resolved P1] Primary CTA was below the first viewport, then initially obscured the phone/time content when made fixed.
  Resolution: compacted the address form to the reference rhythm, reserved scroll space, and fixed the CTA above the bottom navigation without hiding the date or time rows.
- [Resolved P1] Home and service templates expanded to `417px` inside a `390px` viewport, clipping counts and card actions.
  Resolution: constrained runtime surfaces, template headers, cards, and search controls to the available `362px` content width.
- [Resolved P1] Internal workflow/debug cards and English actions were visible to customers.
  Resolution: removed internal answer cards from customer-facing home/services/orders views and localized reusable customer action labels.
- [Resolved P2] Search, category tabs, and the selected-service edit control had sub-44px touch targets.
  Resolution: all tested interactive targets now meet or exceed `44 × 44px`.
- [Resolved P2] Empty catalog rendered both catalog-empty and filter-empty messages.
  Resolution: filter-empty now appears only when the catalog contains categories.
- [Resolved P2] City codes and the final order status were exposed in English.
  Resolution: customer-facing city and order status labels are localized.

## State and interaction coverage

- Loading: `home-loading-390x844.png`
- Empty: `services-empty-390x844.png`
- Error: `services-error-390x844.png`
- Success: `order-create-success-390x844.png`
- Ready: `home-ready-390x844.png`, `services-ready-390x844.png`
- Core booking interaction executed in the browser: selected service → completed address → selected schedule → confirmed quote → submitted order → server-confirmed success.
- All seven captured states report `documentWidth: 390`, no horizontal overflow, and no undersized interactive targets.
- Unexpected browser console errors: none. The intentional `503` requests used to render the error state are recorded separately as expected errors.

## Fidelity review

- Typography: deep-green serif display headings and legible sans-serif body copy are consistent with the reference direction.
- Spacing: booking content fits the mobile viewport without sacrificing 44px interactive targets.
- Color: warm cream, deep green, restrained amber/orange, hairline borders, and limited glass highlights remain consistent across routes and states.
- Assets: Phosphor icons replace text glyphs/emoji in the customer navigation and search surfaces; no fake raster or SVG assets were introduced.
- Responsive behavior: verified at `390 × 844`; desktop behavior remains bounded by the existing `430px` customer shell.

## Comparison history

- Initial browser pass: found CTA placement, clipping, touch-target, and customer-copy issues.
- Second pass: corrected form density and fixed action placement; combined reference comparison completed.
- Final pass: corrected template intrinsic sizing, state duplication, state palette, city labels, and success status localization.

final result: passed
