import { describe, it, expect } from "vitest";
import { computeRuleSignals, latestBreakout, latestCross, latestRsiExtreme, signalsToMarkers } from "./signals";
import type { Candle, LinePoint } from "../shared/chartSpec";

const line = (values: number[]): LinePoint[] => values.map((value, time) => ({ time, value }));

describe("交叉：取窗口内最近一次", () => {
  it("快线由下穿上为金叉", () => {
    const cross = latestCross(line([1, 1.5, 2.5, 3, 3.5]), line([2, 2, 2, 2, 2]));
    expect(cross).toEqual({ time: 2, value: 2.5, direction: "bullish" });
  });

  it("快线由上跌下为死叉", () => {
    const cross = latestCross(line([3, 2.5, 1.5, 1, 0.5]), line([2, 2, 2, 2, 2]));
    expect(cross).toEqual({ time: 2, value: 1.5, direction: "bearish" });
  });

  it("没有交叉时返回 undefined", () => {
    expect(latestCross(line([1, 2, 3]), line([4, 5, 6]))).toBeUndefined();
  });
});

describe("RSI 超买超卖：取最近一次", () => {
  it("最近一次 >=70 为超买", () => {
    expect(latestRsiExtreme(line([50, 72, 60, 65]))).toEqual({ time: 1, value: 72, kind: "rsi-overbought" });
  });
  it("最近一次 <=30 为超卖", () => {
    expect(latestRsiExtreme(line([50, 25, 40, 45]))).toEqual({ time: 1, value: 25, kind: "rsi-oversold" });
  });
  it("区间内没有极值时返回 undefined", () => {
    expect(latestRsiExtreme(line([50, 45, 55]))).toBeUndefined();
  });
});

const breakoutCandles = (lastClose: number): Candle[] => [
  { time: 0, open: 9, high: 10, low: 8, close: 9 },
  { time: 1, open: 10, high: 11, low: 9, close: 10 },
  { time: 2, open: 11, high: 12, low: 10, close: 11 },
  { time: 3, open: 10, high: 11, low: 9, close: 10 },
  { time: 4, open: 12, high: 13, low: 11, close: lastClose },
];

describe("突破：现价相对前 N 根区间", () => {
  it("收在前高之上为向上突破", () => {
    expect(latestBreakout(breakoutCandles(12.5), 3)).toEqual({ time: 4, price: 12.5, direction: "bullish" });
  });
  it("收在前低之下为向下突破", () => {
    expect(latestBreakout(breakoutCandles(8.5), 3)).toEqual({ time: 4, price: 8.5, direction: "bearish" });
  });
  it("区间内收盘时无突破", () => {
    expect(latestBreakout(breakoutCandles(10.5), 3)).toBeUndefined();
  });
});

describe("computeRuleSignals 汇总", () => {
  it("金叉 + RSI 超买 + 向上突破", () => {
    const signals = computeRuleSignals(breakoutCandles(12.5), {
      ma: { short: line([1, 1.5, 2.5, 3, 3.5]), long: line([2, 2, 2, 2, 2]) },
      macd: { dif: line([0, -0.5, 0.5, 1, 1.5]), dea: line([0, 0, 0, 0, 0]) },
      rsi: line([50, 72, 60, 65, 68]),
      breakoutLookback: 3,
    });
    expect(signals.map((signal) => signal.kind).sort()).toEqual(["breakout-high", "ma-cross", "macd-cross", "rsi-overbought"]);
    expect(signals.find((signal) => signal.kind === "ma-cross")?.direction).toBe("bullish");
    expect(signals.find((signal) => signal.kind === "rsi-overbought")?.direction).toBe("bearish");
  });

  it("无输入时没有信号", () => {
    expect(computeRuleSignals(breakoutCandles(10.5), { breakoutLookback: 3 })).toEqual([]);
  });
});

describe("signalsToMarkers", () => {
  it("看多落在下方箭头、看空落在上方箭头；超买超卖用圆点", () => {
    const markers = signalsToMarkers([
      { kind: "ma-cross", time: 2, price: 2.5, direction: "bullish", label: "MA 金叉" },
      { kind: "rsi-overbought", time: 1, price: 72, direction: "bearish", label: "RSI 超买" },
    ]);
    expect(markers[0]).toEqual({ time: 2, position: "belowBar", shape: "arrowUp", color: "#26a69a", text: "MA 金叉" });
    expect(markers[1]).toEqual({ time: 1, position: "aboveBar", shape: "circle", color: "#ef5350", text: "RSI 超买" });
  });
});
