import { describe, it, expect } from "vitest";
import { parseChartLevels, MAX_EXPLICIT_LEVELS } from "./chartLevels";

describe("显式价位解析（模型点名要画哪条线）", () => {
  it("解析 <价格>:<类别>", () => {
    expect(parseChartLevels(["85237.96:support", "86361.24:resistance", "84843:invalidation"])).toEqual([
      { price: 85237.96, kind: "support", label: "S" },
      { price: 86361.24, kind: "resistance", label: "R" },
      { price: 84843, kind: "invalidation", label: "失效" },
    ]);
  });

  it("容忍空格与大小写", () => {
    expect(parseChartLevels([" 85237.96 : Support "])[0]).toEqual({ price: 85237.96, kind: "support", label: "S" });
  });

  it("斐波那契位也能显式画", () => {
    expect(parseChartLevels(["81934.47:fib"])[0]).toMatchObject({ kind: "fib" });
  });

  it("不合法时报错并说明可用类别（不静默丢弃）", () => {
    expect(() => parseChartLevels(["85237.96:suport"])).toThrow(/suport/);
    expect(() => parseChartLevels(["85237.96:suport"])).toThrow(/invalidation/);
    expect(() => parseChartLevels(["abc:support"])).toThrow(/abc/);
    expect(() => parseChartLevels(["-5:support"])).toThrow(/价格/);
    expect(() => parseChartLevels(["85237.96"])).toThrow(/写法/);
  });

  it("条数超上限时明确回绝", () => {
    const many = Array.from({ length: MAX_EXPLICIT_LEVELS + 1 }, (_, i) => `${100 + i}:support`);
    expect(() => parseChartLevels(many)).toThrow(/上限/);
  });
});
