import type { Candle, ChartSpec, PaneSpec, SeriesSpec } from "../shared/chartSpec";
import { computeIndicators, DEFAULT_INDICATORS, type IndicatorConfig } from "./indicators";

/** 工单 02 的默认周期集合（工单 04 会做时间词映射）。 */
export const DEFAULT_TIMEFRAMES = ["15m", "1h", "4h", "1d"];

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
