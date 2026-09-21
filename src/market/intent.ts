import { DEFAULT_INDICATORS, type IndicatorConfig } from "./indicators";
import { resolveInterval, type Interval } from "./timeframe";

export interface ChartRequest {
  symbol?: string;
  timeframe?: string;
  ma?: number[];
  rsi?: number;
  bollinger?: boolean;
  kdj?: boolean;
  atr?: boolean;
}

export interface ResolvedChartRequest {
  symbol: string;
  interval: Interval;
  indicators: IndicatorConfig;
}

/** 默认填充：符号、周期（含时间词）、指标参数（含可选开关）。 */
export function resolveChartRequest(request: ChartRequest = {}): ResolvedChartRequest {
  const symbol = request.symbol !== undefined && request.symbol.trim() !== ""
    ? request.symbol.trim()
    : "BTC";
  const interval = resolveInterval(request.timeframe);
  const indicators: IndicatorConfig = { ...DEFAULT_INDICATORS };
  if (request.ma !== undefined && request.ma.length > 0) indicators.ma = [...request.ma];
  if (request.rsi !== undefined) indicators.rsi = request.rsi;
  if (request.bollinger === true) indicators.bollinger = { period: 20, deviation: 2 };
  if (request.kdj === true) indicators.kdj = { kPeriod: 9, dPeriod: 3, kSlowingPeriod: 3 };
  if (request.atr === true) indicators.atr = 14;
  return { symbol, interval, indicators };
}

/** 人类可读的指标清单，用于回答里声明"用了什么"。 */
export function describeIndicators(config: IndicatorConfig): string {
  const parts = [
    `MA${config.ma.join("/")}`,
    "成交量",
    `MACD(${config.macd.fast},${config.macd.slow},${config.macd.signal})`,
    `RSI(${config.rsi})`,
  ];
  if (config.bollinger !== undefined) parts.push(`BOLL(${config.bollinger.period},${config.bollinger.deviation})`);
  if (config.kdj !== undefined) parts.push(`KDJ(${config.kdj.kPeriod},${config.kdj.dPeriod},${config.kdj.kSlowingPeriod})`);
  if (config.atr !== undefined) parts.push(`ATR(${config.atr})`);
  return parts.join("、");
}
