/**
 * 按需指标计算：**只算被点名的那些**（ADR-0008）。
 *
 * 这里是"怎么算"的实现侧——公式、预热期、对齐全部由代码负责；"这次算什么"由
 * 调用方（agent 经 `trading_indicator`）决定。纯函数，无 I/O，只在**已收盘** K 线上调用。
 *
 * 传进来的 K 线序列必须已按收盘边界切过（见 `closedCandles.ts`）：这里不做时间判断，
 * 因为"哪根算收盘"是调用方的知识，不是指标公式的知识。
 */
import { ADX, ATR, BollingerBands, EMA, MACD, MFI, OBV, RSI, SMA, SuperTrend, VWMA } from "trading-signals";
import type { Candle } from "../shared/chartSpec";

/** 一次指标请求：id + 参数。 */
export type IndicatorSelector =
  | { id: "ma"; period: number }
  | { id: "ema"; period: number }
  | { id: "rsi"; period: number }
  | { id: "atr"; period: number }
  | { id: "vwma"; period: number }
  | { id: "mfi"; period: number }
  | { id: "adx"; period: number }
  | { id: "obv" }
  | { id: "bollinger"; period?: number; deviation?: number }
  | { id: "bollingerUpper"; period?: number; deviation?: number }
  | { id: "bollingerLower"; period?: number; deviation?: number }
  | { id: "supertrend"; period?: number; multiplier?: number }
  | { id: "macd"; fast?: number; slow?: number; signal?: number };

/** 单个指标的计算结果：自描述，便于模型判断这个数能不能用。 */
export interface IndicatorFact {
  id: string;
  /** 归一化后的参数（含缺省值），模型据此核对它拿到的是不是它要的。 */
  params: Record<string, number>;
  /** 算出第一个可用值需要多少根 K 线。 */
  warmupBars: number;
  latest: { time: number; value: number };
}

/** 该指标需要多少根 K 线才有第一个值。 */
export function warmupBarsFor(selector: IndicatorSelector): number {
  switch (selector.id) {
    case "ma":
    case "ema":
    case "rsi":
    case "atr":
    case "vwma":
    case "mfi":
    case "adx":
      return selector.period;
    case "obv":
      return 2;
    case "bollinger":
    case "bollingerUpper":
    case "bollingerLower":
      return selector.period ?? 20;
    case "supertrend":
      // SuperTrend 需要 ATR 预热再叠一段，保守取 2×周期。
      return (selector.period ?? 10) * 2;
    case "macd": {
      const fast = selector.fast ?? 12;
      const slow = selector.slow ?? 26;
      const signal = selector.signal ?? 9;
      return fast + slow + signal;
    }
  }
}

/** 请求参数归一化后回显给模型（缺省值也写出来）。 */
function paramsOf(selector: IndicatorSelector): Record<string, number> {
  switch (selector.id) {
    case "ma":
    case "ema":
    case "rsi":
    case "atr":
    case "vwma":
    case "mfi":
    case "adx":
      return { period: selector.period };
    case "obv":
      return {};
    case "bollinger":
    case "bollingerUpper":
    case "bollingerLower":
      return { period: selector.period ?? 20, deviation: selector.deviation ?? 2 };
    case "supertrend":
      return { period: selector.period ?? 10, multiplier: selector.multiplier ?? 3 };
    case "macd":
      return { fast: selector.fast ?? 12, slow: selector.slow ?? 26, signal: selector.signal ?? 9 };
  }
}

/** 把指标输出序列（对齐到每根 K 线）取出最后一根的值。 */
function takeLatest(
  candles: Candle[],
  values: ReadonlyArray<number | null>,
  selector: IndicatorSelector,
): { time: number; value: number } {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      return { time: candles[i]!.time, value };
    }
  }
  throw new Error(
    `insufficient bars for ${selector.id}: needs ${warmupBarsFor(selector)}, got ${candles.length}`,
  );
}

/** 按请求逐项计算，返回等长的事实列表（顺序与请求一致）。 */
export function computeIndicatorFacts(
  candles: Candle[],
  selectors: IndicatorSelector[],
): IndicatorFact[] {
  const closes = candles.map((candle) => candle.close);
  return selectors.map((selector) => {
    const latest = latestFor(candles, closes, selector);
    return {
      id: selector.id,
      params: paramsOf(selector),
      warmupBars: warmupBarsFor(selector),
      latest,
    };
  });
}

/** OBV 要 open/high/low/close/volume 五件套。 */
function ohlcv(candles: Candle[]): Array<{ open: number; high: number; low: number; close: number; volume: number }> {
  return candles.map((candle) => ({
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));
}

/** trading-signals 的部分指标要 high/low/close/volume。 */
function hlcv(candles: Candle[]): Array<{ high: number; low: number; close: number; volume: number }> {
  return candles.map((candle) => ({
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));
}

/** trading-signals 的部分指标只吃 high/low/close。 */
function hlc(candles: Candle[]): Array<{ high: number; low: number; close: number }> {
  return candles.map((candle) => ({ high: candle.high, low: candle.low, close: candle.close }));
}

/** 单个指标的最后一根值。 */
function latestFor(candles: Candle[], closes: number[], selector: IndicatorSelector): { time: number; value: number } {
  switch (selector.id) {
    case "ma":
      return takeLatest(candles, new SMA(selector.period).updates(closes), selector);
    case "ema":
      return takeLatest(candles, new EMA(selector.period).updates(closes), selector);
    case "rsi":
      return takeLatest(candles, new RSI(selector.period).updates(closes), selector);
    case "atr":
      return takeLatest(candles, new ATR(selector.period).updates(hlc(candles)), selector);
    case "vwma":
      return takeLatest(candles, new VWMA(selector.period).updates(hlcv(candles)), selector);
    case "mfi":
      return takeLatest(candles, new MFI(selector.period).updates(hlcv(candles)), selector);
    case "adx":
      return takeLatest(candles, new ADX(selector.period).updates(hlc(candles)), selector);
    case "obv":
      // OBV 的构造参数是"最早可从第几根开始出值"，取 2：首根只建立基准（interval=1 会抛错）。
      return takeLatest(candles, new OBV(2).updates(ohlcv(candles)), selector);
    case "bollinger":
    case "bollingerUpper":
    case "bollingerLower": {
      const bb = new BollingerBands(selector.period ?? 20, selector.deviation ?? 2);
      const pick = selector.id === "bollingerUpper" ? "upper" : selector.id === "bollingerLower" ? "lower" : "middle";
      const values = bb.updates(closes).map((result) => (result === null ? null : result[pick]));
      return takeLatest(candles, values, selector);
    }
    case "supertrend": {
      const st = new SuperTrend({ interval: selector.period ?? 10, multiplier: selector.multiplier ?? 3 });
      const values = st.updates(hlc(candles)).map((result) => (result === null ? null : result.supertrend));
      return takeLatest(candles, values, selector);
    }
    case "macd": {
      const macd = new MACD(
        new EMA(selector.fast ?? 12),
        new EMA(selector.slow ?? 26),
        new EMA(selector.signal ?? 9),
      );
      // MACD 的主线（DIF）即快慢 EMA 之差。
      const values = macd.updates(closes).map((result) => (result === null ? null : result.macd));
      return takeLatest(candles, values, selector);
    }
  }
}
