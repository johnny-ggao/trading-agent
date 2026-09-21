import { EMA, MACD, RSI, SMA } from "trading-signals";
import type { Candle, LinePoint, SeriesSpec } from "../shared/chartSpec";

export interface IndicatorConfig {
  ma: number[];
  macd: { fast: number; slow: number; signal: number };
  rsi: number;
  volume: boolean;
}

export const DEFAULT_INDICATORS: IndicatorConfig = {
  ma: [20, 50, 200],
  macd: { fast: 12, slow: 26, signal: 9 },
  rsi: 14,
  volume: true,
};

const MA_COLORS: Record<number, string> = { 20: "#f5a623", 50: "#4a90d9", 200: "#b06bd6" };
const MACD_COLOR = "#4a90d9";
const SIGNAL_COLOR = "#f5a623";
const RSI_COLOR = "#b06bd6";
const UP_COLOR = "rgba(38, 166, 154, 0.7)";
const DOWN_COLOR = "rgba(239, 83, 80, 0.7)";
const VOLUME_COLOR = "rgba(120, 123, 134, 0.45)";

/** 把指标输出序列对齐到 K 线时间，跳过预热期的 null。 */
function toLinePoints(candles: Candle[], values: ReadonlyArray<number | null>): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    out.push({ time: candles[i]!.time, value });
  }
  return out;
}

/** 由 K 线计算默认指标，产出可直接放进 chartSpec 的 series。 */
export function computeIndicators(candles: Candle[], config: IndicatorConfig = DEFAULT_INDICATORS): SeriesSpec[] {
  const closes = candles.map((candle) => candle.close);
  const series: SeriesSpec[] = [];

  if (config.volume) {
    const data: LinePoint[] = [];
    for (const candle of candles) {
      if (candle.volume !== undefined && Number.isFinite(candle.volume)) {
        data.push({ time: candle.time, value: candle.volume });
      }
    }
    series.push({
      id: "volume",
      type: "histogram",
      pane: "volume",
      data,
      label: "VOL",
      options: { color: VOLUME_COLOR, priceFormat: { type: "volume" } },
    });
  }

  for (const period of config.ma) {
    const sma = new SMA(period);
    series.push({
      id: `ma${period}`,
      type: "line",
      pane: "price",
      data: toLinePoints(candles, sma.updates(closes)),
      label: `MA${period}`,
      options: { color: MA_COLORS[period] ?? "#9aa0aa", lineWidth: 1 },
    });
  }

  const macd = new MACD(new EMA(config.macd.fast), new EMA(config.macd.slow), new EMA(config.macd.signal));
  const macdResults = macd.updates(closes);
  const macdLine: LinePoint[] = [];
  const signalLine: LinePoint[] = [];
  const histogram: LinePoint[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const result = macdResults[i];
    if (result === null || result === undefined) continue;
    const time = candles[i]!.time;
    macdLine.push({ time, value: result.macd });
    signalLine.push({ time, value: result.signal });
    histogram.push({ time, value: result.histogram, color: result.histogram >= 0 ? UP_COLOR : DOWN_COLOR });
  }
  series.push({ id: "macd", type: "line", pane: "macd", data: macdLine, label: "DIF", options: { color: MACD_COLOR, lineWidth: 1 } });
  series.push({ id: "macdSignal", type: "line", pane: "macd", data: signalLine, label: "DEA", options: { color: SIGNAL_COLOR, lineWidth: 1 } });
  series.push({ id: "macdHist", type: "histogram", pane: "macd", data: histogram, label: "Hist" });

  const rsi = new RSI(config.rsi);
  series.push({
    id: `rsi${config.rsi}`,
    type: "line",
    pane: "rsi",
    data: toLinePoints(candles, rsi.updates(closes)),
    label: `RSI(${config.rsi})`,
    options: { color: RSI_COLOR, lineWidth: 1 },
  });

  return series;
}
