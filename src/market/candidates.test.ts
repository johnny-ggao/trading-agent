import { describe, it, expect } from "vitest";
import {
  computeCandidates,
  fibonacciLevels,
  findSupportResistance,
  findSwingPivots,
  movingAverageAlignment,
} from "./candidates";
import type { Candle } from "../shared/chartSpec";

/** 11 根：在第 3 根形成高点 13，在第 8 根形成低点 7。 */
const candles: Candle[] = [
  { time: 0, open: 10, high: 10, low: 9, close: 10 },
  { time: 1, open: 10, high: 11, low: 10, close: 11 },
  { time: 2, open: 11, high: 12, low: 11, close: 12 },
  { time: 3, open: 12, high: 13, low: 12, close: 13 },
  { time: 4, open: 13, high: 12, low: 11, close: 12 },
  { time: 5, open: 12, high: 11, low: 10, close: 11 },
  { time: 6, open: 11, high: 10, low: 9, close: 10 },
  { time: 7, open: 10, high: 9, low: 8, close: 9 },
  { time: 8, open: 9, high: 8, low: 7, close: 8 },
  { time: 9, open: 8, high: 9, low: 8, close: 9 },
  { time: 10, open: 9, high: 10, low: 9, close: 10 },
];

describe("swing 枢轴", () => {
  it("左右各 2 根的局部高/低点", () => {
    expect(findSwingPivots(candles)).toEqual([
      { time: 3, price: 13, kind: "high" },
      { time: 8, price: 7, kind: "low" },
    ]);
  });

  it("窗口太短时没有枢轴", () => {
    expect(findSwingPivots(candles.slice(0, 4))).toEqual([]);
  });
});

describe("支撑阻力区", () => {
  it("按现价分支撑/阻力，触碰次数计入", () => {
    const pivots = findSwingPivots(candles);
    expect(findSupportResistance(pivots, 10)).toEqual([
      { kind: "support", price: 7, label: "S", touches: 1 },
      { kind: "resistance", price: 13, label: "R", touches: 1 },
    ]);
  });

  it("相邻价位在容差内合并、触碰次数累加", () => {
    const pivots = [
      { time: 1, price: 100, kind: "high" as const },
      { time: 3, price: 100.5, kind: "high" as const },
      { time: 5, price: 120, kind: "high" as const },
    ];
    const levels = findSupportResistance(pivots, 100, 0.01);
    expect(levels).toHaveLength(2);
    expect(levels[0]!.touches).toBe(2);
    expect(levels[0]!.price).toBeCloseTo(100.25, 6);
  });
});

describe("斐波那契位", () => {
  it("由区间低点给出 5 个回撤位", () => {
    const levels = fibonacciLevels(7, 13);
    expect(levels.map((level) => level.price)).toEqual([11.584, 10.708, 10, 9.292, 8.284]);
    expect(levels.every((level) => level.kind === "fib")).toBe(true);
    expect(levels[2]!.label).toBe("Fib 50.0%");
  });
});

describe("均线排列", () => {
  const values = [{ period: 20, value: 12 }, { period: 50, value: 11 }, { period: 200, value: 10 }];
  it("短>中>长为多头排列", () => {
    expect(movingAverageAlignment(values)?.order).toBe("bullish");
  });
  it("短<中<长为空头排列", () => {
    const bear = [{ period: 20, value: 10 }, { period: 50, value: 11 }, { period: 200, value: 12 }];
    expect(movingAverageAlignment(bear)?.order).toBe("bearish");
  });
  it("其余为混合", () => {
    const mixed = [{ period: 20, value: 11 }, { period: 50, value: 10 }, { period: 200, value: 12 }];
    expect(movingAverageAlignment(mixed)?.order).toBe("mixed");
  });
  it("少于两条均线时没有排列", () => {
    expect(movingAverageAlignment([{ period: 20, value: 10 }])).toBeUndefined();
  });
});

describe("computeCandidates 汇总", () => {
  it("枢轴 + 支撑阻力 + 斐波那契 + 均线排列", () => {
    const candidates = computeCandidates(candles, [
      { period: 20, value: 12 }, { period: 50, value: 11 }, { period: 200, value: 10 },
    ]);
    expect(candidates.pivots).toHaveLength(2);
    expect(candidates.levels.filter((level) => level.kind === "fib")).toHaveLength(5);
    expect(candidates.levels.some((level) => level.kind === "support")).toBe(true);
    expect(candidates.levels.some((level) => level.kind === "resistance")).toBe(true);
    expect(candidates.maAlignment?.order).toBe("bullish");
  });
});
