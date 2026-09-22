# 12: 按需取数的工具族（分析接口重构）

**要构建什么：** 按 [ADR-0008](../../../docs/adr/0008-agent-driven-data-fetch.md)，把"选什么指标"的决定权从宿主预设交给 agent：`trading_chart` 退化为"出图 + 最小锚点"，新增 `trading_indicator` 与 `trading_levels`（`trading_derivatives` 随工单 08 落地），每次响应自带 grounding，数据不足时明确报错而非静默。

**Blocked by:** 07

**Status:** ready-for-agent

## 工具契约

### `trading_chart`（改造：出图 + 最小锚点）

入参不变（`symbol` / `timeframe` / `ma` / `rsi` / `bollinger` / `kdj` / `atr`）——它们现在**只影响渲染**。

输出：`chartSpec`（presentation metadata）+ 文本块，文本只含锚点，**不再**返回 candidates / ruleSignals / context / resonance 的 JSON：

```json
{
  "symbol": "BTCUSDT", "interval": "1h",
  "lastClosedBar": 1789000000, "closedBars": 719, "formingBars": 1,
  "lastClose": 85692.83,
  "context": { "trend": {"state":"trending","direction":"up","adx":53.6}, "volatility": {"state":"high","atrPct":0.0071}, "volume": {"state":"low","ratio":0.46} },
  "hint": "需要指标值/价位/衍生品数据时，用 trading_indicator / trading_levels 按需取。"
}
```

### `trading_indicator`（新增）

```ts
{
  symbol: string,
  interval?: string,          // 15m/1h/4h/1d 或时间词；默认 1h
  indicators: Array<
    | { id: "ma",   period: number }
    | { id: "ema",  period: number }
    | { id: "rsi",  period: number }
    | { id: "macd", fast?: number, slow?: number, signal?: number }
    | { id: "bollinger", period?: number, deviation?: number }
    | { id: "kdj",  kPeriod?: number, dPeriod?: number, kSlowingPeriod?: number }
    | { id: "atr",  period: number }
    | { id: "volume" }
  >,
  lookback?: number,          // 默认 20，上限 500
  full?: boolean,             // 默认 false；true 才回完整序列
  asOf?: number               // 可选：锚定到某个已收盘 bar（秒）
}
```

**响应形状（紧凑默认 + 显式展开）**——每个指标一份自描述结果：

```json
{
  "symbol": "BTCUSDT", "interval": "1h",
  "grounding": { "lastClosedBar": 1789000000, "formingBars": 1, "barsUsed": 400, "closedOnly": true },
  "indicators": [
    { "id": "rsi", "params": { "period": 14 }, "warmupBars": 14,
      "latest": { "time": 1789000000, "value": 68.2 },
      "recent": [ { "time": 1788996400, "value": 64.1 }, "…" ],
      "stats": { "min": 41.2, "max": 78.9, "mean": 57.3, "change": 4.1 } },
    { "id": "ma", "params": { "period": 200 }, "warmupBars": 200,
      "latest": { "time": 1789000000, "value": 82110.4 }, "recent": ["…"], "stats": {} }
  ]
}
```

- `warmupBars` 必填：让模型知道这个数依赖多少历史，以及为什么某些窗口取不到值。
- `full: true` 时以 `series` 字段返回完整序列，并**省略** `recent`。
- 参数越界（如 `lookback > 500`）→ 明确报错说明上限，不静默截断。

### `trading_levels`（新增）

```ts
{
  symbol: string,
  interval?: string,
  kinds?: Array<"support" | "resistance" | "fib" | "pivots">,  // 默认全要
  pivotOptions?: { left?: number, right?: number },             // 默认 2/2
  tolerancePct?: number,                                        // 默认 1
  maxLevels?: number,                                           // 默认全部；按 touches 降序再按距离升序
}
```

响应：`grounding` 同上 + `pivots`（含 `kind: high|low`、`time`、`price`）+ `levels`（含 `kind`、`price`、`touches`、`distancePct`）+ 每类计数。

### 数据不足的统一处理

任何请求若在"已收盘 K 线 + 需要的最长预热期"下无法产出有意义的值，返回**明确的结构化说明**（缺多少根、需要多少根），而不是回一个基于不足窗口的数值：

```json
{ "ok": false, "reason": "insufficient_closed_bars", "required": 200, "available": 37,
  "hint": "把 interval 换成更大的周期，或接受更短的均线周期。" }
```

## 验收标准（测试先行）

**`trading_indicator`**
1. 只返回被点名的指标（要 MA50 就不出现 RSI/成交量）。
2. 参数被原样回显（`period: 50` 出现在 `params`）。
3. `latest.value` 与既有参考序列一致（对固定 fixture 断言具体数值，非"存在即可"）。
4. `earliest` 数据点在已收盘边界内；`grounding.lastClosedBar` 等于 fixture 的最后一根已收盘 bar；`formingBars` 正确。
5. 紧凑默认下 `recent` 长度 = `lookback` 且不含完整序列；`full: true` 时给 `series` 且省略 `recent`。
6. 窗口不足以支撑预热期时：`ok=false` + `required`/`available`（例如 37 根要 MA200）。
7. `lookback` 超上限 → 明确报错，不静默截断。

**`trading_levels`**
8. `kinds` 过滤生效；`tolerancePct` 改变聚类结果（同一 fixture 下 0.5% 与 2% 产出不同簇数）。
9. `maxLevels` 按 `touches` 降序裁剪；每条带 `distancePct`。
10. 枢轴数量与位置对固定 fixture 精确匹配（复用现有 `candidates.test.ts` 的 fixture 作为参考值）。
11. 已收盘边界同 4。

**`trading_chart`**
12. 输出中不再包含 candidates/ruleSignals/resonance 的 JSON；锚点字段齐全且与同一 fixture 的 `MarketView` 一致。
13. 图面仍是"K 线 + 均线 + 离现价最近的支撑/阻力各 3 条"，无斐波那契、无标记（回归保护，防止重构把上两轮的减法改回去）。

**通用**
14. `trading_confidence` 仍能从缓存取到证据（重构不得打断工单 07 的校准链路）。
15. skill v3 说明四个工具的调用顺序与"何时该调我"，并有断言锁住正文要点。
16. 全库测试通过、typecheck / build 干净。

## 范围之外

- `trading_derivatives` 与 Hyperliquid 适配：随 [工单 08](08-hyperliquid-complementary-feed.md) 落地，接口形态在本工单确定后保持一致。
- 艾略特波浪 / 经典形态的机械检测：仍属模型判断层（ADR-0002），本工单不做。
- 流式/增量推送（WebSocket 订阅）：仍是请求-响应。

## Comments

- 2026-09-22：**由用户提出的架构批评促成**——"预先把指标捆绑好交给模型会限制它的推理能力，应该让它按结果一步步取数"。设计过程与三个选项的取舍记录在本工单的对话里；结论见 ADR-0008：**代码负责算，agent 负责选**；渲染仍固定（视觉需要），推理改为按需。
