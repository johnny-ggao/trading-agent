# 08: Hyperliquid 补充源

**要构建什么：** 接入 Hyperliquid 作为补充源：原生永续数据与 HL 独有标的；诚实暴露其 ~5000 根 K 线上限，长回看仍走 Binance。

**Blocked by:** 02

**Status:** done（2026-09-22 落地；超范围项见文末）

> 依据 [ADR-0008](../../../docs/adr/0008-agent-driven-data-fetch.md)，HL 的补充数据不再塞进
> `trading_chart` 的返回体，而是作为 **`trading_derivatives`** 工具的一个来源接入，接口形态随
> [工单 12](12-on-demand-data-tools.md) 一并确定。取舍清单（哪些字段值得进、边界如何诚实暴露）
> 见 [docs/research/hyperliquid-extra-data.md](../../../docs/research/hyperliquid-extra-data.md)。

- [x] `HyperliquidProvider`（实现既有 `MarketDataProvider` 接缝；`fetchCandleBatch` 带来源与保留信息）
- [x] HL 标的行情（K 线 + 未上市币种明确报错）
- [x] 历史上限的诚实提示（`truncated` + `note`：超出保留窗口时指向 Binance，不静默返回空）
- [x] 衍生品字段进 `trading_derivatives`：资金费、溢价、OI、标记价、预言机价、中间价、冲击价、24h 量价、昨日价、跨场所预测资金费、OI 上限清单
- [x] 录制 fixture 测试（18 例，不依赖实时网络；5000 上限与截断有断言）
- [ ] 速率限制的主动退避（HL 1200 weight/min）：目前未实现自重试，留待有实际需要时做

## Comments

- 2026-09-22：**落地。**
  - `src/market/hyperliquid.ts`：`candleSnapshot`（毫秒→秒、字符串价格→数字、周期白名单校验，
    HL 不支持 1s/2d 就抛错）、`metaAndAssetCtxs`（universe 与 assetCtxs 按下标对齐）、
    `predictedFundings`、`perpsAtOpenInterestCap`；全部只读、免 key。
  - 接缝扩展：`FetchLike` 放宽为与真实 fetch 同形（POST 需要 init）；新增 `CandleBatch`
    与可选 `fetchCandleBatch?`；`DerivativesSnapshot` 扩到 HL 能给的全套。
  - `trading_derivatives` 工具（ADR-0008 的按需形态）：`fields` 点名要哪些，缺省给常用一组；
    `predictedFunding` / `openInterestCap` 只在点名时才发额外请求；字段按请求投影，不夹带。
  - 真实联调（无需 key）：BTC 资金费 0.0000125 / OI 43831 / 标记 85362.7 / 预言机 85312.4 /
    冲击价 [85363, 85364]；跨场所预测资金费 BinPerp 0.000093 vs HlPerp 0.0000125 vs
    BybitPerp 0.0001（**Binance 端贵 7 倍以上**，正是"多头拥挤在 CEX"的直接证据）；
    OI 上限清单返回 9 个资产。
  - 测试 18 例（provider）+ 4 例（工具层）+ 4 条 skill 断言；全库 255 例通过。
