import { describe, it, expect } from "vitest";
import type { ChartCandidates, MarketContext, RuleSignal, TimeframeResonance } from "../shared/analysis";
import {
  buildConfidenceEvidence,
  buildConfidenceQuestions,
  confidenceLevel,
  summarizeConfidenceAnswers,
  EVIDENCE_PIVOT_LIMIT,
  SUPPORT_LEVELS,
  SUFFICIENCY_LEVELS,
  type ConfidenceResult,
} from "./confidence";

const context: MarketContext = {
  trend: { adx: 28, pdi: 30, mdi: 18, state: "trending", direction: "up" },
  volatility: { atr: 800, atrPct: 0.012, state: "normal" },
  volume: { ratio: 1.4, state: "high" },
  maAlignment: { order: "bullish", values: [{ period: 20, value: 64000 }, { period: 50, value: 62000 }], label: "多头排列 MA20>MA50" },
  summary: "走势：趋势；波动：正常；量能：放量",
};

const resonance: TimeframeResonance = {
  higherInterval: "4h",
  higher: context,
  aligned: true,
  summary: "高周期 4h 方向向上（趋势）；当前周期方向向上：共振向上。",
};

const candidates: ChartCandidates = {
  lastPrice: 64200,
  maAlignment: context.maAlignment,
  pivots: Array.from({ length: 12 }, (_, i) => ({ time: i, price: 60000 + i * 100, kind: i % 2 === 0 ? "high" : "low" as const })),
  levels: [
    { kind: "support", price: 63900, label: "S", touches: 2 },
    { kind: "support", price: 63000, label: "S", touches: 1 },
    { kind: "support", price: 61000, label: "S", touches: 3 },
    { kind: "support", price: 59000, label: "S", touches: 1 },
    { kind: "resistance", price: 64500, label: "R", touches: 2 },
    { kind: "resistance", price: 65000, label: "R", touches: 1 },
    { kind: "resistance", price: 66000, label: "R", touches: 4 },
    { kind: "resistance", price: 68000, label: "R", touches: 1 },
    { kind: "fib", price: 63500, label: "Fib 38.2%", touches: 0 },
    { kind: "fib", price: 62800, label: "Fib 50.0%", touches: 0 },
  ],
};

const signals: RuleSignal[] = [
  { kind: "breakout-high", time: 11, price: 64200, direction: "bullish", label: "突破前高" },
];

const input = { symbol: "BTCUSDT", interval: "1h", bars: 300, indicators: "MA20/50/200、成交量、MACD", context, resonance, candidates, ruleSignals: signals };

describe("紧凑证据构造", () => {
  it("枢轴只留最近 N 个", () => {
    const evidence = buildConfidenceEvidence(input);
    expect(evidence.pivots).toHaveLength(EVIDENCE_PIVOT_LIMIT);
    expect(evidence.pivots[0]!.time).toBe(12 - EVIDENCE_PIVOT_LIMIT);
  });

  it("支撑/阻力各留最近 3 条，斐波那契全留", () => {
    const evidence = buildConfidenceEvidence(input);
    const supports = evidence.levels.filter((level) => level.kind === "support");
    const resistances = evidence.levels.filter((level) => level.kind === "resistance");
    expect(supports.map((level) => level.price)).toEqual([63900, 63000, 61000]);
    expect(resistances.map((level) => level.price)).toEqual([64500, 65000, 66000]);
    expect(evidence.levels.filter((level) => level.kind === "fib")).toHaveLength(2);
  });

  it("保留现价、均线排列与原始信号，且不带 K 线", () => {
    const evidence = buildConfidenceEvidence(input);
    expect(evidence.lastPrice).toBe(64200);
    expect(evidence.maAlignment?.order).toBe("bullish");
    expect(evidence.signals).toEqual(signals);
    expect(JSON.stringify(evidence)).not.toContain("candles");
  });
});

describe("构造 TypeSafe 问题集", () => {
  it("一次问支持度、证据充分度与方向一致概率", () => {
    const questions = buildConfidenceQuestions();
    expect(questions.support.type).toBe("score");
    expect(questions.support.criteria).toEqual([...SUPPORT_LEVELS]);
    expect(questions.data_sufficiency.type).toBe("score");
    expect(questions.data_sufficiency.criteria).toEqual([...SUFFICIENCY_LEVELS]);
    expect(questions.direction_agreement.type).toBe("noul");
  });
});

describe("置信度分档", () => {
  it("按阈值（含下界）映射 高/中/低", () => {
    expect(confidenceLevel(0.9)).toBe("高");
    expect(confidenceLevel(0.7)).toBe("高");
    expect(confidenceLevel(0.69)).toBe("中");
    expect(confidenceLevel(0.4)).toBe("中");
    expect(confidenceLevel(0.39)).toBe("低");
  });

  it("支持自定义阈值", () => {
    expect(confidenceLevel(0.6, { highThreshold: 0.5, mediumThreshold: 0.2 })).toBe("高");
  });
});

describe("收敛 TypeSafe 答案", () => {
  const result = {
    model: "jev-1.13.0",
    usage: { input_tokens: 800, output_tokens: 40 },
    answers: {
      support: {
        type: "score",
        score: 2.4,
        confidence: 0.78,
        legend: { 0: SUPPORT_LEVELS[0], 1: SUPPORT_LEVELS[1], 2: SUPPORT_LEVELS[2], 3: SUPPORT_LEVELS[3], 4: SUPPORT_LEVELS[4] },
        probabilities: { 0: 0, 1: 0.1, 2: 0.7, 3: 0.2, 4: 0 },
      },
      data_sufficiency: {
        type: "score",
        score: 3,
        confidence: 1,
        legend: { 0: SUFFICIENCY_LEVELS[0], 1: SUFFICIENCY_LEVELS[1], 2: SUFFICIENCY_LEVELS[2], 3: SUFFICIENCY_LEVELS[3] },
        probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 },
      },
      direction_agreement: { type: "noul", noul: 0.82 },
    },
  } as unknown as ConfidenceResult;

  it("输出支持度（含档位与概率）、置信度、充分度与一致概率", () => {
    const assessment = summarizeConfidenceAnswers(result);
    expect(assessment.support).toEqual({
      score: 2.4,
      level: 2,
      label: SUPPORT_LEVELS[2],
      probabilities: { 0: 0, 1: 0.1, 2: 0.7, 3: 0.2, 4: 0 },
    });
    expect(assessment.confidence).toEqual({ value: 0.78, level: "高" });
    expect(assessment.sufficiency).toEqual({ score: 3, confidence: 1 });
    expect(assessment.agreement).toEqual({ yesProbability: 0.82 });
    expect(assessment.model).toBe("jev-1.13.0");
  });

  it("支持度取整越界时夹到档位范围，并按自定义阈值分档", () => {
    const extreme = {
      ...result,
      answers: {
        ...result.answers,
        support: { ...result.answers.support, score: 9, confidence: 0.6 },
      },
    } as unknown as ConfidenceResult;
    const assessment = summarizeConfidenceAnswers(extreme, { highThreshold: 0.5, mediumThreshold: 0.2 });
    expect(assessment.support.level).toBe(SUPPORT_LEVELS.length - 1);
    expect(assessment.confidence.level).toBe("高");
  });
});
