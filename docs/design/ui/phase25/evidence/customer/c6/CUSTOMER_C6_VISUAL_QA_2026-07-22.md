# C6 客服账户视觉 QA

日期：2026-07-22  
施工窗：P6-C6（只读视觉 QA）  
范围：顾客端客服、消息通知、我的、服务地址  
唯一视觉真相：`docs/design/ui/references/customer-home-visual-truth.png`

## 结论

C6 通过。客服、通知、我的/地址均继承了主页的设计语言，同时保持各自业务布局；本轮未发现需要回到业务源代码修复的 P0、P1 或 P2 缺陷。

缺陷计数：P0 = 0，P1 = 0，P2 = 0。

## 视觉判读

三个业务面与主页真相保持同一套暖白底色、深绿信息层级、橙色主操作、圆角服务卡、轻描边与柔和阴影。客服使用工单与对话的业务结构，通知使用消息收件箱结构，我的使用账户与地址结构；它们继承主页语言，但没有复制主页布局。

通过点：

- 顾客端身份明确，未混入师傅端或后台管理端外壳。
- 每条路由只存在一个顾客端应用外壳和一个底部主导航。
- 客服的关闭工单、处理时间线和在线会话均为服务端确认后的状态表达。
- 通知的未读/已读、归档和 409 冲突恢复没有乐观覆盖服务端结果。
- 地址编辑明确提示手机号需重新输入，隐私与保存语义清晰。
- 页面没有暴露 `rowVersion`、`idempotencyKey`、fixture 等工程文案。

## 自动化门禁

- 320 / 390 / 430 px：无横向溢出。
- 可见按钮、链接、输入框、选择器和文本域：最小触控尺寸不低于 44 px。
- 键盘焦点可达；减弱动画模式下无持续动画。
- 强制颜色模式下核心业务容器可见。
- 顾客端相关单元/契约测试：8 个文件、35 项通过。
- C6 Playwright 运行态取证：5 个场景通过。
- `@xlb/customer` TypeScript 检查通过。
- `@xlb/customer...` 生产构建通过。
- 运行态控制台无非预期错误；通知 409 为受控冲突场景。

## 证据索引

1. `01-support-ready-390x844.png` — 客服工单入口正常态。
2. `02-support-ticket-detail-390x844.png` — 已关闭工单、时间线与补充说明。
3. `03-support-conversation-390x844.png` — 在线客服会话。
4. `04-notifications-ready-390x844.png` — 通知收件箱正常态。
5. `05-notifications-conflict-390x844.png` — 409 后加载服务端最新状态。
6. `06-profile-ready-390x844.png` — 我的账户正常态。
7. `07-profile-address-editor-390x844.png` — 地址编辑与隐私提示。
8. `08-support-home-comparison.png` — 客服与主页真相并排对照。
9. `09-notifications-home-comparison.png` — 通知与主页真相并排对照。
10. `10-profile-home-comparison.png` — 我的/地址与主页真相并排对照。
11. `customer-c6-visual-qa.report.json` — 机器可读门禁清单。

## 边界与剩余风险

本次结论基于 Chromium、当前代码、合同一致的 API 固件和上述视口矩阵。自动化截图、强制颜色和焦点检查不能替代完整的人工屏幕阅读器走查，也不构成完整 WCAG 合规声明。低性能 Android 设备上的毛玻璃渲染成本未纳入本 C6 视觉窗；如需性能结论，应由独立性能 QA 负责。

本 lane 未修改 `apps/customer`、`packages/ui`、`pnpm-lock.yaml` 或任何业务契约。
