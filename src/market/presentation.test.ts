import { describe, it, expect } from "vitest";
import { buildChartPresentation } from "./presentation";
import { computeCandidates } from "./candidates";
import type { ChartCandidates, RuleSignal } from "../shared/analysis";
import type { Candle } from "../shared/chartSpec";

const candidates: ChartCandidates = {
  pivots: [
    { time: 3, price: 13, kind: "high" },
    { time: 8, price: 7, kind: "low" },
  ],
  levels: [
    { kind: "support", price: 7, label: "S", touches: 1, distancePct: 0, pivotTimes: [] },
    { kind: "resistance", price: 13, label: "R", touches: 1, distancePct: 0, pivotTimes: [] },
    { kind: "fib", price: 10, label: "Fib 50.0%", touches: 0, distancePct: 0, pivotTimes: [] },
  ],
  maAlignment: {
    order: "bullish",
    values: [{ period: 20, value: 12 }, { period: 50, value: 11 }],
    label: "多头排列 MA20>MA50",
  },
  lastPrice: 10,
};

const signals: RuleSignal[] = [
  { kind: "ma-cross", time: 5, price: 12, direction: "bullish", label: "MA 金叉" },
];

describe("buildChartPresentation", () => {
  it("价位线带 kind 对应颜色与标签", () => {
    const { levels } = buildChartPresentation(candidates, []);
    expect(levels).toEqual([
      { price: 7, label: "S", kind: "support", color: "#26a69a" },
      { price: 13, label: "R", kind: "resistance", color: "#ef5350" },
    ]);
  });

  it("斐波那契位不上图（只在 candidates 里给模型）", () => {
    const { levels } = buildChartPresentation(candidates, []);
    expect(levels.some((level) => level.kind === "fib")).toBe(false);
    expect(candidates.levels.some((level) => level.kind === "fib")).toBe(true);
  });

  it("枢轴点不上图", () => {
    const { markers } = buildChartPresentation(candidates, []);
    expect(markers).toEqual([]);
  });

  it("均线排列进入 notes", () => {
    expect(buildChartPresentation(candidates, []).notes).toEqual(["多头排列 MA20>MA50"]);
  });

  it("规则信号也不上图（仍原样返回给模型）", () => {
    expect(buildChartPresentation(candidates, signals).markers).toEqual([]);
    expect(signals.map((signal) => signal.kind)).toEqual(["ma-cross"]);
  });

  it("没有均线排列时 notes 为空", () => {
    expect(buildChartPresentation({ pivots: [], levels: [], lastPrice: 0 }, []).notes).toEqual([]);
  });

  it("支撑阻力各只画现价最近的 3 条", () => {
    const many: ChartCandidates = {
      pivots: [],
      lastPrice: 100,
      levels: [
        { kind: "support", price: 95, label: "S", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "support", price: 90, label: "S", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "support", price: 85, label: "S", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "support", price: 80, label: "S", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "resistance", price: 105, label: "R", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "resistance", price: 110, label: "R", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "resistance", price: 115, label: "R", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "resistance", price: 120, label: "R", touches: 1, distancePct: 0, pivotTimes: [] },
        { kind: "fib", price: 99, label: "Fib 50.0%", touches: 0, distancePct: 0, pivotTimes: [] },
      ],
    };
    expect(buildChartPresentation(many, []).levels.map((level) => level.price)).toEqual([95, 90, 85, 105, 110, 115]);
  });
});

describe("图与答案同源（共用 candidates.ts 的单一聚类实现）", () => {
  const HOUR = 3_600;
  const bars: Candle[] = Array.from({ length: 400 }, (_, i) => {
    const base = 100 + i * 0.05 + Math.sin(i / 9) * 6;
    return { time: i * HOUR, open: base - 0.3, high: base + 1.2, low: base - 1.2, close: base, volume: 10 };
  });

  it("图上画的每条价位都出现在分析结果的完整集合里", () => {
    const candidates = computeCandidates(bars);
    const presentation = buildChartPresentation(candidates, []);
    const chartKeys = presentation.levels.map((level) => `${level.kind}@${level.price}`);
    const allKeys = candidates.levels.map((level) => `${level.kind}@${level.price}`);
    expect(chartKeys.every((key) => allKeys.includes(key))).toBe(true);
  });

  it("每条支撑/阻力带形成它的枢轴时间，可被回答引用", () => {
    const candidates = computeCandidates(bars);
    const priced = candidates.levels.filter((level) => level.kind !== "fib");
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.every((level) => level.pivotTimes.length > 0)).toBe(true);
  });
});

