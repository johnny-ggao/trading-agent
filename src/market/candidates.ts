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
 * 把枢轴聚成支撑/阻力位：相邻价位在 `tolerance` 内合并，price 取簇内均值，touches 记触碰次数；
 * 相对现价低者为支撑、高者为阻力。
 *
 * **`tolerance` 的单位是分数**（`0.01` = 1%），全仓只此一份实现——出图与分析都走它，
 * 避免"图上画的"与"回答里引用的"因两份实现而悄悄分叉。对外的百分比接口在 facts.ts。
 * 每条价位附带 `pivotTimes`（形成它的枢轴时间）与 `distancePct`，便于回答里引用具体日期与价位。
 */
export function findSupportResistance(
  pivots: SwingPivot[],
  lastClose: number,
  tolerance = 0.01,
): PriceLevel[] {
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: SwingPivot[][] = [];
  for (const pivot of sorted) {
    const current = clusters[clusters.length - 1];
    const anchor = current?.[0]?.price;
    if (current !== undefined && anchor !== undefined && Math.abs(pivot.price - anchor) / anchor <= tolerance) {
      current.push(pivot);
      continue;
    }
    clusters.push([pivot]);
  }
  return clusters.map((cluster) => {
    const price = cluster.reduce((sum, pivot) => sum + pivot.price, 0) / cluster.length;
    const kind = price < lastClose ? "support" : "resistance";
    return {
      kind,
      price,
      label: kind === "support" ? "S" : "R",
      touches: cluster.length,
      distancePct: lastClose === 0 ? 0 : ((price - lastClose) / lastClose) * 100,
      pivotTimes: cluster.map((pivot) => pivot.time).sort((a, b) => a - b),
    } as PriceLevel;
  });
}

/**
 * 每侧各取离现价最近的至多 `n` 条支撑/阻力（斐波那契不参与）。
 *
 * 这是**一个策略，两个消费方**：图上画什么（presentation）与送给 Jev 的证据含什么（confidence）
 * 共用它，避免"草图"与"证据"悄悄采用不同的取舍。
 */
export function nearestPerSide(levels: readonly PriceLevel[], _lastClose: number, n: number): PriceLevel[] {
  const byDistance = (kind: "support" | "resistance", compare: (a: number, b: number) => number): PriceLevel[] =>
    levels
      .filter((level) => level.kind === kind)
      .sort((a, b) => compare(a.price, b.price))
      .slice(0, n);
  return [
    ...byDistance("support", (a, b) => b - a),
    ...byDistance("resistance", (a, b) => a - b),
  ];
}

/**
 * 由区间低/高点给出斐波那契回撤位（价格取 6 位小数，保证可复现）。
 *
 * `lastClose` 给定时附带 `distancePct`（距现价多远），没有形成它的枢轴，故 `pivotTimes` 为空。
 */
export function fibonacciLevels(low: number, high: number, lastClose?: number): PriceLevel[] {
  const range = high - low;
  return [0.236, 0.382, 0.5, 0.618, 0.786].map((ratio) => {
    const price = Number((high - range * ratio).toFixed(6));
    return {
      kind: "fib" as const,
      price,
      label: `Fib ${(ratio * 100).toFixed(1)}%`,
      touches: 0,
      distancePct: lastClose === undefined || lastClose === 0 ? 0 : ((price - lastClose) / lastClose) * 100,
      pivotTimes: [] as number[],
    };
  });
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
  const levels = [...supportResistance, ...fibonacciLevels(low, high, lastClose)];
  const maAlignment = movingAverageAlignment(maValues);
  return maAlignment === undefined
    ? { pivots, levels, lastPrice: lastClose }
    : { pivots, levels, maAlignment, lastPrice: lastClose };
}
