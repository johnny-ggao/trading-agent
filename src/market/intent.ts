import { DEFAULT_BAR_POLICY } from "./chart";
import type { ChartLevelOptions } from "./presentation";
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
  /** 图上每侧最多画几条支撑/阻力；缺省用 presentation 的默认值（3）。 */
  levelsPerSide?: number;
  /** 图上画哪几类价位（support/resistance/fib）；缺省只画支撑阻力。 */
  levelKinds?: string[];
}

export interface ResolvedChartRequest {
  symbol: string;
  interval: Interval;
  indicators: IndicatorConfig;
  /** 交给 presentation 的图面价位选项；缺省为空对象（用它自己的默认值）。 */
  levelOptions: ChartLevelOptions;
}

/**
 * 出图入参不合法时抛出：消息里必须点名字段与期望，模型据此自我纠正。
 *
 * 校验集中在解析边界（`resolveChartRequest`）——`trading-signals` 对非法周期**不抛错**
 * （`SMA(0)` 静默产出 0、`SMA(-5)` 产出 null），所以边界是唯一能拦住它的地方。
 */
export class InvalidChartArgsError extends Error {
  readonly field: string;

  constructor(field: string, expectation: string, got: unknown) {
    super(`${field} ${expectation}，收到 ${JSON.stringify(got)}`);
    this.name = "InvalidChartArgsError";
    this.field = field;
  }
}

/** 周期必须是正整数，且不超过单次取数上限（否则根本取不到）。 */
function assertPeriod(field: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidChartArgsError(field, "必须是正整数（周期根数）", value);
  }
  if (value > DEFAULT_BAR_POLICY.maxBars) {
    throw new InvalidChartArgsError(field, `不能超过单次取数上限 ${DEFAULT_BAR_POLICY.maxBars}`, value);
  }
}

/** 图面每侧价位条数的上限：再多就糊成一片，明确回绝好过画一团线。 */
export const MAX_LEVELS_PER_SIDE_LIMIT = 10;

/** 可画的价位类别。 */
const LEVEL_KINDS = ["support", "resistance", "fib"] as const;

/** 校验出图入参；不合法即抛错。 */
export function validateChartArgs(request: ChartRequest): void {
  if (request.levelsPerSide !== undefined) {
    if (!Number.isInteger(request.levelsPerSide) || request.levelsPerSide < 1) {
      throw new InvalidChartArgsError("levelsPerSide", "必须是正整数（每侧画几条）", request.levelsPerSide);
    }
    if (request.levelsPerSide > MAX_LEVELS_PER_SIDE_LIMIT) {
      throw new InvalidChartArgsError("levelsPerSide", `不能超过 ${MAX_LEVELS_PER_SIDE_LIMIT}`, request.levelsPerSide);
    }
  }
  if (request.levelKinds !== undefined) {
    if (request.levelKinds.length === 0) {
      throw new InvalidChartArgsError("levelKinds", "不能是空数组；要默认的支撑阻力就别传这个字段", request.levelKinds);
    }
    for (const kind of request.levelKinds) {
      if (!(LEVEL_KINDS as readonly string[]).includes(kind)) {
        throw new InvalidChartArgsError("levelKinds", `只接受 ${LEVEL_KINDS.join(" / ")}`, kind);
      }
    }
  }
  if (request.ma !== undefined) {
    if (request.ma.length === 0) {
      throw new InvalidChartArgsError("ma", "不能是空数组；要覆盖就给具体周期，或干脆不传", request.ma);
    }
    for (const period of request.ma) assertPeriod("ma", period);
  }
  if (request.rsi !== undefined) assertPeriod("rsi", request.rsi);
}

/** 默认填充：符号、周期（含时间词）、指标参数（含可选开关）。 */
export function resolveChartRequest(request: ChartRequest = {}): ResolvedChartRequest {
  validateChartArgs(request);
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
  const levelOptions: ChartLevelOptions = {
    ...(request.levelsPerSide === undefined ? {} : { perSide: request.levelsPerSide }),
    ...(request.levelKinds === undefined ? {} : { kinds: request.levelKinds as ChartLevelOptions["kinds"] }),
  };
  return { symbol, interval, indicators, levelOptions };
}

/** 人类可读的指标清单，用于回答里声明"用了什么"。 */
export function describeIndicators(config: IndicatorConfig): string {
  const parts = [
    `MA${config.ma.join("/")}`,
    "成交量",
    `MACD(${config.macd.fast},${config.macd.slow},${config.macd.signal})`,
  ];
  if (config.rsi !== undefined) parts.push(`RSI(${config.rsi})`);
  if (config.bollinger !== undefined) parts.push(`BOLL(${config.bollinger.period},${config.bollinger.deviation})`);
  if (config.kdj !== undefined) parts.push(`KDJ(${config.kdj.kPeriod},${config.kdj.dPeriod},${config.kdj.kSlowingPeriod})`);
  if (config.atr !== undefined) parts.push(`ATR(${config.atr})`);
  return parts.join("、");
}
