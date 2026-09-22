# 图表渲染：使用 Lightweight Charts 的 DSH 双面插件

图表通过双面客户端插件在 DSH 会话中内联渲染，使用 TradingView 的开源 Lightweight Charts（Apache-2.0），数据来自我们自己的 Binance/Hyperliquid OHLCV，指标由我们这一侧计算并作为额外系列绘制。

我们拒绝了 TradingView **Widget**（它只能显示 TradingView 自己的数据，无法接收我们的数据或指标），现阶段也拒绝了 TradingView **Advanced Charts**（其免费许可只允许公共/免费服务，明确不允许私有、个人或内部使用，并禁止开源或再分发该库）。

## 后果 (Consequences)

- **迁移路径。** 已被 ADR-0003 关闭：该插件以开源形式发布，而 Advanced Charts 的许可禁止开源项目及该库的再分发。数据/指标层仍然通过一个小型图表数据接缝与 Lightweight Charts 的具体实现解耦，因为无论怎样这个接缝都是良好的设计。
- **署名。** Lightweight Charts 是 Apache-2.0 **外加** TradingView 的署名要求：保留默认的 `attributionLogo` 和/或添加 NOTICE 文本及 tradingview.com 链接；再分发时保留 Apache-2.0 LICENSE/NOTICE。

## 状态 (Status)

accepted；**「渲染位置」一节已被 [ADR-0006](0006-sidebar-native-chart-tab.md) 取代**（图表改在右侧栏原生自定义 tab 渲染）。图表库选型与署名部分仍然有效。

> 下面「渲染位置」一节记录的是当时（0.1.6-alpha.1 内联）的决策，已被 ADR-0006 取代，保留作为历史。

## 渲染位置

图表渲染在**回合末尾**（`conversation.chat.turnTail` 槽），而**不是**工具卡（`tool.call.toolview`）。这样它出现在助手最终回答之后、操作行之前，读起来就是"回复的一部分"。宿主工具通过 `presentationMeta` 把 `chartSpec` 交给客户端；客户端在该回合的工具结果节点（`tool-call` 的 `data.root.meta`）里找到它并渲染。助手正文本身只支持文本与图片，无法承载自定义交互组件，所以自定义 UI 只能落在槽位里。

这次修复暴露了一个必须记住的事实：**已安装的 dsh（0.1.6-alpha.1）与源码检出（0.1.6-alpha.2）在槽位声明上不一致**。alpha.1 把 `conversation.chat.turnTail` 声明为 **chain**（注册必须带 `options.select`，第一个接受的条目渲染）；alpha.2 才改成 **list**。我们按 list 注册，插件 apply 时抛 `chain slot ... requires options.select`，整条贡献被丢弃——于是工具图没了、末尾图也没出现。注册因此写成 chain 形态：`select` 总是接受，由组件在本回合没有 `trading_chart` 结果时返回 null。**实现必须以已安装运行时（alpha.1）的契约为准，而不是源码检出。**
