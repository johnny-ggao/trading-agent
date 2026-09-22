import { describe, it, expect } from "vitest";
import { parseIndicatorSelectors } from "./indicatorSpec";

describe("指标请求文本 → 选择器", () => {
  it("周期类：ma:50 与 ema:20", () => {
    expect(parseIndicatorSelectors(["ma:50", "ema:20"])).toEqual([
      { id: "ma", period: 50 },
      { id: "ema", period: 20 },
    ]);
  });

  it("rsi / atr 同周期类", () => {
    expect(parseIndicatorSelectors(["rsi:14", "atr:14"])).toEqual([
      { id: "rsi", period: 14 },
      { id: "atr", period: 14 },
    ]);
  });

  it("macd 三参数，缺省时省略（由实现补 12/26/9）", () => {
    expect(parseIndicatorSelectors(["macd:12/26/9", "macd"])).toEqual([
      { id: "macd", fast: 12, slow: 26, signal: 9 },
      { id: "macd" },
    ]);
  });

  it("容忍大小写与空格", () => {
    expect(parseIndicatorSelectors([" MA : 50 ", "RSI:14"])).toEqual([
      { id: "ma", period: 50 },
      { id: "rsi", period: 14 },
    ]);
  });

  it("不认识的指标名报错并指出是哪一项（不静默丢弃）", () => {
    expect(() => parseIndicatorSelectors(["ma:50", "bogus:3"])).toThrow(/bogus/);
  });

  it("参数缺失或非正数报错", () => {
    expect(() => parseIndicatorSelectors(["ma"])).toThrow(/ma/);
    expect(() => parseIndicatorSelectors(["rsi:0"])).toThrow(/rsi/);
    expect(() => parseIndicatorSelectors(["ma:abc"])).toThrow(/ma/);
  });

  it("空列表返回空数组（由上层判定为空请求）", () => {
    expect(parseIndicatorSelectors([])).toEqual([]);
  });
});
