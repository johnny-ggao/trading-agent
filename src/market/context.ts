import { ADX, ATR, SMA } from "trading-signals";
import type { MarketContext } from "../shared/analysis";
import type { Candle } from "../shared/chartSpec";
import { movingAverageAlignment } from "./candidates";
import type { IndicatorConfig } from "./indicators";

export const DEFAULT_ADX_PERIOD = 14;

/** 状态阈值：相对自身近期水平，不按资产写死。 */
export const CONTEXT_THRESHOLDS = {
  adxTrending: 25,
  adxRanging: 20,
  volatilityHigh: 1.3,
  volatilityLow: 0.75,
  volumeHigh: 1.5,
  volumeLow: 0.7,
} as const;

function lastDefined(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value !== null && value !== undefined && Number.isFinite(value)) return value;
  }
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function stateFromRatio(ratio: number | null, high: number, low: number): "high" | "normal" | "low" {
  if (ratio === null) return "normal";
  if (ratio >= high) return "high";
  if (ratio <= low) return "low";
  return "normal";
}

const TREND_LABEL = { trending: "趋势", ranging: "震荡", transition: "过渡" } as const;
const DIRECTION_LABEL = { up: "向上", down: "向下", flat: "走平" } as const;
const VOLATILITY_LABEL = { high: "偏高", normal: "正常", low: "偏低" } as const;
const VOLUME_LABEL = { high: "放量", normal: "常态", low: "缩量" } as const;

const fixed = (value: number | null, digits = 1): string => (value === null ? "n/a" : value.toFixed(digits));

/** 人类可读的机械摘要（不是结论）。 */
export function describeMarketContext(context: Omit<MarketContext, "summary">): string {
  const parts = [
    `走势：${TREND_LABEL[context.trend.state]}（ADX ${fixed(context.trend.adx)}，+DI ${fixed(context.trend.pdi)} / -DI ${fixed(context.trend.mdi)}，方向${DIRECTION_LABEL[context.trend.direction]}）`,
    `波动：${VOLATILITY_LABEL[context.volatility.state]}（ATR ${context.volatility.atrPct === null ? "n/a" : `${(context.volatility.atrPct * 100).toFixed(2)}%`}）`,
    `量能：${VOLUME_LABEL[context.volume.state]}${context.volume.ratio === null ? "" : `（${context.volume.ratio.toFixed(2)}× 近期均量）`}`,
  ];
  if (context.maAlignment !== undefined) parts.push(`均线：${context.maAlignment.label}`);
  return parts.join("；");
}

/** 由 K 线机械计算市场状态：趋势强度/方向、波动率、量能、均线排列。 */
export function computeMarketContext(candles: Candle[], config: IndicatorConfig): MarketContext {
  const hlc = candles.map((candle) => ({ high: candle.high, low: candle.low, close: candle.close }));
  const closes = candles.map((candle) => candle.close);
  const lastClose = closes[closes.length - 1] ?? null;

  const adx = new ADX(DEFAULT_ADX_PERIOD);
  const adxValue = lastDefined(adx.updates(hlc));
  // trading-signals 的 pdi/mdi 是 (+DM/ATR) 比值，乘 100 归一到常规 DI。
  const pdi = typeof adx.pdi === "number" ? adx.pdi * 100 : null;
  const mdi = typeof adx.mdi === "number" ? adx.mdi * 100 : null;
  const trendState: MarketContext["trend"]["state"] = adxValue === null ? "transition"
    : adxValue >= CONTEXT_THRESHOLDS.adxTrending ? "trending"
      : adxValue < CONTEXT_THRESHOLDS.adxRanging ? "ranging" : "transition";
  const direction: MarketContext["trend"]["direction"] = pdi === null || mdi === null ? "flat"
    : pdi > mdi ? "up" : pdi < mdi ? "down" : "flat";

  const atrSeries = new ATR(DEFAULT_ADX_PERIOD)
    .updates(hlc)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const atr = atrSeries.length > 0 ? atrSeries[atrSeries.length - 1]! : null;
  const atrPct = atr !== null && lastClose !== null && lastClose !== 0 ? atr / lastClose : null;
  const atrBaseline = median(atrSeries.slice(-50));
  const volatilityRatio = atr !== null && atrBaseline !== null && atrBaseline > 0 ? atr / atrBaseline : null;
  const volatilityState = stateFromRatio(volatilityRatio, CONTEXT_THRESHOLDS.volatilityHigh, CONTEXT_THRESHOLDS.volatilityLow);

  const volumes = candles.map((candle) => candle.volume).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const lastVolume = volumes.length > 0 ? volumes[volumes.length - 1]! : null;
  const prior = volumes.slice(-21, -1);
  const averageVolume = prior.length > 0 ? prior.reduce((sum, value) => sum + value, 0) / prior.length : null;
  const volumeRatio = lastVolume !== null && averageVolume !== null && averageVolume > 0 ? lastVolume / averageVolume : null;
  const volumeState = stateFromRatio(volumeRatio, CONTEXT_THRESHOLDS.volumeHigh, CONTEXT_THRESHOLDS.volumeLow);

  const maValues = config.ma
    .map((period) => ({ period, value: lastDefined(new SMA(period).updates(closes)) }))
    .filter((entry): entry is { period: number; value: number } => entry.value !== null);
  const maAlignment = movingAverageAlignment(maValues);

  const base: Omit<MarketContext, "summary"> = {
    trend: { adx: adxValue, pdi, mdi, state: trendState, direction },
    volatility: { atr, atrPct, state: volatilityState },
    volume: { ratio: volumeRatio, state: volumeState },
    ...(maAlignment === undefined ? {} : { maAlignment }),
  };
  return { ...base, summary: describeMarketContext(base) };
}
