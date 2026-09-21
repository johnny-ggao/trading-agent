import type { Candle, ChartSpec } from "../shared/chartSpec";

/** 工单 02 的默认周期集合（工单 04 会做时间词映射）。 */
export const DEFAULT_TIMEFRAMES = ["15m", "1h", "4h", "1d"];

/** 由 K 线构造最小可渲染的 chartSpec（指标在工单 03 加入）。 */
export function buildCandleSpec(symbol: string, interval: string, candles: Candle[]): ChartSpec {
  return {
    symbol,
    interval,
    timeframes: DEFAULT_TIMEFRAMES,
    panes: [{ id: "price", title: "价格" }],
    series: [{ id: "candles", type: "candlestick", pane: "price", data: candles }],
    formingBar: true,
  };
}
