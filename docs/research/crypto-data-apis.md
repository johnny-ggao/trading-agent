# 面向技术分析 agent 的加密行情 API：Hyperliquid vs Binance

**截至 2026-09-21。** 基于一手来源（官方 API 文档与官方客户端/文档仓库）的事实核查，外加对公共端点的实时无认证探测。

> **验证说明：** 本环境中 `web_fetch` 被阻断，因此每个页面都通过 shell 中的 `curl` 读取，每个 HTTP API 都以无 API key 的方式直接调用。事实均引用其所属的 URL。实时探测结果标记为 *实时验证*。

**范围：** Hyperliquid 公共 Info API 与 Binance 现货 + USDⓈ-M 合约行情数据，面向以 1 小时为默认周期的技术分析 agent 进行对比；随后对服务端 Python 指标库进行调研。

---

## 0. 对 1h 技术分析 agent 最关键的注意事项

1. **Hyperliquid 无法提供深度的 1h 历史。** `candleSnapshot` 在文档中声明并实际强制执行 *"Only the most recent 5000 candles are available"*（只提供最近 5000 根 K 线）—— 一个没有回填的硬性保留上限。对 1h 而言约为 208 天（约 7 个月）；对 1m 约为 3.5 天。*实时验证：* 一个较早的窄 1h 窗口（2024 年 6 月）返回 `[]`，而一个横跨 2023→当前的 1h 查询只返回最近的约 5000 根 K 线（最早 ≈ 2026-02-25）。
2. **Binance 可以。** 现货 klines 可向前翻页至 2017-08-17（BTCUSDT 上市日），USDⓈ-M 合约 klines 至 2019-09，单次请求上限为 1000（现货）/ 1500（合约）根 K 线。*实时验证。* 如果长期回看（200 日均线、多年支撑/阻力）重要，请将 Binance 作为 OHLCV 主干。
3. **两个平台的公共行情数据都无需 API key。** *实时验证* 于 Hyperliquid `/info` 以及 Binance 现货与合约行情端点。Binance 还提供仅限行情数据的主机（`data-api.binance.vision`、`data-stream.binance.vision`）。
4. **Hyperliquid 轮询便宜但有限；Binance 更宽裕。** Hyperliquid 每 IP 共享 1200 REST weight/min，`candleSnapshot` 的成本为 20 + 每返回 60 根 K 线加 1（一次完整 5000 根 K 线的拉取 ≈ 103 weight，因此每分钟仅约 11 次这样的拉取）。Binance 提供 6000 weight/min（现货）与 2400 weight/min（合约）。
5. **标记价格 ≠ 最新价格，且资金费/OI 仅适用于永续合约。** Binance 现货没有资金费/OI/标记价格；请使用合约。Hyperliquid 在一次 `metaAndAssetCtxs` 调用中同时暴露资金费、未平仓量、标记价格与预言机价格。

---

## 1. Hyperliquid 公共 API

主要文档：
- Info 端点：<https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint>
- 速率限制与用户限制：<https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits>
- WebSocket 订阅：<https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions>
- 历史数据：<https://hyperliquid.gitbook.io/hyperliquid-docs/historical-data>
- 机器可读的完整文档：<https://hyperliquid.gitbook.io/hyperliquid-docs/llms-full.txt>（任何文档页面也可以通过追加 `.md` 以 Markdown 形式获取）

### 1.1 Info 端点与认证

- `POST https://api.hyperliquid.xyz/info`，请求头 `Content-Type: application/json`；请求体中的 `type` 用于选择响应 schema。
- **读访问是公开的 —— 无需 API key 或认证。** 只有 Exchange（交易）操作需要签名（API 钱包）。*实时验证：* `candleSnapshot` 与 `metaAndAssetCtxs` 在无认证请求头时都能返回数据。
- 通用分页说明：*"Responses that take a time range will only return 500 elements or distinct blocks of data. To query larger ranges, use the last returned timestamp as the next startTime for pagination."*（接受时间范围的响应只会返回 500 个元素或数据块。要查询更大的范围，请将最后返回的时间戳作为下一次分页的 startTime。）（`candleSnapshot` 特殊处理为 5000；见下文。）
- 对于现货，PURR 的 `coin` 传 `PURR/USDC`，其他现货交易对传 `@{index}`（例如 `@1`）；部分资产会被重映射（例如 UI 的 `BTC/USDC` → 主网 `UBTC/USDC`）。对于 HIP-3 永续合约，在名称前加上 dex 名，例如 `"xyz:XYZ100"`。

### 1.2 `candleSnapshot`

