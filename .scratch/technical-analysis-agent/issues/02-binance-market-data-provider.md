# 02: Binance 行情与 MarketDataProvider

**要构建什么：** 图表改为展示 Binance 现货真实 BTC/USDT 1h K 线。定义 `MarketDataProvider` 接口并提供 Binance 实现；`BTC` 默认解析为其主现货对；按周期 TTL 缓存，并对 429/418 做退避重试。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `MarketDataProvider` 接口（`fetchCandles`、`fetchDerivatives`）
- [ ] Binance 实现
- [ ] 默认把 `BTC` 解析为 `BTCUSDT`
- [ ] 图上显示真实 1h K 线，区分已收盘与形成中
- [ ] 解析/分页/区间边界/限流退避的录制 fixture 测试（不打真实网络）
- [ ] 按周期 TTL 缓存

## Comments

- 2026-09-21：修复真实会话暴露的取数失败。现象：web 会话里 `trading_chart` 连续两次返回 `Error: fetch failed`，导致图表无 chartSpec、K 线不渲染。根因：provider 把主机写死为 `https://data-api.binance.vision`，该域名在本机网络会间歇性 TLS 连接失败（同一时刻 `api.binance.com` 返回 200）。改动：默认主机改为 `api.binance.com`，并在传输失败/5xx 时按 `api.binance.com → api1.binance.com → data-api.binance.vision` 回退；4xx 与持续限流不回退（换主机结果相同）；错误信息带出尝试过的主机与原因。测试：`src/market/binance.test.ts` 新增 4 例（默认主机、首主机失败回退、全失败报错、显式 baseUrl 单主机）。

