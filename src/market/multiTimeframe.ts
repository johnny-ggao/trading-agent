import type { MarketContext, TimeframeResonance } from "../shared/analysis";

/** 高一级周期（×4）；1d 之上是 1w（仅为高周期角色而加）。 */
const HIGHER_INTERVAL: Record<string, string> = { "15m": "1h", "1h": "4h", "4h": "1d", "1d": "1w" };

/** 当前周期对应的高一级周期。 */
export function higherInterval(interval: string): string {
  return HIGHER_INTERVAL[interval] ?? interval;
}

const DIRECTION_ZH = { up: "向上", down: "向下", flat: "走平" } as const;
const STATE_ZH = { trending: "趋势", ranging: "震荡", transition: "过渡" } as const;

/**
 * 多周期共振：高周期定结构与方向、当前周期定时机。
 * 两侧方向都明确且相同为共振，相反为背离，任一走平为方向不明确。
 *
 * **两侧周期相同时返回 `undefined`**：那意味着不存在更高周期（例如 1w 之上没有更大周期，
 * `higherInterval` 会回退成自身），拿同一条序列跟自己比必然"同向"，是个假结论。
 */
export function computeResonance(
  higher: string,
  higherContext: MarketContext,
  currentContext: MarketContext,
  currentInterval?: string,
): TimeframeResonance | undefined {
  if (currentInterval !== undefined && higher === currentInterval) return undefined;
  const unambiguous = higherContext.trend.direction !== "flat" && currentContext.trend.direction !== "flat";
  const aligned = unambiguous && higherContext.trend.direction === currentContext.trend.direction;
  const verdict = !unambiguous
    ? "方向不明确"
    : aligned
      ? (currentContext.trend.direction === "up" ? "共振向上" : "共振向下")
      : "周期背离";
  const summary = `高周期 ${higher} 方向${DIRECTION_ZH[higherContext.trend.direction]}（${STATE_ZH[higherContext.trend.state]}）；当前周期方向${DIRECTION_ZH[currentContext.trend.direction]}：${verdict}。`;
  return { higherInterval: higher, higher: higherContext, aligned, summary };
}
