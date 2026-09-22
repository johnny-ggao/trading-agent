import { describe, it, expect } from "vitest";
import {
  computeCandidates,
  fibonacciLevels,
  findSupportResistance,
  nearestPerSide,
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
      { kind: "support", price: 7, label: "S", touches: 1, distancePct: -30, pivotTimes: [8] },
      { kind: "resistance", price: 13, label: "R", touches: 1, distancePct: 30, pivotTimes: [3] },
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

describe("口径一致：出图与分析共用同一套枢轴与聚类", () => {
  /** 手工构造：100 附近两个高点、90 附近一个低点。 */
  const candles: Candle[] = [
    { time: 0, open: 95, high: 96, low: 94, close: 95 },
    { time: 1, open: 96, high: 97, low: 95, close: 96 },
    { time: 2, open: 100, high: 100, low: 99, close: 99 },
    { time: 3, open: 99, high: 99, low: 98, close: 98 },
    { time: 4, open: 98, high: 98, low: 97, close: 97 },
    { time: 5, open: 98, high: 101, low: 97, close: 100 },
    { time: 6, open: 98, high: 98, low: 97, close: 97 },
    { time: 7, open: 97, high: 97, low: 96, close: 96 },
    { time: 8, open: 96, high: 96, low: 90, close: 91 },
    { time: 9, open: 92, high: 93, low: 92, close: 93 },
    { time: 10, open: 94, high: 95, low: 93, close: 94 },
  ];

  it("聚类结果自带形成它的枢轴时间与距现价百分比", () => {
    const pivots = findSwingPivots(candles);
    const levels = findSupportResistance(pivots, 94);
    const resistance = levels.find((level) => level.kind === "resistance")!;
    expect(resistance.pivotTimes).toEqual([2, 5]);
    expect(resistance.touches).toBe(2);
    expect(resistance.distancePct).toBeGreaterThan(0);
    const support = levels.find((level) => level.kind === "support")!;
    expect(support.pivotTimes).toEqual([8]);
    expect(support.distancePct).toBeLessThan(0);
  });

  it("容差以分数为准：0.005 比 0.05 分出更多簇", () => {
    const pivots = findSwingPivots(candles);
    const tight = findSupportResistance(pivots, 94, 0.005);
    const loose = findSupportResistance(pivots, 94, 0.05);
    expect(tight.length).toBeGreaterThan(loose.length);
  });
});

describe("每侧最近 N 条：图与证据共用同一策略", () => {
  const levels = [
    { kind: "support" as const, price: 95, label: "S", touches: 1, distancePct: -1, pivotTimes: [] },
    { kind: "support" as const, price: 90, label: "S", touches: 1, distancePct: -5, pivotTimes: [] },
    { kind: "support" as const, price: 80, label: "S", touches: 1, distancePct: -15, pivotTimes: [] },
    { kind: "support" as const, price: 70, label: "S", touches: 1, distancePct: -25, pivotTimes: [] },
    { kind: "resistance" as const, price: 105, label: "R", touches: 1, distancePct: 5, pivotTimes: [] },
    { kind: "resistance" as const, price: 115, label: "R", touches: 1, distancePct: 15, pivotTimes: [] },
    { kind: "fib" as const, price: 100, label: "Fib 50.0%", touches: 0, distancePct: 0, pivotTimes: [] },
  ];

  it("每侧各取离现价最近的 N 条，斐波那契不参与", () => {
    const picked = nearestPerSide(levels, 100, 2);
    expect(picked.map((level) => level.price)).toEqual([95, 90, 105, 115]);
  });

  it("不足 N 条时给全部", () => {
    expect(nearestPerSide(levels, 100, 5).length).toBe(6); // 4 support + 2 resistance，fib 排除
  });
});
