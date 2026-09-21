# 06: 市场状态、指标推荐与多周期共振

**要构建什么：** 机械计算市场状态（趋势强度如 ADX、震荡/趋势、波动率、量能、均线排列）；模型据此给出文字版指标推荐（不改动图表）。多周期共振：高一级周期定结构与方向、当前周期定时机；高周期图按需呈现。

**Blocked by:** 05

**Status:** ready-for-agent

- [x] 市场状态块进入 `MarketView`
- [x] 指标推荐只作文本、不改图
- [x] 多周期：高周期结构/方向 + 当前周期时机
- [x] 高周期默认 ×4（1h→4h；1d→1w）
- [x] 确定性测试

## Comments

- 2026-09-21：**工单 06 落地。**
  - 市场状态 `src/market/context.ts`：ADX(14) + ±DI（trading-signals 的 pdi/mdi 是 +DM/ATR 比值，已 ×100 归一到常规 DI）、趋势/震荡/过渡、方向；波动（ATR、ATR%，相对近期中位数偏高/正常/偏低）；量能（最新/前 20 根均量）；均线排列；人类可读 `summary`。
  - 多周期 `src/market/multiTimeframe.ts`：高一级周期 ×4（15m→1h、1h→4h、4h→1d、1d→1w）；同向共振、反向背离、任一侧走平则方向不明确。
  - 接缝 `buildMarketView(provider, request)` 返回 `{ chartSpec, candidates, ruleSignals, context, resonance }`（规格里的 `MarketView`）；HTTP 换图端点继续用轻量 `loadChart`，不额外取高周期。
  - 工具输出新增 `context` / `resonance`；skill 增加"机械数据怎么用"与"指标推荐只作文本"两节。
  - 测试：context 5、multiTimeframe 4、request 6、skill 10；全库 106 例。
  - "高周期图按需呈现"按"默认只给高周期状态、高周期图由周期切换按需呈现"实现；若需同次调用附高周期图，另开项。
