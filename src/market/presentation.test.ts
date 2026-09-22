import { describe, it, expect } from "vitest";
import { buildChartPresentation } from "./presentation";
import type { ChartCandidates, RuleSignal } from "../shared/analysis";

const candidates: ChartCandidates = {
  pivots: [
    { time: 3, price: 13, kind: "high" },
    { time: 8, price: 7, kind: "low" },
  ],
  levels: [
    { kind: "support", price: 7, label: "S", touches: 1 },
    { kind: "resistance", price: 13, label: "R", touches: 1 },
    { kind: "fib", price: 10, label: "Fib 50.0%", touches: 0 },
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
        { kind: "support", price: 95, label: "S", touches: 1 },
        { kind: "support", price: 90, label: "S", touches: 1 },
        { kind: "support", price: 85, label: "S", touches: 1 },
        { kind: "support", price: 80, label: "S", touches: 1 },
        { kind: "resistance", price: 105, label: "R", touches: 1 },
        { kind: "resistance", price: 110, label: "R", touches: 1 },
        { kind: "resistance", price: 115, label: "R", touches: 1 },
        { kind: "resistance", price: 120, label: "R", touches: 1 },
        { kind: "fib", price: 99, label: "Fib 50.0%", touches: 0 },
      ],
    };
    expect(buildChartPresentation(many, []).levels.map((level) => level.price)).toEqual([95, 90, 85, 105, 110, 115]);
  });
});
