# 05: 机械候选与规则信号

**要构建什么：** 机械计算并暴露：swing pivot 点、支撑阻力区、斐波那契位、均线排列；以及规则信号（金叉/死叉、超买超卖、突破），并在图上标记。

**Blocked by:** 03

**Status:** ready-for-agent

- [x] swing pivot、支撑阻力区、斐波那契位、均线排列
- [x] 规则信号（交叉、超买超卖、突破）
- [x] 图上标记
- [x] 固定 fixture 的确定性测试

## Comments

- 2026-09-21：**工单 05 落地。**
  - 候选 `src/market/candidates.ts`：分形 swing 枢轴（左右各 2 根）、支撑/阻力聚类（1% 容差 + 触碰次数）、斐波那契回撤（0.236/0.382/0.5/0.618/0.786）、均线排列（短高长低=多头）。
  - 规则信号 `src/market/signals.ts`：均线/MACD 金叉死叉、RSI 超买超卖、前 20 根区间突破；每类取窗口内最近一次。
  - 图上标记 `src/market/presentation.ts` + 客户端：枢轴圆点（`atPriceMiddle`）、规则信号箭头/圆点、支撑阻力与斐波那契价位线（`createPriceLine`）、均线排列图例文字（`ChartSpec.notes`）。
  - `trading_chart` 输出新增 `candidates` / `ruleSignals`，`render` 以 JSON 交给模型（机械层可见、仍未作判断，符合 ADR-0002）。
  - 测试：candidates 10、signals 12、presentation 5、request 5；全库 94 例。
  - 已知（用户接受、后续再调）：720 根窗口下图上元素偏多——枢轴最多 8、支撑阻力各取最近 3、斐波那契 5。
