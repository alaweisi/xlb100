# P7 — Customer Theme、BrandLogo 与资产运行时

## 施工边界

P7只负责顾客端视觉呈现，不决定页面组件顺序、数据请求、业务动作、权限、价格、订单状态或发布流程。

- P3拥有页面组合引擎、组件注册表和动作白名单。
- P5拥有数据与动作协调。
- P6拥有服务端草稿、审核、发布、灰度、下架和回滚。
- P7消费已经解析并通过共享校验器检查的主题/资产Envelope。
- P8负责将P3—P7接入真实主页。

## 运行链路

```text
共享Envelope校验器
  -> resolveRuntimeTheme（范围、过期、kill switch、主题白名单）
    -> Customer基础Token + 受控L4/L7差量
      -> CustomerDesignSystemRoot

资产Manifest
  -> 来源策略复核
    -> fetch bytes
      -> MIME + byteSize + maxBytes + SHA-256 SRI
        -> verified object URL
          -> BrandLogoProvider
```

## 不变量

1. 顾客端基础视觉继续以批准主页PNG为唯一真相：背景 `#CFEFEF`、操作强调 `#FF6A00`、正文 `#1F2D2D`。
2. 远端主题只能影响共享契约允许的Campaign层；焦点、状态、金额和工作流语义不允许被覆盖。
3. Logo默认永远是文本 `xlb100`。加载中、校验失败、资源缺失、图片解码失败时均回退到它。
4. Manifest只能引用声明过的图片资产，不能携带HTML、CSS、脚本、任意跳转或可执行代码。
5. 品牌Logo必须是非装饰性资产并提供可访问名称。
6. P7不直接依赖网络API。P4/P8负责Envelope交付，P7只校验并呈现输入。

## 集成约定

P7模块入口位于 `packages/customer-components/src/presentation/index.ts`。平台最终公共Barrel由P10统一接入，避免P3、P5、P7并行修改同一中央出口文件。

P8应将正式 `runtimeThemeEnvelopeSchema` 作为 `CustomerPresentationProvider.validator` 注入，并将当前城市、路由和运行能力作为scope输入。不得在组件内部推断城市或认证范围。

## 验收

- Customer基础Token在合法活动主题下保持不变。
- 非法、过期、范围不匹配、kill switch主题回退到Customer基础主题。
- Logo替换前完成来源、MIME、大小和SRI校验。
- 主Logo失败时只沿Manifest声明的fallback链解析。
- Logo切换和图片失败后仍可恢复，不锁死在旧失败状态。
- 单元测试、组件包typecheck/build/lint通过。
