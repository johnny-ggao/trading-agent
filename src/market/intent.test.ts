import { describe, it, expect } from "vitest";
import { resolveChartRequest, describeIndicators } from "./intent";
import { DEFAULT_INDICATORS } from "./indicators";

describe("解析图表请求（默认填充 + 覆盖）", () => {
  it("空请求走默认：BTC / 1h / 默认指标", () => {
    const r = resolveChartRequest({});
    expect(r.symbol).toBe("BTC");
    expect(r.interval).toBe("1h");
    expect(r.indicators).toEqual(DEFAULT_INDICATORS);
  });
  it("时间词映射主周期", () => {
    expect(resolveChartRequest({ timeframe: "这周" }).interval).toBe("4h");
    expect(resolveChartRequest({ timeframe: "今天" }).interval).toBe("1h");
  });
  it("覆盖均线周期与 RSI", () => {
    const r = resolveChartRequest({ ma: [50, 200], rsi: 21 });
    expect(r.indicators.ma).toEqual([50, 200]);
    expect(r.indicators.rsi).toBe(21);
  });
  it("按需开启布林/KDJ/ATR", () => {
    const r = resolveChartRequest({ bollinger: true, kdj: true, atr: true });
    expect(r.indicators.bollinger).toEqual({ period: 20, deviation: 2 });
    expect(r.indicators.kdj).toEqual({ kPeriod: 9, dPeriod: 3, kSlowingPeriod: 3 });
    expect(r.indicators.atr).toBe(14);
  });
  it("默认不含布林/KDJ/ATR", () => {
    const r = resolveChartRequest({});
    expect(r.indicators.bollinger).toBeUndefined();
    expect(r.indicators.kdj).toBeUndefined();
    expect(r.indicators.atr).toBeUndefined();
  });
});

describe("描述所用指标（让回答能声明默认）", () => {
  it("列出默认指标（默认不含 RSI）", () => {
    const text = describeIndicators(DEFAULT_INDICATORS);
    expect(text).toContain("MA20/50/200");
    expect(text).not.toContain("RSI");
  });
  it("提供 RSI 周期时才列出 RSI", () => {
    expect(describeIndicators({ ...DEFAULT_INDICATORS, rsi: 14 })).toContain("RSI(14)");
  });
  it("开启的额外指标会被列出", () => {
    const text = describeIndicators({ ...DEFAULT_INDICATORS, bollinger: { period: 20, deviation: 2 }, atr: 14 });
    expect(text).toContain("BOLL(20,2)");
    expect(text).toContain("ATR(14)");
  });
});
