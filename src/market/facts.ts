/**
 * 按需取数工具的实现侧（ADR-0008）。
 *
 * 把"取已收盘 K 线 → 交给纯计算 → 组织成模型可读的响应"这一段收成一个可单测的接缝，
 * 于是 `src/index.ts` 里的工具注册只剩下参数转译。**取数一律走已收盘边界**
 * （`closedCandles.ts`），并且所有响应都自带 grounding。
 */
import { barsForInterval, intervalToMs } from "./chart";
import { partitionCandles } from "./closedCandles";
import { computeIndicatorFacts, warmupBarsFor, type IndicatorFact, type IndicatorSelector } from "./indicatorFacts";
import { computeLevelFacts, type LevelFact, type LevelKind, type LevelPivot } from "./levelFacts";
import { resolveInterval } from "./timeframe";
import { resolveSymbol } from "./symbol";
import type { MarketDataProvider } from "./types";

/** 每次响应都带的"数据有多新、用了哪些 K 线"。 */
export interface Grounding {
  lastClosedBar?: number;
  formingBars: number;
  barsUsed: number;
  closedOnly: true;
}

/** 数据不足时的统一形状：说明缺多少，而不是给一个基于不足窗口的数。 */
export interface Insufficient {
  ok: false;
  reason: "insufficient_closed_bars" | "empty_request";
  required: number;
  available: number;
  hint: string;
}

export interface IndicatorRequestInput {
  symbol: string;
  interval?: string;
  indicators: IndicatorSelector[];
}

export interface IndicatorFactsResult {
  ok: true;
  symbol: string;
  interval: string;
  grounding: Grounding;
  indicators: IndicatorFact[];
}

export type IndicatorFactsResponse = IndicatorFactsResult | Insufficient;

/** 分形枢轴要左右各 left/right 根，少于这个数不可能有枢轴。 */
const MIN_BARS_FOR_PIVOTS = 5;

interface ClockOptions {
  now?: number;
}

async function closedSeries(
  provider: MarketDataProvider,
  symbol: string,
  interval: string,
  options: ClockOptions,
): Promise<{ symbol: string; interval: string; candles: Awaited<ReturnType<MarketDataProvider["fetchCandles"]>>; grounding: Grounding }> {
  const market = resolveSymbol(symbol);
  const candles = await provider.fetchCandles(market, interval, { limit: barsForInterval(interval) });
  const closure = partitionCandles(candles, interval, options.now ?? Date.now());
  return {
    symbol: market,
    interval,
    candles: closure.closed,
    grounding: {
      ...(closure.lastClosed === undefined ? {} : { lastClosedBar: closure.lastClosed.time }),
      formingBars: closure.formingBars,
      barsUsed: closure.closed.length,
      closedOnly: true,
    },
  };
}

/** 按需算指标：只算被点名的，数据不足时明确报缺。 */
export async function requestIndicatorFacts(
  provider: MarketDataProvider,
  input: IndicatorRequestInput,
  options: ClockOptions = {},
): Promise<IndicatorFactsResponse> {
  const interval = resolveInterval(input.interval);
  if (input.indicators.length === 0) {
    return {
      ok: false,
      reason: "empty_request",
      required: 1,
      available: 0,
      hint: "至少点名一个指标，例如 [{ id: \"rsi\", period: 14 }]。",
    };
  }
  const series = await closedSeries(provider, input.symbol, interval, options);
  const required = Math.max(...input.indicators.map(warmupBarsFor));
  if (series.candles.length < required) {
    return {
      ok: false,
      reason: "insufficient_closed_bars",
      required,
      available: series.candles.length,
      hint: `已收盘 K 线不足以算出这些指标（需要 ${required} 根）。改用更长的周期，或换更短的指标参数。`,
    };
  }
  return {
    ok: true,
    symbol: series.symbol,
    interval,
    grounding: series.grounding,
    indicators: computeIndicatorFacts(series.candles, input.indicators),
  };
}

export interface LevelRequestInput {
  symbol: string;
  interval?: string;
  kinds?: LevelKind[];
  pivotOptions?: { left: number; right: number };
  tolerancePct?: number;
  maxLevels?: number;
}

export interface LevelFactsResult {
  ok: true;
  symbol: string;
  interval: string;
  grounding: Grounding;
  pivots: LevelPivot[];
  levels: LevelFact[];
  counts: Record<LevelKind, number>;
  truncated: number;
}

export type LevelFactsResponse = LevelFactsResult | Insufficient;

/** 按需算价位：容差与取舍由请求决定。 */
export async function requestLevelFacts(
  provider: MarketDataProvider,
  input: LevelRequestInput,
  options: ClockOptions = {},
): Promise<LevelFactsResponse> {
  const interval = resolveInterval(input.interval);
  const series = await closedSeries(provider, input.symbol, interval, options);
  if (series.candles.length < MIN_BARS_FOR_PIVOTS) {
    return {
      ok: false,
      reason: "insufficient_closed_bars",
      required: MIN_BARS_FOR_PIVOTS,
      available: series.candles.length,
      hint: "K 线太少，撑不起枢轴与价位判断；换成更小的周期以取得更多 K 线。",
    };
  }
  const facts = computeLevelFacts(series.candles, {
    ...(input.kinds === undefined ? {} : { kinds: input.kinds }),
    ...(input.pivotOptions === undefined ? {} : { pivotOptions: input.pivotOptions }),
    ...(input.tolerancePct === undefined ? {} : { tolerancePct: input.tolerancePct }),
    ...(input.maxLevels === undefined ? {} : { maxLevels: input.maxLevels }),
  });
  return {
    ok: true,
    symbol: series.symbol,
    interval,
    grounding: series.grounding,
    pivots: facts.pivots,
    levels: facts.levels,
    counts: facts.counts,
    truncated: facts.truncated,
  };
}

// intervalToMs 的重导出仅用于测试注入时钟时的换算便利。
export { intervalToMs };
