import { describe, it, expect } from "vitest";
import { parseLookback, lookbackBars } from "./lookback";

describe("时间跨度解析（agent 的语义单位）", () => {
  it("接受天 / 周 / 月 / 小时 / 分钟", () => {
    expect(parseLookback("90d")).toEqual({ ms: 90 * 86_400_000 });
    expect(parseLookback("2w")).toEqual({ ms: 14 * 86_400_000 });
    expect(parseLookback("3M")).toEqual({ ms: 90 * 86_400_000 });
    expect(parseLookback("3mo")).toEqual({ ms: 90 * 86_400_000 });
    expect(parseLookback("36h")).toEqual({ ms: 36 * 3_600_000 });
    expect(parseLookback("90m")).toEqual({ ms: 90 * 60_000 });
    expect(parseLookback("1y")).toEqual({ ms: 365 * 86_400_000 });
  });

  it("大小写：M/mo 是月，m 是分钟（不混）", () => {
    expect(parseLookback("1M")).not.toEqual(parseLookback("1m"));
    expect(parseLookback(" 90D ")).toEqual(parseLookback("90d"));
  });

  it("也接受直接给根数", () => {
    expect(parseLookback("500")).toEqual({ bars: 500 });
  });

  it("不合法时报错并说明可用写法（不静默回退）", () => {
    for (const bad of ["", "abc", "3x", "-5d", "0d", "0"]) {
      expect(() => parseLookback(bad)).toThrow(/lookback/);
    }
  });
});

describe("时间跨度换算成根数（按周期）", () => {
  it("按周期把时长换算成根数", () => {
    expect(lookbackBars("90d", "1h")).toBe(2_160);
    expect(lookbackBars("90d", "4h")).toBe(540);
    expect(lookbackBars("90d", "1d")).toBe(90);
    expect(lookbackBars("2w", "1h")).toBe(336);
    expect(lookbackBars("1y", "1d")).toBe(365);
    expect(lookbackBars("1y", "1h")).toBe(8_760);
  });

  it("直接给根数就原样返回", () => {
    expect(lookbackBars("500", "1h")).toBe(500);
  });

  it("向上取整，保证覆盖不缩水", () => {
    expect(lookbackBars("25h", "1d")).toBe(2);
    expect(lookbackBars("90m", "1h")).toBe(2);
  });
});
