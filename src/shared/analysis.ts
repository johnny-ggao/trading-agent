/**
 * 机械层（候选与规则信号）的宿主↔模型契约类型。
 *
 * 这些是确定性计算的产物：只有机械计算出来的东西在这里，模型的筛选、命名与
 * 结论不在这里（ADR-0002）。客户端的图上标记类型在 `chartSpec.ts`。
 */

/** swing 枢轴：局部高点/低点。 */
export interface SwingPivot {
  time: number;
  price: number;
  kind: "high" | "low";
}

/** 价位：支撑、阻力或斐波那契位。 */
export interface PriceLevel {
  kind: "support" | "resistance" | "fib";
  price: number;
  label: string;
  /** 支撑/阻力的触碰次数（越强越高）；斐波那契位为 0。 */
  touches: number;
}

/** 均线排列。 */
export interface MaAlignment {
  order: "bullish" | "bearish" | "mixed";
  /** 由短到长的均线值。 */
  values: Array<{ period: number; value: number }>;
  label: string;
}

/** 机械候选集合。 */
export interface ChartCandidates {
  pivots: SwingPivot[];
  levels: PriceLevel[];
  maAlignment?: MaAlignment;
  /** 最后一根收盘价，用于就近挑选要显示的价位。 */
  lastPrice: number;
}

/** 规则信号种类。 */
export type RuleSignalKind =
  | "ma-cross"
  | "macd-cross"
  | "rsi-overbought"
  | "rsi-oversold"
  | "breakout-high"
  | "breakout-low";

/** 规则信号（确定性事件，非模型判断）。 */
export interface RuleSignal {
  kind: RuleSignalKind;
  time: number;
  price: number;
  direction: "bullish" | "bearish";
  label: string;
}
