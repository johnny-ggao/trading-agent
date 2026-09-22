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

## 引导词要求（skill v3，与工具同等重要）

选择权交给 agent 之后，**引导词就是接口的一部分**：模型必须知道"有哪些可选、名字怎么拼、按什么顺序取、什么能算证据"。以下几条来自用户提供的一个成熟 trading agent 系统提示，逐条适配到本插件。

### 1. 指标清单（写进 skill，而不是让模型猜）

必须在 skill 正文里给出**可用指标的枚举**：精确 id、参数、语义、用法与坑点。用户示例里的写法值得照搬：

```
均线类
- ma(20/50/200)：中/长期趋势基准，兼作动态支撑阻力。坑：滞后，需与更快指标配合。
- ema(10)：短周期，捕捉动能转折。坑：震荡市噪音大，用长均线过滤。
动能类
- macd(12,26,9) / macdSignal / macdHistogram：交叉与背离。坑：低波动区间要交叉验证。
- rsi(14)：超买超卖与背离。坑：强趋势里可长期钝化在极值区。
波动类
- bollinger(20,2)：中轨=20SMA，上下轨 ±2σ。坑：强趋势里价格会贴着轨道走。
- atr(14)：波动幅度，用于衡量"多少算大波动"。坑：反应滞后，是背景不是信号。
量能类
- volume / vwma(20) / obv：把价格与成交量结合起来确认。坑：成交量尖峰会扭曲 vwma。
```

**明确写"只能用上面列出的 id，拼错会调用失败"**——用户示例里这句是防止模型自造参数名的关键。实测可用的清单见 `trading-signals` 导出（141 项），我们按需启用子集；`vwma` / `obv` / `mfi` / `adx` / `supertrend` / `ichimoku` / `vwap` 都在其中，无需自己实现。

### 2. 调用顺序（写死）

用户示例的顺序值得我们照抄结构：**先取数据 → 再算指标 → 写结论前先取"权威快照"**。映射到本插件：

1. 先 `trading_chart`（出图 + 最小锚点）——拿到 symbol/周期/现价/市场状态；
2. 再按需 `trading_indicator` / `trading_levels`（如需衍生品则 `trading_derivatives`）；
3. 形成方向性结论后调用 `trading_confidence` 校准；
4. 最后写回答，**引用工具返回的具体数值与时间**。

### 3. 单一事实来源 + 冲突要上报

用户示例里最强的一条纪律：把某个工具的输出当作 source of truth，**若另一工具的数值与之冲突，要指出冲突，而不是编一个调和后的数字**。本插件对应的是：

- 每个响应自带 `grounding`（最后一根已收盘 bar、用了多少根、参数、预热期）。**回答里引用的每个数值都必须能追到某次工具响应**；
- 两次响应数值不一致时（例如 `trading_chart` 锚点的现价与后续指标响应的收盘价不同），要说明这是"又过了一根 K 线"还是真冲突；
- **禁止**在没有工具输出支撑的情况下声称历史验证、支撑阻力"被反弹验证过"、或精确百分比涨跌。已有工具输出要带 **具体日期与价位**。

### 4. 多样性与不冗余，并有上限

用户示例要求"最多 8 个互补指标、避免冗余（例如不要同时选 rsi 和 stochrsi）"，并要求**简述每个指标为何适合当前市场状态**。适配为：

- skill 要求模型**每轮指标请求控制在 ≤8 项**、互相互补、并在回答里一句话说明选择理由；
- 与"按需取数"的差别要写清：8 项是**单轮上限**，模型可以之后再发一轮请求补看别的——上限是为了 prompt 成本与选择性，不是探索的天花板。
- **参数遵循清单里的常用档位**（如 `ma(20/50/200)`、`rsi(14)`、`bollinger(20,2)`）；使用清单外的参数（如 `ma(7)`）必须在回答里说明理由——避免模型随手取无意义的组合。

### 5. 输出结构

用户示例要求"先写详细报告、结尾附 Markdown 表格"。我们的 skill 已有三层产出 + 方向/失效位/置信度三件套（工单 07），**保留**；在其之上补充：

- 回答结尾附一个**关键点表格**（层级 / 事实 / 依据的数值与时间）；
- "详细"限定在**可核对的事实与推理链**上，不写成情绪化的行情描述；
- 沿用既有的**不给交易建议**规则（不给入场/出场/目标价、仓位、买卖指令）。

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
16. skill v3 内含**指标清单**（精确 id + 参数 + 用法/坑点）与"拼错会调用失败"的告诫；正文有断言锁住至少 `ma`/`ema`/`macd`/`rsi`/`bollinger`/`atr`/`volume` 及新增项 `vwma`/`obv`/`adx` 的 id 字样。
17. skill v3 含**单一事实来源**与冲突上报纪律、引数必带时间、禁止无依据的历史验证/反弹/涨跌声明；正文有断言锁住这些措辞。
18. skill v3 含"每轮 ≤8 项指标、互相互补并说明理由"的约束，且清楚写出"这是单轮上限、可以再发一轮"。
18b. skill v3 要求参数遵循清单常用档位，偏离档位须说明理由（断言锁住"说明理由"与至少一个档位示例）。
19. skill v3 要求在回答结尾给关键点表格（层级/事实/依据），并保持三层产出与"不给交易建议"两条既有约束。
20. 全库测试通过、typecheck / build 干净。

## 范围之外

- `trading_derivatives` 与 Hyperliquid 适配：随 [工单 08](08-hyperliquid-complementary-feed.md) 落地，接口形态在本工单确定后保持一致。
- 艾略特波浪 / 经典形态的机械检测：仍属模型判断层（ADR-0002），本工单不做。
- 流式/增量推送（WebSocket 订阅）：仍是请求-响应。

## Comments

- 2026-09-22：**由用户提出的架构批评促成**——"预先把指标捆绑好交给模型会限制它的推理能力，应该让它按结果一步步取数"。设计过程与三个选项的取舍记录在本工单的对话里；结论见 ADR-0008：**代码负责算，agent 负责选**；渲染仍固定（视觉需要），推理改为按需。
