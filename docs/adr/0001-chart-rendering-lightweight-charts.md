# 图表渲染：使用 Lightweight Charts 的 DSH 双面插件

图表通过双面客户端插件在 DSH 会话中内联渲染，使用 TradingView 的开源 Lightweight Charts（Apache-2.0），数据来自我们自己的 Binance/Hyperliquid OHLCV，指标由我们这一侧计算并作为额外系列绘制。

我们拒绝了 TradingView **Widget**（它只能显示 TradingView 自己的数据，无法接收我们的数据或指标），现阶段也拒绝了 TradingView **Advanced Charts**（其免费许可只允许公共/免费服务，明确不允许私有、个人或内部使用，并禁止开源或再分发该库）。

## 后果 (Consequences)

- **迁移路径。** 已被 ADR-0003 关闭：该插件以开源形式发布，而 Advanced Charts 的许可禁止开源项目及该库的再分发。数据/指标层仍然通过一个小型图表数据接缝与 Lightweight Charts 的具体实现解耦，因为无论怎样这个接缝都是良好的设计。
- **署名。** Lightweight Charts 是 Apache-2.0 **外加** TradingView 的署名要求：保留默认的 `attributionLogo` 和/或添加 NOTICE 文本及 tradingview.com 链接；再分发时保留 Apache-2.0 LICENSE/NOTICE。

## 状态 (Status)

accepted
