import { describe, it, expect } from "vitest";
import { barsForInterval, buildChartSpec, intervalToMs, requiredWarmupBars } from "./chart";
import { DEFAULT_INDICATORS } from "./indicators";

describe("周期转毫秒", () => {
  it("解析 15m/1h/4h/1d", () => {
    expect(intervalToMs("15m")).toBe(15 * 60_000);
    expect(intervalToMs("1h")).toBe(3_600_000);
    expect(intervalToMs("4h")).toBe(4 * 3_600_000);
    expect(intervalToMs("1d")).toBe(86_400_000);
  });
  it("不支持的周期抛错", () => {
    expect(() => intervalToMs("1y")).toThrow();
  });
});

describe("指标预热根数由参数推导", () => {
  it("取 MA 最长、RSI、MACD 之和的最大值", () => {
    expect(requiredWarmupBars(DEFAULT_INDICATORS)).toBe(200);
    expect(requiredWarmupBars({ ma: [5, 10], macd: { fast: 12, slow: 26, signal: 9 }, rsi: 14, volume: false })).toBe(47);
  });
});

describe("按周期动态推导 K 线根数", () => {
  it("短周期根数多、长周期根数少（由公式算出，非写死表）", () => {
    const bars = ["15m", "1h", "4h", "1d"].map((iv) => barsForInterval(iv));
    expect(bars[0]).toBeGreaterThan(bars[1]!);
    expect(bars[1]).toBeGreaterThanOrEqual(bars[2]!);
    expect(bars[2]).toBeGreaterThanOrEqual(bars[3]!);
  });
  it("短周期受上限约束，长周期受预热下限约束", () => {
    expect(barsForInterval("15m")).toBe(1000);
    expect(barsForInterval("1h")).toBe(720);
    expect(barsForInterval("4h")).toBe(300);
    expect(barsForInterval("1d")).toBe(300);
  });
  it("调大回看时长会提高长周期根数", () => {
    const policy = { lookbackMs: 365 * 86_400_000, minContextBars: 100, maxBars: 1000 };
    expect(barsForInterval("1d", DEFAULT_INDICATORS, policy)).toBe(365);
  });
});

describe("图卡控件状态（宿主写进 chartSpec，供客户端回传目标状态）", () => {
  const candles = [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }];

  it("默认只开 MA/成交量/MACD：布林/KDJ/ATR 关、RSI 关", () => {
    const spec = buildChartSpec("BTCUSDT", "1h", candles);
    expect(spec.controls).toEqual({ ma: [20, 50, 200], rsi: null, bollinger: false, kdj: false, atr: false });
  });

  it("按配置反映各开关与 RSI 周期", () => {
    const spec = buildChartSpec("BTCUSDT", "4h", candles, {
      ...DEFAULT_INDICATORS,
      rsi: 14,
      bollinger: { period: 20, deviation: 2 },
      kdj: { kPeriod: 9, dPeriod: 3, kSlowingPeriod: 3 },
      atr: 14,
    });
    expect(spec.controls).toEqual({ ma: [20, 50, 200], rsi: 14, bollinger: true, kdj: true, atr: true });
  });

  it("symbol/周期/周期集合来自 spec 本体", () => {
    const spec = buildChartSpec("ETHUSDT", "1d", candles);
    expect(spec.symbol).toBe("ETHUSDT");
    expect(spec.interval).toBe("1d");
    expect(spec.timeframes).toEqual(["15m", "1h", "4h", "1d"]);
  });
});