describe("图面价位由参数决定（默认仍是每侧 3 条、只画支撑阻力）", () => {
  /** 造一批价位：支撑 4 条、阻力 4 条、斐波那契 2 条。 */
  const rich: ChartCandidates = {
    pivots: [],
    lastPrice: 100,
    levels: [
      { kind: "support", price: 95, label: "S", touches: 1, distancePct: -5, pivotTimes: [1] },
      { kind: "support", price: 90, label: "S", touches: 1, distancePct: -10, pivotTimes: [2] },
      { kind: "support", price: 85, label: "S", touches: 1, distancePct: -15, pivotTimes: [3] },
      { kind: "support", price: 80, label: "S", touches: 1, distancePct: -20, pivotTimes: [4] },
      { kind: "resistance", price: 105, label: "R", touches: 1, distancePct: 5, pivotTimes: [5] },
      { kind: "resistance", price: 110, label: "R", touches: 1, distancePct: 10, pivotTimes: [6] },
      { kind: "resistance", price: 115, label: "R", touches: 1, distancePct: 15, pivotTimes: [7] },
      { kind: "resistance", price: 120, label: "R", touches: 1, distancePct: 20, pivotTimes: [8] },
      { kind: "fib", price: 97, label: "Fib 23.6%", touches: 0, distancePct: -3, pivotTimes: [] },
      { kind: "fib", price: 92, label: "Fib 38.2%", touches: 0, distancePct: -8, pivotTimes: [] },
    ],
  };

  it("缺省：每侧 3 条、不含斐波那契（行为不变）", () => {
    const { levels } = buildChartPresentation(rich, []);
    expect(levels.map((level) => level.price)).toEqual([95, 90, 85, 105, 110, 115]);
    expect(levels.some((level) => level.kind === "fib")).toBe(false);
  });

  it("可指定每侧条数", () => {
    const { levels } = buildChartPresentation(rich, [], { perSide: 1 });
    expect(levels.map((level) => level.price)).toEqual([95, 105]);
  });

  it("可指定只画某一类，且斐波那契能按要求画上", () => {
    const supportOnly = buildChartPresentation(rich, [], { kinds: ["support"] });
    expect(supportOnly.levels.every((level) => level.kind === "support")).toBe(true);
    const withFib = buildChartPresentation(rich, [], { kinds: ["resistance", "fib"] });
    expect(withFib.levels.filter((level) => level.kind === "fib").length).toBe(2);
    expect(withFib.levels.some((level) => level.kind === "support")).toBe(false);
  });
});

describe("显式价位：模型点名画哪条线（替换机械选择）", () => {
  const candidates: ChartCandidates = {
    pivots: [],
    lastPrice: 100,
    levels: [
      { kind: "support", price: 95, label: "S", touches: 1, distancePct: -5, pivotTimes: [1] },
      { kind: "resistance", price: 105, label: "R", touches: 1, distancePct: 5, pivotTimes: [2] },
    ],
  };

  it("给了显式价位就不再画机械候选（替换语义）", () => {
    const { levels } = buildChartPresentation(candidates, [], {
      explicitLevels: [
        { price: 85_237.96, kind: "support", label: "S" },
        { price: 84_843, kind: "invalidation", label: "失效" },
      ],
    });
    expect(levels.map((level) => level.price)).toEqual([85_237.96, 84_843]);
    expect(levels.some((level) => level.price === 95 || level.price === 105)).toBe(false);
  });

  it("失效位用与机械三类不同的颜色", () => {
    const { levels } = buildChartPresentation(candidates, [], {
      explicitLevels: [{ price: 84_843, kind: "invalidation", label: "失效" }],
    });
    expect(levels[0]!.kind).toBe("invalidation");
    expect(levels[0]!.color).toBe("#f5a623");
  });

  it("不给显式价位时仍走机械选择（每侧 3 条）", () => {
    const { levels } = buildChartPresentation(candidates, []);
    expect(levels.map((level) => level.price)).toEqual([95, 105]);
  });
});
