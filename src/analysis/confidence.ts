import { noul, score, type SystemOneResult } from "@typesafe-ai/sdk";
import type { ChartCandidates, MarketContext, RuleSignal } from "../shared/analysis";
import { nearestPerSide } from "../market/candidates";

/** 模型给出的方向性结论：方向 + 失效位 + 理由（理由文本会发给 TypeSafe 评分）。 */
export type ConfidenceDirection = "bullish" | "bearish" | "range" | "unclear";

export interface ConfidenceThesis {
  readonly direction: ConfidenceDirection;
  readonly invalidation: string;
  readonly rationale: string;
}

/** 支持度档位：0 最低（证据矛盾）、4 最高（强烈支持）。 */
export const SUPPORT_LEVELS = [
  "证据与该方向相矛盾",
  "证据不足以支持该方向",
  "证据对该方向支持较弱",
  "证据支持该方向",
  "证据强烈支持该方向",
] as const;

/** 证据充分度档位：0 信息严重不足、3 信息充分。 */
export const SUFFICIENCY_LEVELS = [
  "信息严重不足，几乎无法判断",
  "信息偏少，判断依据薄弱",
  "信息基本够用",
  "信息充分，足以支撑判断",
] as const;

/**
 * 发给 TypeSafe 的问题集：一次调用问三个问题——
 * 支持度（score）、证据充分度（score）、单看证据是否同向（noul）。
 * 用官方 SDK 的 `score`/`noul` 构造，答案类型由档位元组推断。
 */
export function buildConfidenceQuestions() {
  return {
    support: score(
      "只根据机械市场证据判断：这些客观证据对该方向性结论的支持程度如何？不要为了迎合结论而抬高评分。",
      SUPPORT_LEVELS,
    ),
    data_sufficiency: score(
      "这份证据本身是否包含足够的信息来判断该结论（数据量、指标与多周期覆盖、结构清晰度）？",
      SUFFICIENCY_LEVELS,
    ),
    direction_agreement: noul(
      "如果完全不看结论文字，仅凭这些机械证据，是否也会指向同一个方向？",
    ),
  };
}

export type ConfidenceQuestions = ReturnType<typeof buildConfidenceQuestions>;
export type ConfidenceResult = SystemOneResult<ConfidenceQuestions>;

/** 置信度分档阈值（包含下界）。 */
export interface ConfidenceThresholds {
  readonly highThreshold: number;
  readonly mediumThreshold: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = { highThreshold: 0.7, mediumThreshold: 0.4 };

/**
 * 证据里的多周期共振：**紧凑形状**（只含结论与两侧方向），不搬整套 MarketContext。
 * 它是给 Jev 读的文本性证据，没有下游逻辑依赖其内部结构。
 */
export interface EvidenceResonance {
  higherInterval: string;
  higherDirection: string;
  currentDirection: string;
  aligned: boolean;
  summary: string;
}

/** 发给 TypeSafe 的紧凑证据：机械层的可序列化摘要，不含原始 K 线。 */
export interface ConfidenceEvidence {
  readonly symbol: string;
  readonly interval: string;
  readonly bars: number;
  readonly indicators: string;
  readonly lastPrice: number;
  readonly context: MarketContext;
  /** 多周期共振：**按需**（调用方用与模型相同的周期对取得）；没有更高周期时不带。 */
  readonly resonance?: EvidenceResonance;
  readonly maAlignment?: ChartCandidates["maAlignment"];
  readonly levels: ReadonlyArray<{ kind: string; price: number; label: string; touches: number }>;
  readonly pivots: ReadonlyArray<{ time: number; price: number; kind: string }>;
  readonly signals: readonly RuleSignal[];
}

export const EVIDENCE_PIVOT_LIMIT = 8;
export const EVIDENCE_LEVELS_PER_SIDE = 3;

export interface ConfidenceEvidenceInput {
  readonly symbol: string;
  readonly interval: string;
  readonly bars: number;
  readonly indicators: string;
  readonly context: MarketContext;
  readonly resonance?: EvidenceResonance;
  readonly candidates: ChartCandidates;
  readonly ruleSignals: readonly RuleSignal[];
}

/**
 * 从一次 trading_chart 的结果里构造发给 TypeSafe 的紧凑证据。
 * 只保留最近的枢轴与各侧最近的价位，避免把整段 K 线送出去。
 */
export function buildConfidenceEvidence(input: ConfidenceEvidenceInput): ConfidenceEvidence {
  const { candidates } = input;
  // 与图上画什么共用同一取舍策略（nearestPerSide）。
  const nearest = nearestPerSide(candidates.levels, candidates.lastPrice ?? 0, EVIDENCE_LEVELS_PER_SIDE);
  const fibs = candidates.levels.filter((level) => level.kind === "fib");
  return {
    symbol: input.symbol,
    interval: input.interval,
    bars: input.bars,
    indicators: input.indicators,
    lastPrice: candidates.lastPrice,
    context: input.context,
    ...(input.resonance === undefined ? {} : { resonance: input.resonance }),
    ...(candidates.maAlignment === undefined ? {} : { maAlignment: candidates.maAlignment }),
    levels: [...nearest, ...fibs].map((level) => ({
      kind: level.kind,
      price: level.price,
      label: level.label,
      touches: level.touches,
    })),
    pivots: candidates.pivots.slice(-EVIDENCE_PIVOT_LIMIT).map((pivot) => ({
      time: pivot.time,
      price: pivot.price,
      kind: pivot.kind,
    })),
    signals: input.ruleSignals,
  };
}

export type ConfidenceBand = "高" | "中" | "低";

/** 由 0..1 的置信度映射 高/中/低（包含下界）。 */
export function confidenceLevel(value: number, thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS): ConfidenceBand {
  if (value >= thresholds.highThreshold) return "高";
  if (value >= thresholds.mediumThreshold) return "中";
  return "低";
}

export interface SupportSummary {
  /** TypeSafe 的连续支持度分（0..levels-1，可取小数）。 */
  readonly score: number;
  /** 就近取整后的档位索引。 */
  readonly level: number;
  /** 该档位的人读描述。 */
  readonly label: string;
  readonly probabilities: Readonly<Record<string, number>>;
}

export interface ConfidenceAssessment {
  readonly support: SupportSummary;
  readonly confidence: { readonly value: number; readonly level: ConfidenceBand };
  readonly sufficiency: { readonly score: number; readonly confidence: number };
  readonly agreement: { readonly yesProbability: number };
  readonly model: string;
}

/**
 * 把 TypeSafe 的三个答案收敛成一份评估：
 * 支持度（是什么）+ 置信度（该不该信）+ 证据充分度 + 方向一致概率。
 */
export function summarizeConfidenceAnswers(
  result: ConfidenceResult,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceAssessment {
  const support = result.answers.support;
  const maxLevel = SUPPORT_LEVELS.length - 1;
  const level = Math.max(0, Math.min(Math.round(support.score), maxLevel));
  const sufficiency = result.answers.data_sufficiency;
  return {
    support: {
      score: support.score,
      level,
      label: SUPPORT_LEVELS[level] ?? SUPPORT_LEVELS[0],
      probabilities: { ...support.probabilities },
    },
    confidence: { value: support.confidence, level: confidenceLevel(support.confidence, thresholds) },
    sufficiency: { score: sufficiency.score, confidence: sufficiency.confidence },
    agreement: { yesProbability: result.answers.direction_agreement.noul },
    model: result.model,
  };
}
