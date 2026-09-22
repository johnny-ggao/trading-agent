/**
 * 指标清单：**唯一来源**。
 *
 * 加一个指标以前要改三处（计算 switch、`warmupBarsFor` switch、解析器的 arity 分支，
 * 默认值还在三处各写一遍），漏一处不会有编译错误——只会在模型请求它时炸掉或静默算错。
 * 现在只改这里：参数规格、预热期、取值实现、常用档位都在一条 entry 里，
 * 解析器（`indicatorSpec.ts`）与计算/预热（`indicatorFacts.ts`）都从它推导。
 *
 * 领域词见 CONTEXT.md 的「指标」。
 */
import { ADX, ATR, BollingerBands, EMA, MACD, MFI, OBV, RSI, SMA, SuperTrend, VWMA } from "trading-signals";
import type { Candle } from "../shared/chartSpec";

/** 参数的规格：有 `default` 即可省略，否则必填；`integer` 表示必须为正整数（周期类）。 */
export interface ParamSpec {
  default?: number;
  integer?: boolean;
}

/** 一条指标的定义。 */
export interface IndicatorDef {
  /** 参数名 → 规格。顺序即示例写法里的顺序。 */
  params: Record<string, ParamSpec>;
  /**
   * 常用档位：既用于生成示例写法（`canonicalSpec`），也是给 agent 的参数建议。
   * 必填参数必须在这里给出一个档位。
   */
  presets: Record<string, number>;
  /** 算出第一个可用值需要多少根 K 线（由参数推导）。 */
  warmup: (params: Record<string, number>) => number;
  /** 计算序列：与 K 线等长，预热期为 null。 */
  compute: (candles: Candle[], params: Record<string, number>) => Array<number | null>;
}

const closes = (candles: Candle[]): number[] => candles.map((candle) => candle.close);
const hlc = (candles: Candle[]): Array<{ high: number; low: number; close: number }> =>
  candles.map((candle) => ({ high: candle.high, low: candle.low, close: candle.close }));
const hlcv = (candles: Candle[]): Array<{ high: number; low: number; close: number; volume: number }> =>
  candles.map((candle) => ({ high: candle.high, low: candle.low, close: candle.close, volume: candle.volume ?? 0 }));
