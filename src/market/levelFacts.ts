/**
 * 按需价位计算：支撑/阻力/斐波那契/枢轴，**粒度和取舍交给调用方**（ADR-0008）。
 *
 * 与 `candidates.ts` 的区别：那里是出图用的固定配方（1% 容差、只取最近 3 条）；
 * 这里是分析用的可调接口——容差、枢轴敏感度、返回条数都由请求决定，且每条价位
 * 带上"由哪些枢轴形成"，让模型能在回答里引用具体日期与价位。
 *
 * 纯函数，只在**已收盘** K 线上调用。
 */
import type { Candle } from "../shared/chartSpec";
import {
  fibonacciLevels,
  findSupportResistance,
  findSwingPivots,
  type PivotOptions,
} from "./candidates";
import type { PriceLevel, SwingPivot } from "../shared/analysis";

/** 可请求的价位类别。 */
export type LevelKind = "support" | "resistance" | "fib" | "pivots";

export interface LevelRequest {
  kinds?: LevelKind[];
  pivotOptions?: PivotOptions;
  /** 聚簇容差（百分比，1 表示 1%）；默认 1。 */
  tolerancePct?: number;
  /** 返回的价位条数上限（按触碰次数降序）；缺省不截断。 */
  maxLevels?: number;
}

/** 枢轴就是 candidates.ts 的 swing 枢轴——同一个概念，不再重复声明。 */
export type LevelPivot = SwingPivot;

/** 价位就是 candidates.ts 的 PriceLevel——同一个概念，不再重复声明。 */
export type LevelFact = PriceLevel;

export interface LevelFacts {
  pivots: LevelPivot[];
  levels: LevelFact[];
  /** 各类别的**总条数**（未受 maxLevels 截断影响）。 */
  counts: Record<LevelKind, number>;
  /** 被 maxLevels 截掉的条数。 */
  truncated: number;
}

const DEFAULT_PIVOT_OPTIONS: PivotOptions = { left: 2, right: 2 };
const ALL_KINDS: LevelKind[] = ["support", "resistance", "fib", "pivots"];

/** 按请求计算价位事实。 */
export function computeLevelFacts(candles: Candle[], request: LevelRequest = {}): LevelFacts {
  const kinds = request.kinds ?? ALL_KINDS;
  const lastClose = candles.at(-1)?.close ?? 0;
  // 枢轴与聚类都走 candidates.ts 的单一实现（口径一致）；容差在对外是百分比、对内是分数。
  const pivotOptions = request.pivotOptions ?? DEFAULT_PIVOT_OPTIONS;
  const pivots = kinds.includes("pivots") ? findSwingPivots(candles, pivotOptions) : [];

  const all: LevelFact[] = [];
  if (kinds.includes("support") || kinds.includes("resistance")) {
    const clustered = findSupportResistance(
      findSwingPivots(candles, pivotOptions),
      lastClose,
      (request.tolerancePct ?? 1) / 100,
    );
    const wanted = new Set(kinds);
    all.push(...clustered.filter((level) => wanted.has(level.kind)));
  }
  if (kinds.includes("fib")) {
    const lows = candles.map((candle) => candle.low);
    const highs = candles.map((candle) => candle.high);
    const fibs = lows.length === 0 || highs.length === 0
      ? []
      : fibonacciLevels(Math.min(...lows), Math.max(...highs));
    all.push(...fibs.map((level) => ({
      kind: "fib" as const,
      price: level.price,
      label: level.label,
      touches: level.touches,
      distancePct: lastClose === 0 ? 0 : ((level.price - lastClose) / lastClose) * 100,
      pivotTimes: [] as number[],
    })));
  }

  // 先按"硬度"（触碰次数）降序，同分按离现价的远近升序。
  const ordered = [...all].sort((a, b) =>
    b.touches - a.touches || Math.abs(a.distancePct) - Math.abs(b.distancePct));
  const capped = request.maxLevels === undefined ? ordered : ordered.slice(0, request.maxLevels);

  const countOf = (kind: LevelKind): number =>
    kind === "pivots" ? pivots.length : all.filter((level) => level.kind === kind).length;

  return {
    pivots,
    levels: capped,
    counts: {
      support: countOf("support"),
      resistance: countOf("resistance"),
      fib: countOf("fib"),
      pivots: countOf("pivots"),
    },
    truncated: ordered.length - capped.length,
  };
}
