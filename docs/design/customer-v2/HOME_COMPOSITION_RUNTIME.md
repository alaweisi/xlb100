# Customer Home Composition Runtime

> 工程阶段：P3 前端组合运行时
>
> 依赖：P2 `@xlb/types` Customer SDUI 共享契约与 `@xlb/validators` 严格校验

## 1. 本阶段交付边界

P3只建立顾客端主页的客户端组合内核，不加载远端Manifest、不请求业务API、不实现最终主页视觉：

- `HomeComponentRegistry`：应用内置组件白名单和组件能力声明；启动后必须封存。
- `HomeActionRegistry`：应用拥有的动作处理器白名单；只接受共享契约动作键，不接受脚本或URL。
- `HomeCompositionEngine`：将已经过Schema校验的Manifest转换为能力匹配后的确定性组件计划。
- `HomeRenderer`：渲染通过能力检查的计划，并隔离单个组件的渲染异常。

原始JSON只能先通过P2校验器，不能直接进入组合引擎。P4负责Manifest加载、缓存、LKG和内置回退；P5负责数据与动作协调；P8负责注册真实主页组件并完成视觉落地。

## 2. 安全热插拔语义

Manifest只能选择、排序、启停客户端已经打包并注册的组件。注册表不提供远端注册、动态`import()`、运行时替换或任意URL执行能力。组件定义同时声明：

- 固定组件类型和区域；
- 支持的组件契约版本；
- 每个数据槽允许的数据键；
- 每个动作槽允许的动作键；
- 必需槽与可选槽。

注册表在交给组合引擎前必须调用`seal()`。封存后新增或替换组件、动作都会被拒绝。

## 3. 组合结果

组合结果有三种状态：

- `ready`：全部启用组件通过客户端能力检查；
- `degraded`：普通业务组件被安全跳过，其余主页仍可渲染；
- `rejected`：定位头、搜索或底部导航等受保护壳组件不可用，或没有安全内容组件；P4必须改用LKG或内置主页。

组件按`header -> content -> footer`和各区域`order`确定性排序。未知组件、未知槽、数据键不匹配、动作键不匹配、动作处理器缺失和契约版本不兼容均不会进入渲染计划。

## 4. 渲染可靠性

`HomeRenderer`只消费`HomeCompositionResult`：

- `rejected`结果显示安全页面回退，不渲染部分主页；
- 每个组件实例拥有独立Error Boundary；
- 一个普通组件崩溃时显示局部回退，后续组件继续渲染；
- Manifest修订号变化时重建实例边界，旧版本错误状态不会污染新版本；
- 错误回调失败不会阻断顾客页面。

P5通过`HomeRuntimeBindingsResolver`向组件注入归一化数据和已绑定动作。业务组件不得自行解释`dataRef`、调用任意API或根据UI条件代替后端授权。

## 5. 后续集成点

```text
P4 validated manifest
  -> HomeCompositionEngine
    -> HomeCompositionResult
      -> P5 HomeRuntimeBindingsResolver
        -> HomeRenderer
          -> P8 bundled home components
```

P3不修改SKU、订单、支付、退款、权限或任何后端业务工作流。
