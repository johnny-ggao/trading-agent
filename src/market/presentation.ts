import type { ChartCandidates, RuleSignal } from "../shared/analysis";
import type { ChartLevel, ChartMarker } from "../shared/chartSpec";
import { nearestPerSide } from "./candidates";

/**
 * 价位线颜色：支撑绿、阻力红。
 * 斐波那契色仍留在表里，因为 `ChartLevel` 的 kind 是三值联合；
 * 图上不再画斐波那契（见 `buildChartPresentation`）。
 */
export const LEVEL_COLORS = {
  support: "#26a69a",
  resistance: "#ef5350",
  fib: "#787b86",
} as const;

/** 现价上下各最多画几条支撑/阻力，避免密集窗口糊成一片。 */
export const MAX_LEVELS_PER_SIDE = 3;

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
): ChartPresentation {
  // 与送给 Jev 的证据共用同一取舍策略（nearestPerSide），避免"图上画的"与"证据含的"分叉。
  const shown = nearestPerSide(candidates.levels, candidates.lastPrice, MAX_LEVELS_PER_SIDE);
  const levels: ChartLevel[] = shown.map((level) => ({
    price: level.price,
    label: level.label,
    kind: level.kind,
    color: LEVEL_COLORS[level.kind],
  }));
  const notes = candidates.maAlignment === undefined ? [] : [candidates.maAlignment.label];
  return { levels, notes, markers: [] };
}
