/**
 * 按需指标计算：**只算被点名的那些**（ADR-0008）。
 *
 * 这里是"怎么算"的调用侧——公式、预热期、参数缺省都在 `indicatorCatalog.ts` 的**唯一清单**里；
 * 本模块只负责：把选择器归一化成参数、按清单算序列、取最后一根已收盘的值。
 *
 * 传进来的 K 线序列必须已按收盘边界切过（见 `closedCandles.ts`）。
 */
import type { Candle } from "../shared/chartSpec";
import {
  computeSeriesOf,
  defaultsOf,
  INDICATOR_CATALOG,
  type IndicatorId,
  warmupOf,
} from "./indicatorCatalog";

/**
 * 各 id 的参数形状（**显式的类型面**）。
 *
 * 行为（预热期、公式、缺省值）来自清单；这里只声明"哪些参数必填、哪些可省"。
 * 下面那条类型级断言保证本表与清单的 id 集合**完全一致**——往任一侧加指标而忘了另一侧会编译失败。
 */
interface SelectorMap {
  ma: { period: number };
  ema: { period: number };
  rsi: { period: number };
  atr: { period: number };
  vwma: { period: number };
  mfi: { period: number };
  adx: { period: number };
  /** obv 不接受参数。 */
  obv: unknown;
  bollinger: { period?: number; deviation?: number };
  bollingerUpper: { period?: number; deviation?: number };
  bollingerLower: { period?: number; deviation?: number };
  supertrend: { period?: number; multiplier?: number };
  macd: { fast?: number; slow?: number; signal?: number };
}

type Assert<T extends true> = T;
/** 类型级一致性：本表与清单的 id 集合必须相同。若不同，这里的类型不满足 true 而编译失败。 */
type _SelectorMapMatchesCatalog = Assert<
  [keyof SelectorMap] extends [IndicatorId]
    ? ([IndicatorId] extends [keyof SelectorMap] ? true : false)
    : false
>;

/** 一次指标请求：id + 参数（参数规格与清单一致，见上方断言）。 */
export type IndicatorSelector = { [K in keyof SelectorMap]: { id: K } & SelectorMap[K] }[keyof SelectorMap];

/** 单个指标的计算结果：自描述，便于模型判断这个数能不能用。 */
export interface IndicatorFact {
  id: string;
  /** 归一化后的参数（含缺省值），模型据此核对它拿到的是不是它要的。 */
  params: Record<string, number>;
  /** 算出第一个可用值需要多少根 K 线。 */
  warmupBars: number;
  latest: { time: number; value: number };
}

/** 把选择器归一化成清单声明的参数（补上缺省值，丢掉无关字段）。 */
export function normalizeParams(selector: IndicatorSelector): Record<string, number> {
  const raw = selector as unknown as Record<string, number>;
  const out: Record<string, number> = {};
  for (const name of Object.keys(INDICATOR_CATALOG[selector.id].params)) {
    const value = raw[name] ?? defaultsOf(selector.id)[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** 该指标需要多少根 K 线才有第一个值（由清单推导）。 */
export function warmupBarsFor(selector: IndicatorSelector): number {
  return warmupOf(selector.id, normalizeParams(selector));
}

/** 从序列末尾取第一个有限值。 */
function takeLatest(
  candles: Candle[],
  values: ReadonlyArray<number | null>,
  selector: IndicatorSelector,
  warmupBars: number,
): { time: number; value: number } {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      return { time: candles[i]!.time, value };
    }
  }
  throw new Error(
    `insufficient bars for ${selector.id}: needs ${warmupBars}, got ${candles.length}`,
  );
}

/** 按请求逐项计算，返回等长的事实列表（顺序与请求一致）。 */
export function computeIndicatorFacts(
  candles: Candle[],
  selectors: IndicatorSelector[],
): IndicatorFact[] {
  return selectors.map((selector) => {
    const params = normalizeParams(selector);
    const warmupBars = warmupOf(selector.id, params);
    const series = computeSeriesOf(selector.id, candles, params);
    return {
      id: selector.id,
      params,
      warmupBars,
      latest: takeLatest(candles, series, selector, warmupBars),
    };
  });
}
