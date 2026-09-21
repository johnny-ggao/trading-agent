import { describe, it, expect } from "vitest";
import { barsForInterval, intervalToMs, requiredWarmupBars } from "./chart";
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
