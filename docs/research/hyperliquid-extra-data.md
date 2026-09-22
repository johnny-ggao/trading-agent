# Hyperliquid 相对 Binance 多出哪些数据（面向技术分析）

**截至 2026-09-22。** 为工单 08（Hyperliquid 补充源）做的事实调查：具体哪些数据是
Hyperliquid 能给、而 Binance 给不了（或形态明显不同），以及这些数据对技术分析判读的用处。

**方法。** 一手文档核对：Hyperliquid 官方机器可读文档（`llms-full.txt`，本次实抓 509 KB）、
Binance 官方机器可读文档（`llms-full.txt`，本次实抓 8.2 MB）。加上本仓库上一轮已在
[crypto-data-apis.md](crypto-data-apis.md) 中记录并**实时验证**过的响应样本。

## 一句话结论

**真正"Binance 完全没有"的只有两样**：跨场所预测资金费（`predictedFundings`）与
OI 上限预警（`perpsAtOpenInterestCap`）。其余大多是**同一个量、形态不同**——Hyperliquid
把资金费/OI/标记价/预言机价/溢价/24h 量价压在一次请求里给全，且订单簿与状态**在链上可验证**；
Binance 要拆成十几个端点、部分还有窗口限制，且爆仓数据公开渠道已停止维护。

## 逐个字段对照

### A. 单次调用就全给（`metaAndAssetCtxs`）

官方响应里每个资产的 `assetCtxs` 字段（docs 实抓）：

| 字段 | 含义 | Binance 对照 |
|---|---|---|
| `funding` | 当前资金费率（**每小时**结算） | 有：`/fapi/v1/premiumIndex` 的 `lastFundingRate`（**8 小时**结算为主，部分 4h） |
| `openInterest` | 未平仓量 | 有：`/fapi/v1/openInterest` |
| `markPx` | 标记价格 | 有：`premiumIndex`、`markPriceKlines` |
| `oraclePx` | **预言机价格**（验证者发布的 CEX 加权中位数，每 ~3 秒更新，用于算资金费） | **概念不同**：Binance 只有 `indexPrice`（自有指数）+ `indexPriceKlines`。Hyperliquid 的 oracle 是"跨 CEX 加权中位数"，可用来交叉验证 Binance 指数是否偏离 |
| `premium` | 合约价对预言机价的溢价（资金费的本体） | 有 `premiumIndex`；`premiumIndexKlines` 给历史 |
| `midPx` | 中间价 | 有 `bookTicker`（买一/卖一，可自行取中） |
| `impactPxs` | **冲击价**：吃下 `impactUsd`（默认 2 万美元）后的实际均价，双边 | **没有**：Binance 无等价端点，要自己拉深度算 |
| `dayNtlVlm` | 24h 名义成交额（计价资产） | 有：`ticker/24hr` 的 `quoteVolume` |
| `dayBaseVlm` | 24h 基础资产成交量 | 有：`ticker/24hr` 的 `volume` |
| `prevDayPx` | 昨日价（算涨跌幅用） | 有：`ticker/24hr` 的 `prevClosePrice` |

外加 `universe` 里的 `szDecimals`、`maxLeverage`（单资产最大杠杆）——Binance 也有杠杆档位，但要走 `leverageBracket`。

### B. 资金费历史（`fundingHistory`）

- Hyperliquid：`{coin, fundingRate, premium, time}`，分页 500 条一组，`fundingHistory` 每 20 条加 1 weight。
- Binance：`/fapi/v1/fundingRate`，limit 上限 1000（默认 100），与 `fundingInfo` 共享 **500/5min/IP**。
- **差异**：Hyperliquid 的按**小时**结算，样本密度是 Binance（8h）的 8 倍；且单独给出 `premium`（资金费的溢价分量）。做"资金费极值/回归"这类判读时密度差别很大。

### C. 跨场所预测资金费（`predictedFundings`）—— **Binance 完全没有**

官方响应样例：

```json
[["AVAX", [["BinPerp", {"fundingRate": "0.0001", "nextFundingTime": 1733961600000}],
           ["HlPerp",  {"fundingRate": "0.0000125", "nextFundingTime": 1733958000000}]]]]
```

同一个币在 **BinPerp / HlPerp / BybitPerp** 等场所的**预测资金费与下次结算时间**并排给出。
Binance 文档中检索 `predicted`、`cross-exchange` 均为 0 命中。

**用处**：资金费套利/拥挤度是典型的"跨场所"信号——同一个 BTC，若 Binance 端资金费显著高于
Hyperliquid，说明多头拥挤集中在 CEX。这是纯 Binance 数据源**原理上拿不到**的视角。

