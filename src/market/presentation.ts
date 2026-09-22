import type { ChartCandidates, RuleSignal } from "../shared/analysis";
import type { ChartLevel, ChartMarker } from "../shared/chartSpec";
import { nearestPerSide } from "./candidates";
import type { ExplicitLevel } from "./chartLevels";

/**
 * 价位线颜色：支撑绿、阻力红。
 * 斐波那契色仍留在表里，因为 `ChartLevel` 的 kind 是三值联合；
 * 图上不再画斐波那契（见 `buildChartPresentation`）。
 */
export const LEVEL_COLORS = {
  support: "#26a69a",
  resistance: "#ef5350",
  fib: "#787b86",
  /** 失效位：琥珀色，与机械三类区分（它是判读，不是候选）。 */
  invalidation: "#f5a623",
} as const;

/**
 * **默认**每侧画几条支撑/阻力（避免密集窗口糊成一片）。
 *
 * 与按需路径的 `DEFAULT_LEVELS_PER_SIDE`（facts.ts，默认 5）是两个**默认值**，但共用
 * 同一个取舍策略 `nearestPerSide`——图要清爽、分析要多给是刻意的差别，策略本身不分叉。
 */
export const MAX_LEVELS_PER_SIDE = 3;

/** 图上价位的可选设置（`trading_chart` 的渲染参数）。 */
export interface ChartLevelOptions {
  /** 每侧最多画几条支撑/阻力；缺省 {@link MAX_LEVELS_PER_SIDE}。 */
  perSide?: number;
  /** 画哪几类；缺省只画支撑/阻力（斐波那契不上图）。 */
  kinds?: readonly ("support" | "resistance" | "fib")[];
  /**
   * **显式价位**（工单 13）：模型点名要画哪几条线。给了它就**替换**机械选择——
   * 图面完全由调用方决定，可预期；想"再加一条"就把机械那几条一起写上。
   */
  explicitLevels?: readonly ExplicitLevel[];
}

/** 图上可渲染的机械层：价位线与说明文字。 */
export interface ChartPresentation {
  levels: ChartLevel[];
  notes: string[];
  /**
   * 始终为空：枢轴点与规则信号**不画在图上**。
   * 它们仍在工具返回的 `candidates` / `ruleSignals` 里给模型，只是不上图——
   * 主图只留 K 线、均线与支撑阻力位。字段保留是为了契约稳定，将来要开关时不必改协议。
   */
  markers: ChartMarker[];
}

/**
 * 把机械候选/规则信号转成图上可渲染的价位线与说明。
 *
 * 只画支撑/阻力（各取现价最近的几条）：
 * - 斐波那契**不上图**——5 条线糊在价格上，噪音大于信息；它仍在 `candidates` 里；
 * - 枢轴点与规则信号**不上图**——一张 1h 图能到十几个点/箭头，把价格压住了；
 *   机械事实照旧交给模型（`signalsToMarkers` 保留映射能力，将来加开关时直接用）。
 */
export function buildChartPresentation(
  candidates: ChartCandidates,
  _ruleSignals: RuleSignal[],
  options: ChartLevelOptions = {},
): ChartPresentation {
  const perSide = options.perSide ?? MAX_LEVELS_PER_SIDE;
  const wanted = new Set(options.kinds ?? (["support", "resistance"] as const));
  // 显式价位优先（替换语义）；否则与送给 Jev 的证据共用同一取舍策略（nearestPerSide），
  // 避免"图上画的"与"证据含的"分叉。
  const explicit = options.explicitLevels;
  const levels: ChartLevel[] = explicit !== undefined
    ? explicit.map((level) => ({
      price: level.price,
      label: level.label,
      kind: level.kind,
      color: LEVEL_COLORS[level.kind],
    }))
    : [
      ...nearestPerSide(candidates.levels, candidates.lastPrice, perSide)
        .filter((level) => wanted.has(level.kind)),
      ...(wanted.has("fib") ? candidates.levels.filter((level) => level.kind === "fib") : []),
    ].map((level) => ({
      price: level.price,
      label: level.label,
      kind: level.kind,
      color: LEVEL_COLORS[level.kind],
    }));
  const notes = candidates.maAlignment === undefined ? [] : [candidates.maAlignment.label];
  return { levels, notes, markers: [] };
}
