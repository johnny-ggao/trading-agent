import { ATR, BollingerBands, EMA, MACD, RSI, SMA, StochasticOscillator } from "trading-signals";
import type { Candle, LinePoint, SeriesSpec } from "../shared/chartSpec";

export interface IndicatorConfig {
  ma: number[];
  macd: { fast: number; slow: number; signal: number };
  /** 可选：RSI 周期；不提供则不显示 RSI（默认关闭）。 */
  rsi?: number;
  volume: boolean;
  /** 可选：布林带（主图）。 */
  bollinger?: { period: number; deviation: number };
  /** 可选：KDJ（副图，trading-signals 的随机指标 J 线）。 */
  kdj?: { kPeriod: number; dPeriod: number; kSlowingPeriod: number };
  /** 可选：ATR 周期（副图）。 */
  atr?: number;
}

export const DEFAULT_INDICATORS: IndicatorConfig = {
  ma: [20, 50, 200],
  macd: { fast: 12, slow: 26, signal: 9 },
  volume: true,
};

const MA_COLORS: Record<number, string> = { 20: "#f5a623", 50: "#4a90d9", 200: "#b06bd6" };
const MACD_COLOR = "#4a90d9";
const SIGNAL_COLOR = "#f5a623";
const RSI_COLOR = "#b06bd6";
export const UP_COLOR = "rgba(38, 166, 154, 0.7)";
export const DOWN_COLOR = "rgba(239, 83, 80, 0.7)";
/** 成交量：涨绿跌红（按该根 K 线的收盘 vs 开盘）。 */
export const VOLUME_UP_COLOR = "rgba(38, 166, 154, 0.5)";
export const VOLUME_DOWN_COLOR = "rgba(239, 83, 80, 0.5)";

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
        data.push({
          time: candle.time,
          value: candle.volume,
          color: candle.close >= candle.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
        });
      }
    }
    series.push({
      id: "volume",
      type: "histogram",
      pane: "volume",
      data,
      label: "VOL",
      options: { priceFormat: { type: "volume" } },
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

  if (config.rsi !== undefined) {
    const rsi = new RSI(config.rsi);
    series.push({
      id: `rsi${config.rsi}`,
      type: "line",
      pane: "rsi",
      data: toLinePoints(candles, rsi.updates(closes)),
      label: `RSI(${config.rsi})`,
      options: { color: RSI_COLOR, lineWidth: 1 },
    });
  }

  if (config.bollinger !== undefined) {
    const bb = new BollingerBands(config.bollinger.period, config.bollinger.deviation);
    const results = bb.updates(closes);
    const upper: LinePoint[] = [];
    const middle: LinePoint[] = [];
    const lower: LinePoint[] = [];
    for (let i = 0; i < candles.length; i += 1) {
      const result = results[i];
      if (result === null || result === undefined) continue;
      const time = candles[i]!.time;
      upper.push({ time, value: result.upper });
      middle.push({ time, value: result.middle });
      lower.push({ time, value: result.lower });
    }
    series.push({ id: "bbUpper", type: "line", pane: "price", data: upper, label: `BOLL上(${config.bollinger.period})`, options: { color: "#7e8b9b", lineWidth: 1 } });
    series.push({ id: "bbMiddle", type: "line", pane: "price", data: middle, label: "BOLL中", options: { color: "#e0a23c", lineWidth: 1 } });
    series.push({ id: "bbLower", type: "line", pane: "price", data: lower, label: "BOLL下", options: { color: "#7e8b9b", lineWidth: 1 } });
  }

  if (config.kdj !== undefined) {
    const kdj = new StochasticOscillator({
      kPeriod: config.kdj.kPeriod,
      dPeriod: config.kdj.dPeriod,
      kSlowingPeriod: config.kdj.kSlowingPeriod,
    });
    const results = kdj.updates(candles.map((c) => ({ high: c.high, low: c.low, close: c.close })));
    const kLine: LinePoint[] = [];
    const dLine: LinePoint[] = [];
    const jLine: LinePoint[] = [];
    for (let i = 0; i < candles.length; i += 1) {
      const result = results[i];
      if (result === null || result === undefined) continue;
      const time = candles[i]!.time;
      kLine.push({ time, value: result.stochK });
      dLine.push({ time, value: result.stochD });
      jLine.push({ time, value: result.stochJ });
    }
    series.push({ id: "kdjK", type: "line", pane: "kdj", data: kLine, label: "K", options: { color: "#4a90d9", lineWidth: 1 } });
    series.push({ id: "kdjD", type: "line", pane: "kdj", data: dLine, label: "D", options: { color: "#f5a623", lineWidth: 1 } });
    series.push({ id: "kdjJ", type: "line", pane: "kdj", data: jLine, label: "J", options: { color: "#b06bd6", lineWidth: 1 } });
  }

  if (config.atr !== undefined) {
    const atr = new ATR(config.atr);
    const highs = candles.map((c) => ({ high: c.high, low: c.low, close: c.close }));
    series.push({
      id: `atr${config.atr}`,
      type: "line",
      pane: "atr",
      data: toLinePoints(candles, atr.updates(highs)),
      label: `ATR(${config.atr})`,
      options: { color: "#9aa0aa", lineWidth: 1 },
    });
  }

  return series;
}
