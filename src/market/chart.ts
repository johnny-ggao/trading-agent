import type { Candle, ChartSpec, PaneSpec, SeriesSpec } from "../shared/chartSpec";
import { computeIndicators, DEFAULT_INDICATORS, type IndicatorConfig } from "./indicators";

/** 工单 02 的默认周期集合（工单 04 会做时间词映射）。 */
export const DEFAULT_TIMEFRAMES = ["15m", "1h", "4h", "1d"];

/** 每个周期默认取多少根 K 线：周期越短取得越多，保证可比的"视野"。 */
export const BARS_BY_INTERVAL: Record<string, number> = {
  "15m": 800,
  "1h": 600,
  "4h": 500,
  "1d": 400,
};
export const DEFAULT_BARS = 500;
/** 下限：至少覆盖最长指标（MA200）的预热期并留出余量。 */
export const MIN_BARS = 250;

/** 由周期决定 K 线根数，并保证不低于指标预热期下限。 */
export function barsForInterval(interval: string, minBars: number = MIN_BARS): number {
  return Math.max(BARS_BY_INTERVAL[interval] ?? DEFAULT_BARS, minBars);
}

/** 由 K 线 + 默认指标构造可渲染的 chartSpec。 */
export function buildChartSpec(
  symbol: string,
  interval: string,
  candles: Candle[],
  config: IndicatorConfig = DEFAULT_INDICATORS,
): ChartSpec {
  const panes: PaneSpec[] = [
    { id: "price", title: "价格" },
    ...(config.volume ? [{ id: "volume", title: "成交量" }] : []),
    { id: "macd", title: "MACD" },
    { id: "rsi", title: `RSI ${config.rsi}` },
  ];
  const series: SeriesSpec[] = [
    { id: "candles", type: "candlestick", pane: "price", data: candles },
    ...computeIndicators(candles, config),
  ];
  return { symbol, interval, timeframes: DEFAULT_TIMEFRAMES, panes, series, formingBar: true };
}
