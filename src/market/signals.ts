import type { RuleSignal, RuleSignalKind } from "../shared/analysis";
import type { Candle, ChartMarker, LinePoint } from "../shared/chartSpec";

/** 规则信号看多/看空在图上用的颜色（实色，markers 不支持半透明）。 */
export const SIGNAL_UP_COLOR = "#26a69a";
export const SIGNAL_DOWN_COLOR = "#ef5350";

export interface SignalInputs {
  /** 短/长均线（按时间对齐）。 */
  ma?: { short: LinePoint[]; long: LinePoint[] };
  macd?: { dif: LinePoint[]; dea: LinePoint[] };
  rsi?: LinePoint[];
  /** 突破回看的根数（不含最后一根）；默认 20。 */
  breakoutLookback?: number;
}

export interface CrossSignal {
  time: number;
  value: number;
  direction: "bullish" | "bearish";
}

export interface BreakoutSignal {
  time: number;
  price: number;
  direction: "bullish" | "bearish";
}

/** 取窗口内最近一次快慢线交叉；没有交叉返回 undefined。 */
export function latestCross(fast: LinePoint[], slow: LinePoint[]): CrossSignal | undefined {
  const slowByTime = new Map(slow.map((point) => [point.time, point.value]));
  const pairs: Array<{ time: number; fast: number; slow: number }> = [];
  for (const point of fast) {
    const slowValue = slowByTime.get(point.time);
    if (slowValue !== undefined) pairs.push({ time: point.time, fast: point.value, slow: slowValue });
  }
  for (let i = pairs.length - 1; i >= 1; i -= 1) {
    const previous = pairs[i - 1]!;
    const current = pairs[i]!;
    const previousDiff = previous.fast - previous.slow;
    const currentDiff = current.fast - current.slow;
    if (previousDiff === 0) continue;
    if (Math.sign(previousDiff) !== Math.sign(currentDiff)) {
      return { time: current.time, value: current.fast, direction: currentDiff > 0 ? "bullish" : "bearish" };
    }
  }
  return undefined;
}

/** 取窗口内最近一次 RSI 超买（>=70）或超卖（<=30）。 */
export function latestRsiExtreme(rsi: LinePoint[]): { time: number; value: number; kind: "rsi-overbought" | "rsi-oversold" } | undefined {
  for (let i = rsi.length - 1; i >= 0; i -= 1) {
    const point = rsi[i]!;
    if (point.value >= 70) return { time: point.time, value: point.value, kind: "rsi-overbought" };
    if (point.value <= 30) return { time: point.time, value: point.value, kind: "rsi-oversold" };
  }
  return undefined;
}

/** 现价相对前 lookback 根（不含最后一根）区间的突破。 */
export function latestBreakout(candles: Candle[], lookback: number): BreakoutSignal | undefined {
  if (candles.length < 2) return undefined;
  const last = candles[candles.length - 1]!;
  const start = Math.max(0, candles.length - 1 - lookback);
  const prior = candles.slice(start, candles.length - 1);
  if (prior.length === 0) return undefined;
  const priorHigh = Math.max(...prior.map((candle) => candle.high));
  const priorLow = Math.min(...prior.map((candle) => candle.low));
  if (last.close > priorHigh) return { time: last.time, price: last.close, direction: "bullish" };
  if (last.close < priorLow) return { time: last.time, price: last.close, direction: "bearish" };
  return undefined;
}

/** 机械规则信号：均线/MACD 交叉、RSI 超买超卖、区间突破（按时间排序）。 */
export function computeRuleSignals(candles: Candle[], inputs: SignalInputs = {}): RuleSignal[] {
  const signals: RuleSignal[] = [];

  if (inputs.ma !== undefined) {
    const cross = latestCross(inputs.ma.short, inputs.ma.long);
    if (cross !== undefined) {
      signals.push({
        kind: "ma-cross",
        time: cross.time,
        price: cross.value,
        direction: cross.direction,
        label: cross.direction === "bullish" ? "MA 金叉" : "MA 死叉",
      });
    }
  }

  if (inputs.macd !== undefined) {
    const cross = latestCross(inputs.macd.dif, inputs.macd.dea);
    if (cross !== undefined) {
      signals.push({
        kind: "macd-cross",
        time: cross.time,
        price: cross.value,
        direction: cross.direction,
        label: cross.direction === "bullish" ? "MACD 金叉" : "MACD 死叉",
      });
    }
  }

  if (inputs.rsi !== undefined) {
    const extreme = latestRsiExtreme(inputs.rsi);
    if (extreme !== undefined) {
      signals.push({
        kind: extreme.kind,
        time: extreme.time,
        price: extreme.value,
        direction: extreme.kind === "rsi-overbought" ? "bearish" : "bullish",
        label: extreme.kind === "rsi-overbought" ? "RSI 超买" : "RSI 超卖",
      });
    }
  }

  const breakout = latestBreakout(candles, inputs.breakoutLookback ?? 20);
  if (breakout !== undefined) {
    const kind: RuleSignalKind = breakout.direction === "bullish" ? "breakout-high" : "breakout-low";
    signals.push({
      kind,
      time: breakout.time,
      price: breakout.price,
      direction: breakout.direction,
      label: breakout.direction === "bullish" ? "突破前高" : "跌破前低",
    });
  }

  return signals.sort((a, b) => a.time - b.time);
}

/** 规则信号 → 图上标记：看多下方箭头、看空上方箭头，超买超卖用圆点。 */
export function signalsToMarkers(signals: RuleSignal[]): ChartMarker[] {
  return signals.map((signal) => {
    const bullish = signal.direction === "bullish";
    const color = bullish ? SIGNAL_UP_COLOR : SIGNAL_DOWN_COLOR;
    const position = bullish ? "belowBar" : "aboveBar";
    if (signal.kind === "rsi-overbought" || signal.kind === "rsi-oversold") {
      return { time: signal.time, position, shape: "circle", color, text: signal.label } satisfies ChartMarker;
    }
    return {
      time: signal.time,
      position,
      shape: bullish ? "arrowUp" : "arrowDown",
      color,
      text: signal.label,
    } satisfies ChartMarker;
  });
}