请求：
```json
{"type":"candleSnapshot","req":{"coin":"BTC","interval":"1h","startTime":1690000000000,"endTime":1690200000000}}
```
- `startTime`/`endTime` 是 epoch 毫秒。
- 响应是 K 线数组：
```json
{"t":1681923600000,"T":1681924499999,"s":"BTC","i":"15m","o":"29295.0","c":"29258.0","h":"29309.0","l":"29250.0","v":"0.98639","n":189}
```
  其中 `t` = 开盘时间（ms），`T` = 收盘时间（ms），`s` = 币种，`i` = 周期，`o/h/l/c` = 以字符串表示的 OHLC，`v` = 基础成交量（字符串），`n` = 成交笔数。

**支持的周期：** `1m`、`3m`、`5m`、`15m`、`30m`、`1h`、`2h`、`4h`、`8h`、`12h`、`1d`、`3d`、`1w`、`1M`。

**历史深度 / 回填限制：** *"Only the most recent 5000 candles are available."*（只提供最近 5000 根 K 线）这是**硬性上限，而不是单次请求的分页大小** —— 不存在可供翻页的更早数据。
- *实时验证：* 对 2023-01-01 → 当前的 1h 查询返回约 5000 根 K 线，起始于 2026-02-25（最近的 5000 根）。一个较早的窄 1h 窗口（2024-06-01→2024-06-05）返回 `[]`。
- 实际保留的历史：1m ≈ 3.5 天；1h ≈ 208 天（约 7 个月）；1d ≈ 13.7 年，因此 1d/3d 实际上可追溯至主网上线。
- *实时验证：* 1d 数据自 2020-08-19 起存在（在有流动性之前，早期 K 线的 `v` = 0.0 且 `n` = 0）。

### 1.3 速率限制

按 IP（来自速率限制页面）：
- **聚合 REST weight 上限：每分钟 1200。**
- 大多数 info 请求的 weight 为 **20**。`l2Book`、`allMids`、`clearinghouseState`、`orderStatus`、`spotClearinghouseState`、`exchangeStatus` 的 weight 为 **2**；`userRole` 的 weight 为 **60**。
- **`candleSnapshot` = weight 20 + 每返回 60 根 K 线额外加 1 weight。** 一次 5000 根 K 线的请求在 1200/min 预算中约占 20 + 83 = ~103 weight。
- 部分端点按每返回 20 个项目增加 weight（`recentTrades`、`userFills`、`fundingHistory`、`userFunding`、`nonUserFundingUpdates` 等）。
- WebSocket 限制：最多 **10 个连接**、最多 **30 个新连接/分钟**、最多 **1000 个订阅**、最多 **2000 条消息发送/分钟**、最多 **100 个并发 inflight POST**。
- 基于地址的限制仅适用于 actions，不适用于 info 请求。

### 1.4 WebSocket

- URL：`wss://api.hyperliquid.xyz/ws`。
- 订阅：`{"method":"subscribe","subscription":{"type":"candle","coin":"BTC","interval":"1h"}}`。
- 相关行情数据频道：
  - `candle` —— `{type:"candle", coin, interval}`（周期集合与 candleSnapshot 相同）。
  - `trades` —— `{type:"trades", coin}`。
  - `l2Book` —— `{type:"l2Book", coin}`，可选 `nSigFigs`、`mantissa`、`fast`（5 层与 20 层）。
  - `bbo` —— 最优买价/卖价。
  - `activeAssetCtx` —— 某个币的实时资金费/OI/标记上下文。
  - `allMids` —— 所有币的中间价。

### 1.5 永续合约衍生品指标（全部通过 `/info`）

- **`metaAndAssetCtxs`** —— 一次调用返回永续合约全集以及并行的 `assetCtxs` 数组。*实时验证* BTC ctx 的键：
  `funding`、`openInterest`、`prevDayPx`、`dayNtlVlm`、`premium`、`oraclePx`、`markPx`、`midPx`、`impactPxs`、`dayBaseVlm`。
  因此**资金费率、未平仓量、标记价格、预言机价格与溢价都来自单次请求。**
- **`fundingHistory`** —— `{type:"fundingHistory", coin, startTime, endTime}` → `[{coin, fundingRate, premium, time}]`。*实时验证*（BTC 2024 年数据返回）。
- **`predictedFundings`** —— 跨场所（BinPerp/HlPerp/BybitPerp 等）的预测资金费。
- **`activeAssetCtx`**（WS）用于流式获取相同的上下文。

### 1.6 覆盖范围、SDK、批量历史

