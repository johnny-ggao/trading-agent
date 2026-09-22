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
import { fibonacciLevels, type PivotOptions } from "./candidates";

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

export interface LevelPivot {
  time: number;
  price: number;
  kind: "high" | "low";
}

export interface LevelFact {
  kind: "support" | "resistance" | "fib";
  price: number;
  label: string;
  /** 落在这一簇里的枢轴个数：越多越"硬"。 */
  touches: number;
  /** 相对最后一根已收盘 K 线收盘价的百分比（支撑为负、阻力为正）。 */
  distancePct: number;
  /** 形成这条价位的枢轴时间（秒），升序；斐波那契位为空。 */
  pivotTimes: number[];
}

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

/** 分形 swing 枢轴（与出图口径一致：严格高于/低于左右各 left/right 根）。 */
function findPivots(candles: Candle[], options: PivotOptions): LevelPivot[] {
  const { left, right } = options;
  const pivots: LevelPivot[] = [];
  for (let i = left; i < candles.length - right; i += 1) {
    const candle = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j += 1) {
      if (j === i) continue;
      const other = candles[j]!;
      if (candle.high <= other.high) isHigh = false;
      if (candle.low >= other.low) isLow = false;
    }
    if (isHigh) pivots.push({ time: candle.time, price: candle.high, kind: "high" });
    else if (isLow) pivots.push({ time: candle.time, price: candle.low, kind: "low" });
  }
  return pivots;
}

/** 把枢轴聚成支撑/阻力簇，保留簇内成员以便回传枢轴时间。 */
function clusterLevels(
  pivots: LevelPivot[],
  lastClose: number,
  tolerancePct: number,
): LevelFact[] {
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: LevelPivot[][] = [];
  for (const pivot of sorted) {
    const current = clusters[clusters.length - 1];
    const anchor = current?.[0]?.price;
    if (current !== undefined && anchor !== undefined && Math.abs(pivot.price - anchor) / anchor <= tolerancePct / 100) {
      current.push(pivot);
      continue;
    }
    clusters.push([pivot]);
  }
  return clusters.map((cluster) => {
    const price = cluster.reduce((sum, pivot) => sum + pivot.price, 0) / cluster.length;
    const kind = price < lastClose ? "support" : "resistance";
    return {
      kind: kind as LevelFact["kind"],
      price,
      label: kind === "support" ? "S" : "R",
      touches: cluster.length,
      distancePct: lastClose === 0 ? 0 : ((price - lastClose) / lastClose) * 100,
      pivotTimes: cluster.map((pivot) => pivot.time).sort((a, b) => a - b),
    };
  });
}

/** 按请求计算价位事实。 */
export function computeLevelFacts(candles: Candle[], request: LevelRequest = {}): LevelFacts {
  const kinds = request.kinds ?? ALL_KINDS;
  const lastClose = candles.at(-1)?.close ?? 0;
  const pivots = kinds.includes("pivots")
    ? findPivots(candles, request.pivotOptions ?? DEFAULT_PIVOT_OPTIONS)
    : [];

  const all: LevelFact[] = [];
  if (kinds.includes("support") || kinds.includes("resistance")) {
    const clustered = clusterLevels(
      findPivots(candles, request.pivotOptions ?? DEFAULT_PIVOT_OPTIONS),
      lastClose,
      request.tolerancePct ?? 1,
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
