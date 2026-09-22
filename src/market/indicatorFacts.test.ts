import { describe, it, expect } from "vitest";
import { computeIndicatorFacts } from "./indicatorFacts";
import type { Candle } from "../shared/chartSpec";

/** i 从 0 起、收盘价 = i（14 根）：手算参考值最直观。 */
const ramp: Candle[] = Array.from({ length: 15 }, (_, i) => ({
  time: i * 3_600,
  open: i,
  high: i + 0.5,
  low: i - 0.5,
  close: i,
  volume: 10,
}));

/** 收盘价 10, 11, 12 —— MA(3) 的最后一根 = (10+11+12)/3 = 11。 */
const abc: Candle[] = [10, 11, 12].map((close, i) => ({
  time: i * 3_600,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
}));

describe("按需指标计算：只算被点名的那些", () => {
  it("ATR：每根真实波幅恒为 2 时，任何平滑口径都应为 2", () => {
    const constantRange: Candle[] = [0, 1, 2, 3].map((i) => ({
      time: i * 3_600, open: 10, high: 11, low: 9, close: 10, volume: 1,
    }));
    const [atr] = computeIndicatorFacts(constantRange, [{ id: "atr", period: 2 }]);
    expect(atr!.latest).toEqual({ time: 3 * 3_600, value: 2 });
  });

  it("ATR 的预热根数与产生第一个值的根数一致", () => {
    const constantRange: Candle[] = [0, 1, 2].map((i) => ({
      time: i * 3_600, open: 10, high: 11, low: 9, close: 10, volume: 1,
    }));
    const [atr] = computeIndicatorFacts(constantRange, [{ id: "atr", period: 2 }]);
    expect(atr!.warmupBars).toBe(2);
  });
  it("只返回被请求的指标", () => {
    const facts = computeIndicatorFacts(ramp, [{ id: "ma", period: 3 }]);
    expect(facts.map((fact) => fact.id)).toEqual(["ma"]);
  });

  it("原样回显参数", () => {
    const [fact] = computeIndicatorFacts(ramp, [{ id: "ma", period: 3 }]);
    expect(fact!.params).toEqual({ period: 3 });
  });

  it("latest 对齐到最后一根 K 线，值与手算参考一致", () => {
    const [fact] = computeIndicatorFacts(abc, [{ id: "ma", period: 3 }]);
    expect(fact!.latest).toEqual({ time: 7_200, value: 11 });
  });

  it("声明该指标需要的预热根数", () => {
    const [ma] = computeIndicatorFacts(ramp, [{ id: "ma", period: 3 }]);
    expect(ma!.warmupBars).toBe(3);
  });

  it("RSI：单调上涨的 ramp 上为 100（参考值，非重算）", () => {
    const [rsi] = computeIndicatorFacts(ramp, [{ id: "rsi", period: 14 }]);
    expect(rsi!.latest.value).toBe(100);
    expect(rsi!.latest.time).toBe(14 * 3_600);
    expect(rsi!.warmupBars).toBe(14);
  });

  it("多个指标各自的参数互不串味", () => {
    const facts = computeIndicatorFacts(ramp, [
      { id: "ma", period: 3 },
      { id: "rsi", period: 14 },
    ]);
    expect(facts.map((fact) => fact.id)).toEqual(["ma", "rsi"]);
    expect(facts[0]!.params).toEqual({ period: 3 });
    expect(facts[1]!.params).toEqual({ period: 14 });
  });
});
