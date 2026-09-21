# 04: 周期、覆盖与图表控件 + skill v1

**要构建什么：** 周期集合 15m/1h/4h/1d 可指定；时间词（今天/这周/这月）自动映射主周期；自然语言覆盖指标参数；图卡上可切换周期、开关指标；回答里声明所用默认。随包附带 skill，教模型何时调用、参数怎么填。

**Blocked by:** 03

**Status:** ready-for-agent

- [x] 周期集合与默认值（默认 1h）
- [x] 时间词 → 主周期映射（今天→1h、这周→4h、这月→1d）
- [x] 自然语言参数覆盖
- [ ] 图卡控件：周期切换、指标开关（布林/KDJ/ATR）
- [x] skill v1 随包附带并由宿主注册
- [x] 回答声明所用默认

## Comments

- 2026-09-21：**04b（skill v1）落地。** 宿主半边用 `ctx.skills.register()` 注册随包 skill `trading-chart`；正文在 `assets/trading-chart.md`，构建时由 esbuild 的 `.md` text loader 内联进 `lib/index.js`。skill 规定：何时调用 `trading_chart`、时间词 → 主周期、各参数怎么填、默认值（MA20/50/200 + 成交量 + MACD，RSI 默认关闭）、以及回答开头声明所用默认。接缝测试 `src/skill/tradingChart.test.ts`（8 例）。宿主半边改动需重启 `dsh web`。
- 04a 的三项（周期默认、时间词映射、参数覆盖）与"回答声明所用默认"经前次评审确认，这里补勾。**04c（图卡周期切换/指标开关）仍未做。**