const ohlcv = (candles: Candle[]): Array<{ open: number; high: number; low: number; close: number; volume: number }> =>
  candles.map((candle) => ({
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));

/** 单周期参数的常见形状。 */
function periodOnly(preset: number): IndicatorDef {
  return {
    params: { period: { integer: true } },
    presets: { period: preset },
    warmup: (params) => params.period!,
    compute: (candles, params) => new SMA(params.period!).updates(closes(candles)),
  };
}

/** 布林带三轨共用同一实现，只是取不同的一条。 */
function bollingerBand(pick: "upper" | "middle" | "lower"): IndicatorDef {
  return {
    params: { period: { default: 20, integer: true }, deviation: { default: 2 } },
    presets: { period: 20, deviation: 2 },
    warmup: (params) => params.period!,
    compute: (candles, params) =>
      new BollingerBands(params.period!, params.deviation!)
        .updates(closes(candles))
        .map((result) => (result === null ? null : result[pick])),
  };
}

export const INDICATOR_CATALOG = {
  ma: {
    params: { period: { integer: true } },
    presets: { period: 50 },
    warmup: (params) => params.period!,
    compute: (candles, params) => new SMA(params.period!).updates(closes(candles)),
  },
  ema: (() => {
    const def = periodOnly(20);
    return { ...def, compute: (candles, params) => new EMA(params.period!).updates(closes(candles)) };
  })(),
  rsi: (() => {
    const def = periodOnly(14);
    return { ...def, compute: (candles, params) => new RSI(params.period!).updates(closes(candles)) };
  })(),
  atr: (() => {
    const def = periodOnly(14);
    return { ...def, compute: (candles, params) => new ATR(params.period!).updates(hlc(candles)) };
  })(),
  vwma: (() => {
    const def = periodOnly(20);
    return { ...def, compute: (candles, params) => new VWMA(params.period!).updates(hlcv(candles)) };
  })(),
  mfi: (() => {
    const def = periodOnly(14);
    return { ...def, compute: (candles, params) => new MFI(params.period!).updates(hlcv(candles)) };
  })(),
  adx: (() => {
    const def = periodOnly(14);
    return { ...def, compute: (candles, params) => new ADX(params.period!).updates(hlc(candles)) };
  })(),
  obv: {
    params: {},
    presets: {},
    // OBV 的构造参数是"最早可从第几根开始出值"，取 2：首根只建立基准（interval=1 会抛错）。
    warmup: () => 2,
    compute: (candles) => new OBV(2).updates(ohlcv(candles)),
  },
  bollinger: bollingerBand("middle"),
  bollingerUpper: bollingerBand("upper"),
  bollingerLower: bollingerBand("lower"),
  supertrend: {
    params: { period: { default: 10, integer: true }, multiplier: { default: 3 } },
    presets: { period: 10, multiplier: 3 },
    // ATR 预热之后再叠一段，保守取 2×周期。
    warmup: (params) => params.period! * 2,
    compute: (candles, params) =>
      new SuperTrend({ interval: params.period!, multiplier: params.multiplier! })
        .updates(hlc(candles))
        .map((result) => (result === null ? null : result.supertrend)),
  },
  macd: {
    params: {
      fast: { default: 12, integer: true },
      slow: { default: 26, integer: true },
      signal: { default: 9, integer: true },
    },
    presets: { fast: 12, slow: 26, signal: 9 },
    warmup: (params) => params.fast! + params.slow! + params.signal!,
    compute: (candles, params) =>
      new MACD(new EMA(params.fast!), new EMA(params.slow!), new EMA(params.signal!))
        .updates(closes(candles))
        .map((result) => (result === null ? null : result.macd)),
  },
} satisfies Record<string, IndicatorDef>;

export type IndicatorId = keyof typeof INDICATOR_CATALOG;

/** 该指标的参数名（声明顺序）。 */
export function paramNamesOf(id: IndicatorId): string[] {
  return Object.keys(defOf(id).params);
}

/** 该指标各参数的规格（解析器据此校验，不再手写 arity 分支）。 */
export function paramSpecsOf(id: IndicatorId): Record<string, ParamSpec> {
  return defOf(id).params;
}

/** 按名字（大小写不敏感）解析 id；未知则 undefined。 */
export function resolveIndicatorId(name: string): IndicatorId | undefined {
  const wanted = name.trim().toLowerCase();
  const found = (Object.keys(INDICATOR_CATALOG) as IndicatorId[])
    .find((id) => id.toLowerCase() === wanted);
  return found;
}

/** 归一化参数：缺省值补上、必填缺档位时用档位值。 */
export function defaultsOf(id: IndicatorId): Record<string, number> {
  const def = defOf(id);
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(def.params)) {
    const value = spec.default ?? def.presets[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** 生成示例写法（`"ma:50"` / `"macd:12/26/9"` / `"obv"`），也供引导词引用。 */
export function canonicalSpec(id: IndicatorId): string {
  const values = paramNamesOf(id).map((name) => defaultsOf(id)[name]).filter((value) => value !== undefined);
  return values.length === 0 ? id : `${id}:${values.join("/")}`;
}

/** 预热根数（由清单推导）。 */
export function warmupOf(id: IndicatorId, params: Record<string, number>): number {
  return defOf(id).warmup(params);
}

/** 计算序列（由清单推导）。 */
export function computeSeriesOf(
  id: IndicatorId,
  candles: Candle[],
  params: Record<string, number>,
): Array<number | null> {
  return defOf(id).compute(candles, params);
}

/**
 * 取某条定义（收窄成通用的 `IndicatorDef`）。
 *
 * 清单用 `satisfies` 保留了每个 id 的**字面量**类型（供类型级一致性断言使用），
 * 因此遍历参数时需要在这里收窄一次，否则 `params` 在联合上无法索引。
 */
function defOf(id: IndicatorId): IndicatorDef {
  return INDICATOR_CATALOG[id] as IndicatorDef;
}