- *实时验证：* **178 个活跃永续合约**（含已下架共 234 个）以及现货交易对。
- **官方 Python SDK：** <https://github.com/hyperliquid-dex/hyperliquid-python-sdk> —— MIT，PyPI `hyperliquid-python-sdk` 0.24.0（2026-06），约 1.8k stars。还有官方 Rust SDK；官方 TypeScript 仅有*示例*仓库（没有官方 JS SDK；存在社区版 `@nktkas/hyperliquid`）。
- **批量历史：** S3 存储桶 `hyperliquid-archive`（每月）。仅包含 **L2 订单簿快照与资产上下文 —— 没有 K 线**，"no guarantee of timely updates and data may be missing"（不保证及时更新，数据可能缺失），且请求方承担流量费用。<https://hyperliquid.gitbook.io/hyperliquid-docs/historical-data>

---

## 2. Binance：现货 vs USDⓈ-M 合约

主要文档：
- 现货 REST（官方仓库，Binance 文档的来源）：<https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md>
- 现货 WebSocket 流：<https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md>
- 现货仅限行情数据的 URL：<https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only>
- USDⓈ-M 合约文档：<https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data> 与 <https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info>
- 所有 Binance 文档的完整机器可读转储：<https://developers.binance.com/en/docs/llms-full.txt>（约 8.2 MB）
- 官方 Postman 集合（端点路径）：<https://github.com/binance/binance-api-postman>
- 官方批量历史：<https://data.binance.vision>（仓库 <https://github.com/binance/binance-public-data>）

### 2.1 认证

**无论是现货还是合约，公共行情数据都无需 API key**（*实时验证*）。Binance 还为现货提供了专用的仅限行情数据主机：REST `https://data-api.binance.vision` 与 WS `wss://data-stream.binance.vision` —— "These URLs do not require any authentication (i.e. The API key is not necessary) and serve only public market data."（这些 URL 无需任何认证（即不需要 API key），且仅提供公共行情数据。）

### 2.2 Klines（K 线）

| | 现货 | USDⓈ-M 合约 |
|---|---|---|
| 端点 | `GET https://api.binance.com/api/v3/klines` | `GET https://fapi.binance.com/fapi/v1/klines` |
| 默认 limit | 500 | 500 |
| 最大 limit | **1000**（已验证：`limit=1501` 静默返回 1000） | **1500**（已验证：`limit=1501` → 错误 `-1130`） |
| Weight | **2**（固定） | 按 limit：`[1,100)=1`、`[100,500)=2`、`[500,1000]=5`、`>1000=10`（从 `X-MBX-USED-WEIGHT-1M` 增量实时测得） |
| 周期 | `1s,1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M` | `1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M`（无 `1s`；`1s` → 错误 `-1120`） |
| 响应元组 | 12 个字段（开盘时间、O,H,L,C、成交量、收盘时间、计价资产成交量、成交笔数、主动买入基础资产量、主动买入计价资产量、ignore） | 12 个字段（相同结构） |

- 分页：传入 `startTime`/`endTime`（ms）向后遍历；**没有硬性保留上限**。
- **历史深度（实时验证）：** 现货 BTCUSDT 日线数据自 **2017-08-17** 起；合约 BTCUSDT 自 **2019-09** 起（onboardDate `1567965300000`）。
- *实时验证* 的 weight 测量示例（合约）：limit 1→Δ1，100→Δ1，499→Δ2，500→Δ2，999→Δ5，1500→Δ10；现货始终为 Δ2。

### 2.3 WebSocket

| | 现货 | USDⓈ-M 合约 |
|---|---|---|
| 基础地址 | `wss://stream.binance.com:9443`（或 `:443`） | `wss://fstream.binance.com`，带路由路径 `/public`、`/market`、`/private` |
| 仅行情数据 | `wss://data-stream.binance.vision` | — |
| Kline 流 | `<symbol>@kline_<interval>`（例如 `btcusdt@kline_1h`） | `<symbol>@kline_<interval>` |
| 标记价格 | 不可用 | `<symbol>@markPrice` / `<symbol>@markPrice@1s`、`!markPrice@arr@1s`、`<symbol>@markPriceKline` |
| 其他 | `@aggTrade`、`@trade`、`@bookTicker`、`@ticker`、`@miniTicker`、`@depth`、`@avgPrice`、`@referencePrice` | `@aggTrade`、`@bookTicker`、`@ticker`、`@depth`、`@forceOrder`、`<pair>@indexPrice` |

- 交易符号为小写。组合流将事件包装为 `{"stream":"<name>","data":<payload>}`。单个连接有效期为 24 小时；服务器每 3 分钟 ping 一次；每个连接最多 1024 条流；每秒最多 10 条传入消息。
- 注意（合约）：路由路径很重要 —— `@markPrice` 属于 `/market` 路由，因此 `wss://fstream.binance.com/ws/btcusdt@markPrice` 不会推送数据；请使用 `wss://fstream.binance.com/market/ws/btcusdt@markPrice`。