### D. 风险与容量信号

| 数据 | 说明 | Binance 对照 |
|---|---|---|
| `perpsAtOpenInterestCap` | 已达 OI 上限、**无法再开新仓**的资产列表（样例 `["BADGER","CANTO","FTM","LOOM","PURR"]`） | **没有等价物**，是最接近"市场已经满了"的公开信号 |
| `maxLeverage` | 单资产最大杠杆 | 有 `leverageBracket` |
| 预言机价 + 溢价 | 见上 | 概念不同 |

### E. 链上可验证性（形态差异，非字段差异）

- 订单簿与状态**全部在链上**：`l2Book`（实时全深度）+ 官方档案桶
  `s3://hyperliquid-archive/market_data/<date>/<hour>/<datatype>/<coin>.lz4` 与
  `s3://hyperliquid-archive/asset_ctxs/<date>.csv.lz4`（仅 L2 快照与资产上下文，**不含 K 线**，
  请求方付流量费）。可对任意历史时点的深度做**事后验证**。
- Binance 的 L2 历史不公开提供（只有实时 depth 流）；爆仓数据更差：官方文档明确
  **`GET /fapi/v1/allForceOrders` 已停止维护、不再接受请求**，对应的爆仓推送流也不再推实时订单数据
  （`llms-full.txt` 第 56403–56427 行）。Hyperliquid 没有"爆仓流"，但链上成交流 + 全深度档案
  同样能反推清算冲击。
- 用户级链上数据（持仓、保证金、资金费收支、订单历史、账本变更、vault/质押）全部公开可查；
  Binance 这些只能用带签名的私有端点。

## 对工单 08 的取舍建议

值得进 `MarketView` 的（有明确技术分析语义、且一次请求拿得到）：

1. **资金费 + 溢价**（`funding`、`premium`）——判"多头/空头拥挤"，且小时级样本密度高；
2. **OI + 24h 量价**（`openInterest`、`dayNtlVlm`、`dayBaseVlm`）——量能状态的交叉印证；
3. **标记价 vs 预言机价 vs 中间价**（`markPx`/`oraclePx`/`midPx`）——三者背离本身就是信号；
4. **跨场所预测资金费**（`predictedFundings`）——唯一"Binance 原理上给不了"的一块；
5. **OI 上限清单**（`perpsAtOpenInterestCap`）——罕见的容量信号，成本极低（一次调用）。

成本与边界（必须诚实暴露给用户）：

- **K 线硬上限 5000 根**：1h ≈ 208 天、1m ≈ 3.5 天。长回看仍必须走 Binance。
- **速率限制**：Hyperliquid 按 IP 共享 **1200 weight/min**，多数 info 请求 weight 20，
  `candleSnapshot` 为 `20 + n/60`。我们现有的 Binance 路径不受影响，但 HL 侧要自己缓存。
- **覆盖窄**：约 178 个活跃永续 vs Binance 773 个合约 + 1368 个现货。HL 上市资产（如 HYPE）
  是补充价值，但别指望通用性。
- **许可**：HL 是无许可公开 API；Binance 受其 Product Terms 约束（见 [crypto-data-apis.md](crypto-data-apis.md) §3）。

## 容易说错的地方（写文档/答用户时注意）

- ❌ "Hyperliquid 才有资金费/OI/标记价" —— 错，Binance 合约都有，只是拆成多个端点、且有窗口限制。
- ❌ "Hyperliquid 有爆仓数据" —— 没有专门的爆仓端点；反过来 Binance 的爆仓 REST 已停维护。
- ✅ 准确表述：**跨场所预测资金费与 OI 上限预警是 HL 独有；其余是形态差异（单次调用/链上可验证/结算间隔不同）。**

## 来源

- Hyperliquid 官方机器可读文档：<https://hyperliquid.gitbook.io/hyperliquid-docs/llms-full.txt>
  （本次实抓 509 KB；`metaAndAssetCtxs`、`fundingHistory`、`predictedFundings`、
  `perpsAtOpenInterestCap`、`activeAssetData`、l2Book 订阅、速率限制、S3 档案格式）
- Binance 官方机器可读文档：<https://developers.binance.com/en/docs/llms-full.txt>
  （本次实抓 8.2 MB；爆仓端点停止维护见其中第 56403–56427 行）
- 本仓库前一轮实测记录：[crypto-data-apis.md](crypto-data-apis.md)（BTC `assetCtxs` 真实键、
  5000 根实测、速率限制实测）
- Hyperliquid 历史数据桶与格式：<https://hyperliquid.gitbook.io/hyperliquid-docs/historical-data>
