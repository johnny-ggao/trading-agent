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

describe("出图入参校验（与按需路径同一姿态：不合法就明确报错）", () => {
  it("接受合法参数", () => {
    expect(() => resolveChartRequest({ ma: [50, 200], rsi: 14 })).not.toThrow();
    expect(() => resolveChartRequest({})).not.toThrow();
    expect(() => resolveChartRequest({ ma: [20] })).not.toThrow();
  });

  it("拒绝非正整数周期（trading-signals 会静默产出 0/null，必须在边界拦住）", () => {
    for (const ma of [[0], [-5], [1.5], [50, 0]]) {
      expect(() => resolveChartRequest({ ma })).toThrow(/ma/);
    }
    for (const rsi of [0, -1, 1.5]) {
      expect(() => resolveChartRequest({ rsi })).toThrow(/rsi/);
    }
  });

  it("拒绝空数组（想覆盖就得给出真的周期）", () => {
    expect(() => resolveChartRequest({ ma: [] })).toThrow(/ma/);
  });

  it("拒绝超过单次取数上限的周期（要不到就等于骗人）", () => {
    expect(() => resolveChartRequest({ ma: [2000] })).toThrow(/ma/);
  });

  it("错误信息指出字段与期望，让模型能自我纠正", () => {
    try {
      resolveChartRequest({ rsi: 0 });
      throw new Error("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("rsi");
      expect(message).toContain("正整数");
    }
  });

  it("合法参数照常进入解析结果", () => {
    const r = resolveChartRequest({ ma: [50, 200], rsi: 21 });
    expect(r.indicators.ma).toEqual([50, 200]);
    expect(r.indicators.rsi).toBe(21);
  });
});
