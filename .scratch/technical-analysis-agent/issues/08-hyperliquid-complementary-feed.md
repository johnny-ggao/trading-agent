# 08: Hyperliquid 补充源

**要构建什么：** 接入 Hyperliquid 作为补充源：原生永续数据与 HL 独有标的；诚实暴露其 ~5000 根 K 线上限，长回看仍走 Binance。

**Blocked by:** 02

**Status:** ready-for-agent（**待工单 12 定下数据接口形态后再动**）

> 依据 [ADR-0008](../../../docs/adr/0008-agent-driven-data-fetch.md)，HL 的补充数据不再塞进
> `trading_chart` 的返回体，而是作为 **`trading_derivatives`** 工具的一个来源接入，接口形态随
> [工单 12](12-on-demand-data-tools.md) 一并确定。取舍清单（哪些字段值得进、边界如何诚实暴露）
> 见 [docs/research/hyperliquid-extra-data.md](../../../docs/research/hyperliquid-extra-data.md)。

- [ ] `HyperliquidProvider`（实现既有 `MarketDataProvider` 接缝）
- [ ] HL 标的行情（K 线 + 上市资产覆盖）
- [ ] 历史上限的诚实提示（1h 仅最近 5000 根 ≈ 208 天；请求更早窗口要明确说明，而不是静默返回空）
- [ ] 衍生品字段进 `trading_derivatives`：资金费、OI、标记价、预言机价、溢价、冲击价、24h 量价、跨场所预测资金费、OI 上限清单
- [ ] 录制 fixture 测试（不依赖实时网络；HL 的 1200 weight/min 与 5000 根上限要有断言覆盖）
