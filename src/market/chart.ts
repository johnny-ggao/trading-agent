import type { Candle, ChartSpec, PaneSpec, SeriesSpec } from "../shared/chartSpec";
import { computeIndicators, DEFAULT_INDICATORS, type IndicatorConfig } from "./indicators";

/**
 * 取数能力的**语义表述**：先说覆盖多长时间，根数只作附带。
 *
 * agent 的问题是"今天 / 这周 / 这月"，单位是时间；根数是实现细节。让上限以时间为单位
 * 出现，agent 才能直接判断"我想要的历史在这个周期上拿不拿得到"。
 */
export function describeFetchCoverage(bars: number, interval: string): string {
  return `覆盖约 ${describeSpanWithoutApprox(bars, interval)}（${bars} 根）`;
}

/** 默认周期集合（工单 04 会做时间词映射）。 */
export const DEFAULT_TIMEFRAMES = ["15m", "1h", "4h", "1d"];

const INTERVAL_UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** 把周期串（如 15m/1h/4h/1d）转成毫秒。 */
export function intervalToMs(interval: string): number {
  const match = /^(\d+)([mhdw])$/.exec(interval.trim());
  if (match === null) throw new Error(`unsupported interval: ${interval}`);
  return Number(match[1]) * (INTERVAL_UNITS[match[2]!] ?? 0);
}

/** 指标所需的最短预热根数——由指标参数推导，不写死。 */
export function requiredWarmupBars(config: IndicatorConfig = DEFAULT_INDICATORS): number {
  const maMax = config.ma.length > 0 ? Math.max(...config.ma) : 0;
  const macdWarmup = config.macd.fast + config.macd.slow + config.macd.signal;
  const bollingerWarmup = config.bollinger?.period ?? 0;
  const kdjWarmup = config.kdj === undefined
    ? 0
    : config.kdj.kPeriod + config.kdj.kSlowingPeriod + config.kdj.dPeriod;
  const atrWarmup = config.atr ?? 0;
  return Math.max(maMax, config.rsi ?? 0, macdWarmup, bollingerWarmup, kdjWarmup, atrWarmup);
}

/**
 * 把根数按周期换算成可读跨度（向 agent 说明"这道上限相当于多长历史"）。
 * 不足一天时回小时，避免四舍五入成 "0 天"。
 */
export function describeBarsSpan(bars: number, interval: string): string {
  const hours = (bars * intervalToMs(interval)) / 3_600_000;
  if (hours < 24) {
    const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
    return `约 ${rounded} 小时`;
  }
  return `约 ${Math.round(hours / 24)} 天`;
}

/** "约 42 天" / "约 23 小时" —— 去掉 "约 " 前缀，供拼接使用。 */
function describeSpanWithoutApprox(bars: number, interval: string): string {
  return describeBarsSpan(bars, interval).replace(/^约 /, "");
}

/** 取根数的策略：只有这三个旋钮，根数是算出来的。 */
export interface BarPolicy {
  /** 目标回看时长（毫秒）：周期越短，同样时长对应的根数越多。 */
  lookbackMs: number;
  /** 指标预热期之外再多留的上下文根数。 */
  minContextBars: number;
  /** 单次分析请求的上限。 */
  maxBars: number;
}

export const DEFAULT_BAR_POLICY: BarPolicy = {
  lookbackMs: 30 * 24 * 60 * 60 * 1000,
  minContextBars: 100,
  maxBars: 1000,
};

/**
 * 由周期 + 指标预热期推导应取多少根 K 线：
 * 先按目标回看时长算，再抬到预热下限，最后压到上限。
 */
export function barsForInterval(
  interval: string,
  config: IndicatorConfig = DEFAULT_INDICATORS,
  policy: BarPolicy = DEFAULT_BAR_POLICY,
): number {
  const byLookback = Math.ceil(policy.lookbackMs / intervalToMs(interval));
  const floor = requiredWarmupBars(config) + policy.minContextBars;
  return Math.min(Math.max(byLookback, floor), policy.maxBars);
}

/**
 * 由 K 线 + 默认指标构造可渲染的 chartSpec。
 *
 * `formingBars` 是尾部形成中（未收盘）K 线的根数，由调用方按收盘边界算出
 * （见 `closedCandles.ts`）；这里只如实把它写进契约，供客户端换用弱化样式。
 */
export function buildChartSpec(
  symbol: string,
  interval: string,
  candles: Candle[],
  config: IndicatorConfig = DEFAULT_INDICATORS,
  formingBars = 0,
): ChartSpec {
  const panes: PaneSpec[] = [
    { id: "price", title: "价格" },
    ...(config.volume ? [{ id: "volume", title: "成交量" }] : []),
    { id: "macd", title: "MACD" },
    ...(config.rsi !== undefined ? [{ id: "rsi", title: `RSI ${config.rsi}` }] : []),
    ...(config.kdj !== undefined ? [{ id: "kdj", title: "KDJ" }] : []),
    ...(config.atr !== undefined ? [{ id: "atr", title: `ATR ${config.atr}` }] : []),
  ];
  const series: SeriesSpec[] = [
    { id: "candles", type: "candlestick", pane: "price", data: candles },
    ...computeIndicators(candles, config),
  ];
  return {
    symbol,
    interval,
    timeframes: DEFAULT_TIMEFRAMES,
    panes,
    series,
    formingBars,
    controls: {
      ma: [...config.ma],
      rsi: config.rsi ?? null,
      bollinger: config.bollinger !== undefined,
      kdj: config.kdj !== undefined,
      atr: config.atr !== undefined,
    },
  };
}