### 2.4 资金费率、未平仓量、标记价格（仅合约）

- **标记价格 + 最新资金费：** `GET /fapi/v1/premiumIndex` —— 带 symbol 时 weight 为 **1**，不带时为 **10**。返回 `symbol, markPrice, indexPrice, estimatedSettlePrice, lastFundingRate, interestRate, nextFundingTime, time`。*实时验证。*
- **资金费率历史：** `GET /fapi/v1/fundingRate` —— limit **最大 1000**，默认 100；无范围时返回最近 200 条记录；与 `GET /fapi/v1/fundingInfo` 共享 **500/5min/IP** 限制。字段：`symbol, fundingRate, fundingTime, markPrice, rateType`。*实时验证：* BTCUSDT 资金费可追溯至 2019-09。
- **资金费率信息：** `GET /fapi/v1/fundingInfo`（上限/下限/间隔调整）。
- **未平仓量（当前）：** `GET /fapi/v1/openInterest` —— weight **1**；返回 `openInterest, symbol, time`。*实时验证。*
- **未平仓量历史：** `GET /futures/data/openInterestHist` —— 周期 `5m,15m,30m,1h,2h,4h,6h,12h,1d`；limit **最大 500**（默认 30）；**"Only the data of the latest 1 month is available"**（仅提供最近 1 个月的数据）；**1000 请求/5min**。*实时验证：* 400 天前的 startTime 会被拒绝。
- **标记价格 klines：** `GET /fapi/v1/markPriceKlines`（weight 按 limit，与 klines 同表）。
- **溢价指数 klines：** `GET /fapi/v1/premiumIndexKlines`；**指数价格 klines：** `GET /fapi/v1/indexPriceKlines`。
- *实时验证：* `premiumIndexKlines` 与 `markPriceKlines` 在无 key 时也能返回数据。

### 2.5 速率限制

来自实时 `exchangeInfo.rateLimits`：
- **现货：REQUEST_WEIGHT 6000/min**（+ RAW_REQUESTS 300000/5min、ORDERS 100/10s、200000/day）。
- **USDⓈ-M 合约：REQUEST_WEIGHT 2400/min**（+ ORDERS 1200/min 与 300/10s）。
- 限制是**按 IP，而非按 API key**。每个响应都带有 `X-MBX-USED-WEIGHT-(intervalNum)(intervalLetter)`。429 表示需要退避；反复违规 → HTTP 418 及自动 IP 封禁，封禁时长会**从 2 分钟升级到 3 天**（会发送 `Retry-After` 响应头）。
- Binance 建议在时效性和速率限制压力方面优先使用 websockets 而非 REST。

### 2.6 覆盖范围与批量历史

- *实时验证：* 现货 **3705 个交易符号**（1368 个 TRADING）；USDⓈ-M 合约 **905 个交易符号**（773 个 TRADING）。
- 官方批量转储位于 <https://data.binance.vision>：由 `/api/v3/klines` 和 `/fapi/v1/klines` 派生的日度/月度 klines ZIP。

---

## 3. 面向 1h 默认周期的技术分析 agent：Hyperliquid vs Binance

| 维度 | Hyperliquid | Binance |
|---|---|---|
| 通过 API 获取的 1h 历史 | **约 5000 根 K 线 ≈ 208 天，硬性上限，无回填** | 现货自 2017 年 / 合约自 2019 年起无限，可翻页 |
| 单次请求 K 线数 | ≤5000（但仅为最近窗口） | 现货 1000 / 合约 1500 |
| 速率限制 | 共享 1200 weight/min；`candleSnapshot` 为 20 + n/60 | 现货 6000 weight/min；合约 2400/min；klines weight 为 2（现货）/ 2–10（合约） |
| 行情数据认证 | 无 | 无（专用仅行情数据主机） |
| 衍生品指标 | 在一次 `metaAndAssetCtxs` 调用中获取资金费 + OI + 标记 + 预言机 + 溢价；`fundingHistory`；`predictedFundings` | 资金费（`premiumIndex`、`fundingRate`）、OI（`openInterest`、30 天 `openInterestHist`）、标记/指数/溢价 klines |
| 交易标的覆盖 | 178 个活跃永续 + 现货 | 773 个合约 + 1368 个现货（TRADING） |
| 可用性声誉 | 较年轻的场所；有记录的 API 中断于 2025-07-30 并自动退款（二手来源：The Block） | 官方 2025 下半年 API 可用性报告：整体 99.97%；Spot/Margin/Futures-CM 100%，Futures-UM 99.96/99.95% |
| 数据许可 | 无需许可的 API；未声明数据许可/再分发限制；S3 归档由请求方付费且不含 K 线 | 受 Binance Product Terms of Use 约束；存在官方批量下载；未明确授予再分发权利 |

