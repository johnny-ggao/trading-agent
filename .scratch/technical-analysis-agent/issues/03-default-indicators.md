# 03: 默认指标渲染（trading-signals）

**要构建什么：** 图上默认渲染主流指标：主图 MA20/50/200，副图 MACD、RSI、成交量，全部由 trading-signals 计算，参数为默认值。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] 指标引擎封装 trading-signals（MA/EMA、MACD、RSI、布林、KDJ、ATR、量）
- [ ] `chartSpec` 扩展出多窗格 series
- [ ] 默认主图 MA20/50/200，副图 MACD/RSI/成交量
- [ ] 指标结果对照参考序列的测试
- [ ] 未收盘 K 线不参与指标判定
