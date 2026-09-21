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