可用性来源：Binance 2025 下半年 API 可用性报告 <https://www.binance.com/en/blog/tech/8686086762054806349>；Hyperliquid API 中断报告 <https://www.theblock.co/post/364861/hyperliquid-outage-refund>。Binance 条款：<https://www.binance.com/en/terms>。

**建议：** 使用 **Binance** 作为主要的 1h OHLCV/历史来源（深度 + 宽裕的限制），并使用 **Hyperliquid** 作为补充的原生永续合约数据源，用于资金费/OI/标记价格以及 HL 上市资产 —— 同时接受 HL 的 1h 历史仅限于最近约 7 个月这一事实。对任一场所，内部分析风险较低，但公开再分发应核对各自的条款。

---

## 4. 服务端 Python 技术指标库

覆盖说明：除非另有说明，所有列出的候选库都支持 MA/SMA、EMA、MACD、RSI、布林带、ATR 与成交量指标。

| 库 | 许可证 | 最新 / 最近发布 | 维护情况 | 说明 |
|---|---|---|---|---|
| **TA-Lib**（<https://github.com/ta-lib/ta-lib-python>） | BSD-2-Clause 封装；BSD-3-Clause 核心 | PyPI `TA-Lib` **0.8.0**（2026-09-13） | **非常活跃**（12.2k stars；2026-09-21 有推送） | 150+ 指标，包含全部所需项；最快（C）；历史上需要原生 C 库（wheel 正越来越多地将其打包）。 |
| **pandas-ta**（<https://github.com/twopirllc/pandas-ta>） | PyPI 上 license 字段为空 | PyPI 0.4.71b0（2025-09-14），Beta | **已废弃** —— 原仓库现在 404，作者的账号没有公开仓库 | 不要在新工作中采用。 |
| **pandas-ta-classic**（<https://github.com/xgboosted/pandas-ta-classic>） | MIT | PyPI **0.8.32**（2026-09-14） | **活跃**（443 stars；2026-09-16 有推送） | pandas-ta 的维护分支：250+ 指标 + 烛台形态；pandas DataFrame 扩展。维护最好的纯 pip pandas 方案。 |
| **talipp**（<https://github.com/nardew/talipp>） | MIT | PyPI **2.7.0**（2025-09-09） | 较为活跃（538 stars；2025-09 有推送） | 增量/流式指标 —— 非常适合实时 K 线更新；目录较小。 |
| **ta**（<https://github.com/bukosabino/ta>） | MIT | — | 中等（5.2k stars；2026-03 有推送） | Pandas/numpy；长期存在；存在未解决的正确性顾虑。 |
| **trading-signals** | MIT | npm **8.3.0** | 活跃（992 stars；2026-09-21 有推送） | **不是 Python 包**（PyPI 404）。它是 TypeScript/npm 库（<https://github.com/bennycode/trading-signals>），在 Python 服务端不可用。 |
| **custom / numpy** | — | — | — | SMA/EMA/MACD/RSI/Bollinger/ATR 每项都是约 10–50 行标准公式：零依赖、完全可审计，但正确性由你自己负责。 |

**建议技术栈：** 如果可接受原生 C 依赖，则选择 TA-Lib 以获得正确性与速度；否则选择 **pandas-ta-classic** 作为仅 pip 的 pandas 方案；如果需要增量/流式更新，则选择 **talipp**；为核心指标保留一个小型 numpy 实现作为轻依赖回退方案。

---

### 实时探测附录（节选）

以下所有调用都未经认证并返回了数据：

- `POST https://api.hyperliquid.xyz/info` 使用 `candleSnapshot`（BTC 1h/1d）与 `metaAndAssetCtxs` → OHLCV K 线与资金费/OI/标记上下文。
- `GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000` 与 `limit=1501`（上限为 1000）。
- `GET https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=1500` 与 `limit=1501`（错误 -1130）。
- `GET https://fapi.binance.com/fapi/v1/premiumIndex`、`/openInterest`、`/fundingRate`、`/markPriceKlines`、`/premiumIndexKlines`。
- `GET https://fapi.binance.com/futures/data/openInterestHist`（强制执行 30 天窗口）。
- `GET https://data-api.binance.vision/api/v3/klines`（仅行情数据主机）。
