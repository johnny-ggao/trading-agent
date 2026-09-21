import type { ChartCandidates, MaAlignment, PriceLevel, SwingPivot } from "../shared/analysis";
import type { Candle } from "../shared/chartSpec";

export interface PivotOptions {
  /** 比较左/右各多少根。 */
  left: number;
  right: number;
}

export const DEFAULT_PIVOT_OPTIONS: PivotOptions = { left: 2, right: 2 };

/** 分形 swing 枢轴：高（低）点严格高于（低于）左右各 left/right 根。 */
export function findSwingPivots(
  candles: Candle[],
  options: PivotOptions = DEFAULT_PIVOT_OPTIONS,
): SwingPivot[] {
  const { left, right } = options;
  const pivots: SwingPivot[] = [];
  for (let i = left; i < candles.length - right; i += 1) {
    const candle = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j += 1) {
      if (j === i) continue;
      const other = candles[j]!;
      if (candle.high <= other.high) isHigh = false;
      if (candle.low >= other.low) isLow = false;
    }
    if (isHigh) pivots.push({ time: candle.time, price: candle.high, kind: "high" });
    else if (isLow) pivots.push({ time: candle.time, price: candle.low, kind: "low" });
  }
  return pivots;
}

/**
 * 把枢轴聚成支撑/阻力位：相邻价位在 tolerancePct 内合并，price 取簇内均值，
 * touches 记触碰次数；相对现价低者为支撑、高者为阻力。
 */
export function findSupportResistance(
  pivots: SwingPivot[],
  lastClose: number,
  tolerancePct = 0.01,
): PriceLevel[] {
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: Array<{ prices: number[] }> = [];
  for (const pivot of sorted) {
    const current = clusters[clusters.length - 1];
    if (current !== undefined && Math.abs(pivot.price - current.prices[0]!) / current.prices[0]! <= tolerancePct) {
      current.prices.push(pivot.price);
      continue;
    }
    clusters.push({ prices: [pivot.price] });
  }
  return clusters.map((cluster) => {
    const price = cluster.prices.reduce((sum, value) => sum + value, 0) / cluster.prices.length;
    const kind = price < lastClose ? "support" : "resistance";
    return { kind, price, label: kind === "support" ? "S" : "R", touches: cluster.prices.length } as PriceLevel;
  });
}

/** 由区间低/高点给出斐波那契回撤位（价格取 6 位小数，保证可复现）。 */
export function fibonacciLevels(low: number, high: number): PriceLevel[] {
  const range = high - low;
  return [0.236, 0.382, 0.5, 0.618, 0.786].map((ratio) => ({
    kind: "fib" as const,
    price: Number((high - range * ratio).toFixed(6)),
    label: `Fib ${(ratio * 100).toFixed(1)}%`,
    touches: 0,
  }));
}

/** 均线排列：短>中>长为多头，短<中<长为空头，其余为混合；少于两条返回 undefined。 */
export function movingAverageAlignment(
  values: Array<{ period: number; value: number }>,
): MaAlignment | undefined {
  if (values.length < 2) return undefined;
  const ordered = [...values].sort((a, b) => a.period - b.period);
  let increasing = true;
  let decreasing = true;
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i]!.value <= ordered[i - 1]!.value) increasing = false;
    if (ordered[i]!.value >= ordered[i - 1]!.value) decreasing = false;
  }
  // 周期越长值越高 = 空头排列；周期越长值越低 = 多头排列。
  const order = decreasing ? "bullish" : increasing ? "bearish" : "mixed";
  const chain = ordered.map((entry) => `MA${entry.period}`).join(order === "bearish" ? "<" : ">");
  const label = order === "bullish" ? `多头排列 ${chain}`
    : order === "bearish" ? `空头排列 ${chain}`
    : `均线交织 ${ordered.map((entry) => `MA${entry.period}`).join("/")}`;
  return { order, values: ordered, label };
}

/** 汇总机械候选：枢轴、支撑阻力、斐波那契位、均线排列。 */
export function computeCandidates(
  candles: Candle[],
  maValues: Array<{ period: number; value: number }> = [],
): ChartCandidates {
  if (candles.length === 0) return { pivots: [], levels: [], lastPrice: 0 };
  const pivots = findSwingPivots(candles);
  const lastClose = candles[candles.length - 1]!.close;
  const supportResistance = findSupportResistance(pivots, lastClose);
  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));
  const levels = [...supportResistance, ...fibonacciLevels(low, high)];
  const maAlignment = movingAverageAlignment(maValues);
  return maAlignment === undefined
    ? { pivots, levels, lastPrice: lastClose }
    : { pivots, levels, maAlignment, lastPrice: lastClose };
}
