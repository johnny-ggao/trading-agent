# 技术分析交易 agent 的行情数据源全景

**截至 2026-09-21。** 来自一手资料（官方 API 文档、定价页、客户端库注册表）的事实核查，外加对公开端点的实时探测。

> **核查说明：** `web_fetch` 工具在本环境中被阻断（所有外部主机都解析到非公开的 `198.18.x.x` 地址），因此所有页面均通过 shell 中的 `curl` 读取，每个 HTTP API 都直接调用。事实均引用其归属的 URL。若某个数字无法从一手页面读到，则标记为 *(未核实)*。

---

## 0. 最重要的三个坑（先读这一节）

1. **免费的美国股票"实时"数据是许可雷区，而"免费"几乎总意味着延迟或仅限 IEX。**
   Alpha Vantage 明确说明，实时及延迟 15 分钟的美国股票数据受交易所/FINRA/SEC 监管，其他提供商的"免费实时或延迟 15 分钟数据"*很可能是非法再分发*；Alpha Vantage 是 Nasdaq 授权供应商。([Alpha Vantage 行情数据政策](https://www.alphavantage.co/realtime_data_policy/)) Alpaca 的免费档提供实时 **websocket**，但只有 **IEX** 源（约占成交量 2–3%）——完整合并行情带是每月 $99 的套餐。([Alpaca 数据页](https://alpaca.markets/data)) 除非你持有牌照，否则请基于官方 EOD/合并数据来规划指标。

2. **复权与不复权在不同提供商之间——甚至在提供商*内部*——并不一致；混用会让指标失效。**
   Yahoo 的 chart API 在原始 OHLCV 之外返回单独的 `adjclose` 数组（实测：`v8/finance/chart/AAPL`）。Alpha Vantage 在盘中数据上默认 `adjusted=true`（拆股+分红），`adjusted=false` 表示按交易原值。Massive/Polygon 的 aggregates 默认 `adjusted=true`（仅拆股）并文档化了 `adjusted=false`；其 SMA 指标端点也有相同的开关。EODHD 只把 **`adjusted_close`** 作为复权值返回——open/high/low/close 保持按交易原值。Tushare 暴露单独的 `adj_factor` 表（需要 2000 积分），必须由你自己应用。选定一种口径（信号通常用拆股复权，执行用不复权），并且绝不要在未重新计算因子的情况下拼接来自两个提供商的序列。

3. **幸存者偏差是结构性的：今天的股票代码列表排除了明天的退市股。**
   加密货币交易所的 K 线在退市处直接停止，且没有退市标的归档——用当前交易工具构建的标的池会高估幸存者。对美国股票，Massive/Polygon 暴露了这一点（ticker 带有 `active`——"False means the asset has been delisted"——以及 `delisted_utc`；[Massive all-tickers](https://massive.com/docs/rest/stocks/tickers/all-tickers)），EODHD 有 `delisted=1` 工作流；多数廉价/免费提供商（Yahoo、Alpha Vantage、Twelve Data、Finnhub、Tiingo 免费档）只给你*当前*代码。任何横截面回测都必须使用时点标的池。

*次要的坑：* 按 IP 的速率限制以及 429→封禁的升级（Binance HTTP 418，冷却 2 分钟→3 天）；UTC 与 UTC+8 的日线边界（OKX 默认 UTC+8 开盘）；永续合约的 funding/mark price ≠ last price；复权/后复权的连续期货合约；周末外汇跳空。

---

## 1. 对比表

### 1.1 加密货币

| 提供商 | 实时/延迟/EOD | 历史深度 | 最小 K 线间隔 | WebSocket | 官方 Py/JS 客户端 | 速率限制 | 认证 | 成本 | 指标适配性 |
|---|---|---|---|---|---|---|---|---|---|
| **Binance** | 实时 | 通过 REST `startTime` 可获取 2017 年以来的 OHLC；data.binance.vision 提供免费月度 ZIP 转储 | **1s**（1s…1M） | 是 — `wss://stream.binance.com:9443`；请求/响应 `/ws-api/v3` | Python `binance-connector` / 新的官方 `binance-sdk-spot`；JS `binance-connector-js` | REST **6,000 request-weight/min/IP**（`klines` 权重 2）；实时 `exchangeInfo`；WS 入站 5 条消息/秒，每 IP 每 5 分钟 300 个连接，每连接 1024 条流 | 公开数据 = 无需 key；私有 = HMAC key | 免费 | 极佳 |
| **OKX** | 实时 | `history-candles` 可分页追溯到 2018+ | **1s**（1s…3M 以及 UTC 变体） | 是 — `wss://ws.okx.com:8443/ws/v5/public` | Python `python-okx`；Node `okx-api`（okx 官方组织） | 最近 K 线 40 req/2s；history-candles 20 req/2s（公开，按 IP） | 公开 = 无需 key；私有 = key + HMAC + passphrase | 免费 | 极佳 |
| **Coinbase (Advanced Trade)** | 实时（REST K 线缓存 1s） | 需要 `start`/`end`；深度下限未文档化（可回溯到 2023） | REST **1m**；WS `candles` = 5 分钟桶，1s 更新 | 是 — `wss://advanced-trade-ws.coinbase.com` | Python `coinbase-advanced-py`（官方） | WS 每 IP 8 连接/秒 + 未认证消息/秒；Advanced Trade REST 限制未文档化 — Coinbase Exchange 公开 REST 上限为 10 req/s/IP（突发 15） | 公开 K 线 = 无需 key；私有 = CDP JWT | 免费 | 良好（1m 下限） |
| **Kraken** | 实时 | `OHLC` 仅返回最近 **720** 根 K 线；更早的无法通过 API 获取——使用免费 OHLCVT 归档 | **1m**（1,5,15,30,60,240,1440,10080,21600 分钟） | 是 — `wss://ws.kraken.com/v2`；期货 `wss://futures.kraken.com/ws/v1` | **没有官方 Python/JS**；官方 Go `api-go` 与 Rust `kraken-sdk`；社区 `krakenex`/`pykrakenapi` | REST 调用计数器上限按验证等级为 **15–20**，以 −0.33 到 −1/秒衰减 | 公开 OHLC = 无需认证；私有需 WS token | 免费 API；免费历史归档 | 良好（720 上限；无亚分钟） |

实测验证：对 Binance `/api/v3/klines?interval=1m`、OKX `/api/v5/market/candles?bar=1m`、Coinbase Exchange `/products/BTC-USD/candles?granularity=60` 与 Kraken `/0/public/OHLC?interval=1` 的未认证调用，均无需 key 即返回 1 分钟 OHLCV。

### 1.2 美国股票

| 提供商 | 实时/延迟/EOD | 历史深度 / 最小间隔 | WebSocket | 官方 Py/JS 客户端 | 速率限制 | 认证 | 成本 | 指标适配性 |
|---|---|---|---|---|---|---|---|---|
| **Yahoo Finance / yfinance** | 交易所相关，不保证：Yahoo 的按交易所表格列出 Nasdaq 实时、许多市场延迟 15–30 分钟；其美国 payload 自称 `Delayed Quote`；美国确切延迟 *(未核实)* | 日线：完整历史（`period=max`）；盘中窗口总计 **≤60 天**——1m ≈ 最近 8 天，1h/60m ≈ 730 天 | **无官方**（yfinance 附带一个在 Yahoo 未文档化流上的实验性 `WebSocket`） | Python `yfinance`，**非官方**，Apache-2.0（PyPI `1.7.0`）；无官方 JS | 未文档化；429 限流；库自行限流 | 无（cookie/crumb） | 仅免费 | 适合个人 EOD；默认 `auto_adjust=True` + `Adj Close`；**仅限个人使用，禁止再分发** |
| **Alpha Vantage** | 默认 EOD/历史；实时或延迟 15 分钟的盘中仅通过付费 `entitlement=`（交易所授权） | 日线 25+ 年；通过 `month=` 可获取 2000-01 以来任意月份的盘中（**付费**）；`outputsize=full` 付费 | 无 WS — 仅 REST | 无官方 REST 客户端（原始 HTTP 片段）；仅有官方 **MCP server** | **免费 = 25 请求/天**；付费 $49.99/月 = 75 req/min … $249.99/月 = 1,200 req/min，无每日上限 | `apikey` 查询参数 | 免费 25/天；最便宜的付费 $49.99/月 | 良好；盘中默认 `adjusted=true`；`TIME_SERIES_DAILY_ADJUSTED` 为付费；商业使用需协议 |
| **Twelve Data** | 实时美国股票（部分市场有交易所强制延迟）；深度 EOD | 日线自首次交易以来；1 分钟 OHLC 仅从 **2020-02-10** 起；`outputsize` 最大 5,000 根 | 是（WS 按 credits；免费档 8 trial） | Python `twelvedata-python`（官方）；Node `twelvedata-node`（官方） | **Basic 免费 = 8 credits/min 且 800/天**；Grow **$79/月（年付 $66/月）**——页面上也出现 "$29/月" 标签（对应关系未核实）；Ultra $999/月 = 10,946 API + 10,000 WS credits | API key | 免费 Basic（**仅内部、非展示、非生产**）；付费自 $79/月起 | 良好；技术指标端点；按交易原值 K 线（需自行应用拆股/分红） |
| **Finnhub** | 实时报价 + WS；K 线端点实时/延迟/EOD（付费） | 付费 All-In-One 提供 30+ 年 OHLC | 1min（1/5/15/30/60,D,W,M）— **付费门槛** | 是 — `wss://ws.finnhub.io`（免费 50 个 symbol，付费无限） | 免费 **60 calls/min**；付费行情数据 900/min；每个套餐之上还有绝对全局上限 **30 calls/sec** | API key（WS token） | 免费 $0（仅报价/WS）；行情数据套餐 **$49.99/月**；All-In-One $3,500/月 | 混合 — **`/stock/candle`（OHLCV）不在免费档**；K 线不复权；禁止再分发数据/衍生结果 |
| **Polygon.io → Massive** | Basic 为 EOD；Starter/Developer 延迟 15 分钟；Advanced 实时 | Aggregates 回溯到 **2003-09-10**；Basic 2 年 / Starter 5 年 / Developer 10 年 / Advanced 全部历史；所有套餐都有分钟线，**秒级 + tick 从 Starter/Developer 起** | 是 — `wss://socket.massive.com/stocks`（实时）、`wss://delayed.massive.com/stocks`；频道 A/AM/T/Q/LULD/NOI | Python `massive`（官方，前身 `polygon-api-client`）；JS `@massive.com/client-js`；Go/Kotlin | 免费 **5 req/min *每个资产类别***（付费套餐每类别无限；额外的 API key 不会提高） | API key 查询参数 `apiKey`；WS auth action | $0 Basic；**$29 Starter / $79 Developer / $199 Advanced**（个人，非专业） | 极佳 — 技术指标端点（SMA）；默认 `adjusted=true` = **仅拆股**；**保留退市股**（`active=false`、`delisted_utc`）→ 幸存者安全；99.8% SLA 仅限 Business |
| **Alpaca** | 免费 Basic = 通过 WS 的实时 **IEX only**（约 2.5% 成交量）；历史 API 屏蔽最近 15 分钟；Plus = **SIP** 全美交易所，无限制 | 两个套餐均自 **2016** 起 | **1 分钟**（[1–59]Min）；无股票秒级 K 线 | 是 — `wss://stream.data.alpaca.markets/v2/{sip|iex|delayed_sip|boats|overnight}`（免费 WS ≤30 个 symbol） | Python `alpaca-py`（官方）；JS `@alpacahq/alpaca-trade-api`（官方）；Go/C# | Basic **200 req/min**；Plus **10,000 req/min** | 请求头 `APCA-API-KEY-ID` + `APCA-API-SECRET-KEY` | $0 Basic；**$99/月 Algo Trader Plus** | 良好；`adjustment=raw|split|dividend|spin-off|all`（默认 **raw**），公司行动端点/SSE |
| **Tiingo** | EOD（约 17:30 ET）；实时 **IEX** 衍生参考价（完整 TOPS 自 2025-02-01 起需签署 IEX 协议） | EOD 回溯到 **1962**（80k+ ticker）；通过 IEX 的 1 分钟盘中 | **1 分钟**（`resampleFreq`） | 是 — `wss://api.tiingo.com/iex`（还有 /crypto、/forex） | **无一方客户端**；文档只列第三方（如 `tiingo-python`） | Starter **50/hr，1,000/day，1 GB/mo**；Power 10,000/hr，100,000/day，40 GB/mo；无每分钟上限 | `Authorization: Token <token>` | 免费 Starter；**$30/月 Power** | 极佳 — 原始与复权并列（CRSP 拆股+分红）：`adjClose/adjHigh/adjLow/adjVolume`、`divCash`、`splitFactor`；实时仅单交易所 IEX |
| **EODHD** | 免费 = 仅 EOD；付费 = EOD + 延迟 15 分钟的实时 API + **实时 WS（<50 ms）**，美国延长时段 04:00–20:00 ET | EOD "30+ 年"（S&P 500 自 1927）；美国 1 分钟盘中自 **2004**，5m/1h 自 2020 年 10 月；免费套餐范围 = 过去一年 | **1 分钟**（`interval=1m/5m/1h`）；单独的 US Tick Data API | 是 — `wss://ws.eodhistoricaldata.com/ws/us`（+ /us-quote、/us-candles、/us-status）；每 token 50 个流式 symbol | Python `eodhd`（官方）；Node/TS SDK（官方） | 免费 **20 calls/day**；付费 **100,000/day，1,000/min**（+500 欢迎额度） | `api_token` 查询参数 | 免费 $0；**$19.99** EOD All-World；$29.99 EOD+Intraday；$99.99 All-in-One | 良好 — `adjusted_close` + Splits/Dividends；**`delisted=1` 工作流**，历史回溯到退市 → 幸存者安全；但供应商声明其定价并非交易所行情源（OTC/P2P、VWAP 聚合，"not necessarily real-time nor accurate"） |

### 1.3 中国 A 股

| 提供商 | 实时/延迟/EOD | 历史 / 最小间隔 | 流式 | 客户端 | 速率限制 | 认证 | 成本 | 指标适配性 |
|---|---|---|---|---|---|---|---|---|
| **Tushare Pro** | EOD + 实时（付费附加） | 日线自 1990 年代（一次 6,000 行请求可返回某只股票约 23 年）；历史 1/5/15/30/60 分钟 **自 2009 起（单独权限）** | 期货实时支持 SDK/HTTP/**WebSocket** | Python `tushare` `1.4.29`（官方） | **120 积分 = 50 calls/min，8,000/day，仅不复权日线**；2,000+ 积分 = 200/min；5,000+ = 500/min（6,000 行/次）；分钟数据单独（500/min，8,000 行/次） | 需要 token | 120 积分免费；2,000 积分 200 CNY/年；**分钟历史 2,000 CNY/年；实时分钟 1,000 CNY/月** | 极佳 — 日线 `daily` **不复权且省略停牌日**；`adj_factor` 表（需 2,000 积分）或通用行情接口提供前/后复权 |
| **AkShare** | 主要是 EOD + 部分实时快照 | 因上游来源而异 | 无（HTTP 抓取） | Python `akshare` `1.18.97` | 依赖上游站点；有反抓取风险 | 无 | 免费 | 良好但脆弱 — 封装 Sina/Eastmoney/交易所页面；非官方，站点变更时即失效 |
| **BaoStock** | EOD | 长历史；日/周/月 + **5/15/30/60 分钟**（分钟 K 线不含指数） | 无 | Python `baostock` `0.9.3`（官方） | 未正式发布 | `bs.login()` 匿名免费账号，无需 key | 免费 | 良好；`query_history_k_data_plus(..., frequency="d", adjustflag="3")`，其中 3=不复权（默认），1=后复权，2=前复权；`isST`/`tradestatus` 标志；无实时 |
| **Sina / Tencent quote endpoints** | 实时快照（数秒延迟）**加**历史 K 线端点 | Sina `getKLineData`：日线 + 5/15/30/60 分钟，**≤1,023 根/次**；Tencent `fqkline/get`：日/周 + 分钟，支持 **qfq/hfq**（前/后复权） | 无（纯 HTTP） | 无官方；自行解析 JSON/文本 | 未发布；IP 限流 / Referer 校验 | 无 | 免费 | 一般 — Tencent 暴露前/后复权，两者都返回真实 K 线，但约 1,023 根上限、非官方抓取面、稳定性风险 |

实测验证：`hq.sinajs.cn/list=sh600000`（需 `Referer: finance.sina.com.cn`）与 `qt.gtimg.cn/q=sh600000` 无需 key 即返回带有 2026-09-21 时间戳的实时报价。Sina 的 `money.finance.sina.com.cn/.../CN_MarketData.getKLineData?scale=240|5` 返回日线与 5 分钟 OHLCV（`datalen=1023` 时为 1,023 条记录），Tencent 的 `web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600000,day,,,3,qfq` 返回前复权日线。它们都是非官方抓取面。

### 1.4 外汇 / 期货

| 提供商 | 实时/延迟/EOD | 历史 / 最小间隔 | 流式 | 客户端 | 速率限制 | 认证 | 成本 | 指标适配性 |
|---|---|---|---|---|---|---|---|---|
| **Interactive Brokers** | TWS API：通过付费订阅实时（`marketDataType` 1）；冻结（2）；仅在提供处延迟（3/4）——"besides Delayed Watchlist Data, a paid data subscription is required"。Client Portal：快照 + 500 ms 更新 | K 线 1 秒–1 个月；最大时长 1 s → 仅 2,000 S，≥5 s → 86,400 S / 365 D / 52 W / 12 M / 68 Y；≤30 s 的 K 线超过 6 个月不可用；过期期货仅 2 年 | **TWS API：无 WebSocket**（专有 socket）；**Client Portal：有**，`wss://localhost:5000/v1/api/ws` | Python `ibapi`（官方安装器；PyPI `9.81.1`）；`ib_async` 维护中，`ib_insync` 已弃用；CP Web API 通过第三方 `ibind` | 历史 pacing：15 秒内不得有相同请求；2 秒内同一 Contract/Exchange/TickType 不超过 6 次；>60 req/10 min；BID_ASK ×2；≤50 并发；实时 ≤(lines/2)/s；CP 全局 10 req/s，历史 ≤1,000 点，10/s & 50/min，429 → 15 分钟惩罚 | 需 IBKR Pro + TWS/IB Gateway 运行并登录，或 CP Gateway 本地浏览器登录 / OAuth | **FX "IBKR Currencies Global" 费用豁免 $0**；US Securities Snapshot & Futures Value Bundle $10/月（佣金达 $30 时豁免）；US Futures Value Bundle PLUS $5/月；US Equity+Options Add-On Streaming $4.50/月（达 $125 时豁免）；交易所行情源另计 | 强；`secType="CONTFUT"` 提供**仅历史的连续期货**（无实时/订单/`endDateTime`）→ 需手动移仓；`ADJUSTED_LAST` 仅对股票/ETF/期权复权，不含期货 |
| **OANDA (v20)** | **实时，随 practice/live 账户免费包含**；历史用 REST | 历史回溯到 **2005**；K 线 `S5`（默认）… `M1` … `H1` … 月线；`count` 默认 500，**最大 5,000/请求** | **有** — 专用流式 socket `/v3/accounts/{id}/pricing/stream`（以及 transactions/stream）；每品种采样 ≤4 个价格/秒（250 ms） | Python `v20`（**官方**，github.com/oanda/v20-python）；JS `@oanda/v20`（**官方**）；`oandapyV20` 第三方 | REST **120 req/s 每 IP**；**20 个活跃流/IP**；≤2 个新连接/秒；超限返回 429 | 个人访问 token `Authorization: Bearer`（practice 与 live host） | **免费**随账户包含；未发现付费 v20 数据档 | 对 FX/金属/CFD 强；**无交易所期货**；周末跳空；`smooth` 会改变 K 线开盘价 |

---

## 2. 入围推荐

### (a) 加密货币：24/7 免费实时
**首选：Binance**（流动性最深、1s K 线、免费公开 REST + WebSocket、免费历史转储、成熟的官方 Python/JS 连接器）。**次选/对冲：OKX**（能力几乎相同，1s K 线，适用于无法访问 Binance 的非美国地区）以及 **Coinbase Advanced Trade**（若你需要美国监管的场所）——但注意其 1 分钟 REST 下限。避免依赖 **Kraken** 做深度盘中：其 API 永远只返回最近 720 根 K 线且没有亚分钟 K 线，尽管其免费批量归档可回填历史。
*实用技术栈：* `ccxt` 式抽象没问题，但应固定一个场所作为可信来源；在无拆股（加密货币无需拆股复权）但**时区对齐**的 K 线上计算指标，并显式处理 OKX 的零成交量 K 线。

### (b) 美国股票：免费 / EOD
**推荐：Massive/Polygon "Stocks Basic"（$0，*每个资产类别* 5 req/min，2 年 EOD + 分钟 aggregates + 技术指标端点，保留退市代码）** 用于零成本 EOD/回测工作，**外加 Alpaca 免费档（$0，实时 IEX websocket ≈2.5% 成交量，200 req/min，历史自 2016 起）**，当你需要用于模拟交易的实时流时使用。对于幸存者安全的 EOD（含退市股），**EODHD 的 `delisted=1`** 或 **Tiingo（$30/月 Power，CRSP 复权字段）** 是首选。对于管道最少的纯日线指标机器人，**EODHD**（20 次免费调用/天；$19.99/月 EOD All-World）或 **Twelve Data Basic**（8 credits/min 且 800/天，但仅限内部、非展示/非生产）是覆盖面选项。**Alpha Vantage 免费档（25 请求/天）对指标循环来说太小**——把它当作自 $49.99/月起售的付费产品。**yfinance** 对个人原型很好（默认复权；盘中窗口 ≤60 天），但非官方且未获再分发许可。**Finnhub 免费档给出实时报价 + 50 symbol WebSocket，但没有 OHLCV K 线**（K 线自 $49.99/月起），因此它只是实时价格的补充，而非历史来源。

### (c) A 股
**推荐：Tushare Pro** 作为记录系统（官方日线 + 分钟 + `adj_factor` + 期货实时 WebSocket；可预测的 token/积分模型），**以 AkShare 作为免费后备**用于覆盖面，BaoStock 用于免费历史 EOD/复权。把 **Sina/Tencent HTTP 端点**用作免费的现货价格心跳（以及 Tencent 的 `qfq` K 线用于快速查看复权图），但绝不要作为记录系统。预算：约 200 CNY/年即可做日线复权工作；**2,000 CNY/年**解锁历史分钟 K 线；**1,000 CNY/月**用于实时分钟。

---

## 3. 坑点详解

**速率限制 / 封禁。** Binance 的权重按 IP；反复 429 会升级为 HTTP 418 IP 封禁（2 分钟 → 3 天）。Kraken 批量历史与 15–20 次的交易计数器共用。Finnhub 即使付费套餐也有绝对 30 calls/sec。Alpha Vantage 免费为 25 **每天**；EODHD 免费为 20 **每天**。Massive Basic 为 5 req/min **每个资产类别**——付费 Options 套餐对 Stocks 毫无帮助，额外的 API key 也不会提高。Tiingo 无每分钟上限，但有硬性的每小时/每天/带宽上限（免费档 50/hr，1,000/day，1 GB/mo）。始终缓存并批量请求；绝不要为每个 ticker 展开一个请求。

**许可 / 再分发。** Yahoo API 条款禁止出售/出租/分享/转让/再许可 API，或从中获取收入（代码再分发在注明出处的前提下另行允许）——因此 yfinance 用于个人/分析用途，而非产品。Finnhub 禁止再分发数据**或衍生结果**，并要求在订阅结束时删除数据。Twelve Data 的个人套餐为 "internal and non-commercial… may not be redistributed"。Alpha Vantage 将个人与商业授权分开销售，并警告未获许可的实时/15 分钟提供商有招致交易所行动的风险。美国合并行情带数据有非专业与专业订阅者定义（Alpaca、Massive/Polygon）。**"实时"免费档通常是单一场所，而非行情带：** Alpaca Basic 与 Tiingo 仅流式提供 **IEX（约 2.5% 成交量）**；EODHD 自己的免责声明称其价格系从 OTC/P2P 来源 VWAP 聚合，"not necessarily real-time nor accurate"；完整 IEX TOPS 现在需要签署 IEX 协议。

**复权与不复权。** 具体字段：Massive aggregates 的 `adjusted` 默认 true（拆股），SMA 端点跟随该设置；Alpha Vantage 盘中默认 `adjusted=true`（`DAILY_ADJUSTED` 为付费）；yfinance 默认 `auto_adjust=True`；EODHD 仅暴露 `adjusted_close`；Twelve Data 与 Finnhub 的 K 线为按交易原值（需自行应用其 `/splits` + `/dividends`）；Tushare 暴露 `adj_factor` 由客户端应用；中国的前复权/后复权约定不同，且后复权序列会随每次新分红而追溯变化。存储原始值 + 因子，在读取时推导复权值。

**幸存者偏差 / 退市。** 加密货币：无退市归档。美国：**Massive 保留退市代码及其退市前历史**（`active=false`、`delisted_utc`），**EODHD 有显式的 `delisted=1` 工作流**；Alpaca/Tiingo 的退市覆盖未文档化 *(未核实)*；Yahoo/Alpha Vantage/Twelve Data/Finnhub 面向当前上市名单。中国：退市/ST/停牌名称常不在免费列表中，分钟历史参差不齐。对任何标的池/动量回测，都要取用时点的成分列表并纳入退市股收益。

**其他。** UTC 与 UTC+8 的日边界（OKX）；永续合约的 mark 与 last 与 funding；**IBKR 历史 pacing**（15 秒内不得有相同请求；>60 请求/10 分钟触发限流）以及 **`CONTFUT` 连续期货仅有历史——自行拼接/移仓并后复权**；OANDA 的定价流是**采样 feed（每品种 ≤4 个价格/秒）**，而非逐笔；OANDA 仅覆盖 FX/金属/CFD（无交易所期货）；外汇周末跳空；公司行动时点。

---

## 数据来源（实际通过 curl 读取的一手页面）

- Alpha Vantage [行情数据政策](https://www.alphavantage.co/realtime_data_policy/)、[premium/定价](https://www.alphavantage.co/premium/)、[文档](https://www.alphavantage.co/documentation/)、[官方 MCP server](https://github.com/alphavantage/alpha_vantage_mcp)
- Yahoo [Developer API Terms of Use](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.html)、[交易所与数据延迟](https://help.yahoo.com/kb/finance/exchanges-data-providers-yahoo-finance-sln2310.html)；实时 chart API `https://query1.finance.yahoo.com/v8/finance/chart/AAPL`；[yfinance 仓库](https://github.com/ranaroussi/yfinance) + [history.py 间隔限制](https://raw.githubusercontent.com/ranaroussi/yfinance/main/yfinance/scrapers/history.py)
- Twelve Data [条款](https://twelvedata.com/terms)、[定价](https://twelvedata.com/pricing)、[历史数据指南](https://support.twelvedata.com/en/articles/5656039-how-to-get-historical-prices)、[twelvedata-python](https://github.com/twelvedata/twelvedata-python)、[twelvedata-node](https://github.com/twelvedata/twelvedata-node)
- Finnhub [条款](https://finnhub.io/terms-of-service)、[定价](https://finnhub.io/pricing)、[速率限制/swagger](https://finnhub.io/static/swagger.json)、[finnhub-python](https://github.com/Finnhub-Stock-API/finnhub-python)、[finnhub-js](https://github.com/Finnhub-Stock-API/finnhub-js)
- Massive（原 Polygon.io）[定价](https://massive.com/pricing)、[自定义 K 线](https://massive.com/docs/rest/stocks/aggregates/custom-bars)、[WS 快速开始](https://massive.com/docs/websocket/quickstart)、[股票 WS 概览](https://massive.com/docs/websocket/stocks/overview)、[请求限制 KB](https://massive.com/knowledge-base/article/what-is-the-request-limit-for-massives-restful-apis)、[pro/non-pro KB](https://massive.com/knowledge-base/article/what-are-pro-and-non-pro-classifications-for-massives-stock-data)、[退市 KB](https://massive.com/knowledge-base/article/what-does-massive-do-with-delisted-tickers)、[SLA](https://massive.com/legal/businesses-terms-of-service-sla)；[client-python](https://github.com/massive-com/client-python)、[client-js](https://github.com/massive-com/client-js)
- Alpaca [关于行情数据](https://docs.alpaca.markets/us/docs/about-market-data-api)、[实时股票数据](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data)、[历史数据](https://docs.alpaca.markets/us/docs/historical-stock-data-1)、[股票 K 线参考](https://docs.alpaca.markets/reference/stockbars)、[数据页](https://alpaca.markets/data)
- EODHD [定价](https://eodhd.com/pricing)、[EOD API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes/)、[盘中 API](https://eodhd.com/financial-apis/intraday-historical-data-api)、[实时 WS](https://eodhd.com/financial-apis/new-real-time-data-api-websockets)、[退市数据](https://eodhd.com/financial-apis/delisted-stock-companies-data)、[商业 vs 个人](https://eodhd.com/financial-apis/commercial-vs-personal-license-use)、[数据源](https://eodhd.com/financial-apis/our-data-sources-and-data-partners)
- Tiingo [定价](https://www.tiingo.com/pricing)、[总体概览](https://www.tiingo.com/documentation/general/overview)、[EOD](https://www.tiingo.com/documentation/end-of-day)、[IEX](https://www.tiingo.com/documentation/iex)、[IEX WebSocket](https://www.tiingo.com/documentation/websockets/iex)
- Binance [REST 文档](https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md)、[WS stream](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md)、实时 `https://api.binance.com/api/v3/exchangeInfo`、[python](https://github.com/binance/binance-connector-python)
- OKX [API 文档](https://www.okx.com/docs-v5/en/)、[python-okx](https://github.com/okx/python-okx)
- Coinbase [K 线](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles)、[K 线 WS](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/websocket/candles)、[Exchange 速率限制](https://docs.cdp.coinbase.com/exchange/introduction/rate-limits-overview)
- Kraken [GetOHLCData](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data)、[历史数据](https://docs.kraken.com/exchange/guides/general/historical-data)、[REST 速率限制](https://docs.kraken.com/exchange/guides/rest/ratelimits)、[SDK](https://docs.kraken.com/home/sdks)
- Tushare [积分/权限表](https://tushare.pro/document/1?doc_id=290)、[daily](https://tushare.pro/document/2?doc_id=27)、[adj_factor](https://tushare.pro/document/2?doc_id=28)、[AkShare 股票数据](https://akshare.akfamily.xyz/data/stock/stock.html)、[BaoStock Python API](https://github.com/lzwme/finance-quant-skills/blob/main/skills/baostock/references/markdown/pythonAPI.md)；PyPI `tushare`、`akshare`、`baostock`
- Interactive Brokers [pacing](https://ibkrcampus.com/docs/tws-api/doc/pacing-limitations/introduction.md)、[历史 K 线粒度](https://ibkrcampus.com/docs/tws-api/doc/market-data-historical/historical-bars/historical-bar-sizes.md)、[连续期货](https://ibkrcampus.eu/docs/general/contracts/futures/continuous-futures.md)、[Client Portal WebSocket](https://ibkrcampus.com/docs/web-api/v1/ws/connection-guide/establishing-the-websocket-with-client-portal-gateway.md)、[行情数据定价](https://www.interactivebrokers.com/en/pricing/market-data-pricing.php)；PyPI `ibapi`、`ib_async`
- OANDA [开发指南](https://developer.oanda.com/rest-live-v20/development-guide/)、[认证](https://developer.oanda.com/rest-live-v20/authentication/)、[最佳实践](https://developer.oanda.com/rest-live-v20/best-practices/)、[K 线粒度](https://developer.oanda.com/rest-live-v20/instrument-df/)、[pricing/stream](https://developer.oanda.com/rest-live-v20/pricing-ep/)、[v20 OpenAPI](https://raw.githubusercontent.com/oanda/v20-openapi/master/yaml/v20.yaml)；官方 [`oanda/v20-python`](https://github.com/oanda/v20-python) + [`oanda/v20-javascript`](https://github.com/oanda/v20-javascript)；第三方 `oandapyV20`
