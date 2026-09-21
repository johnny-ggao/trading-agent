import type { ChartCandidates, RuleSignal } from "../shared/analysis";
import type { ChartLevel, ChartMarker } from "../shared/chartSpec";
import { signalsToMarkers } from "./signals";

/** 价位线颜色：支撑绿、阻力红、斐波那契灰。 */
export const LEVEL_COLORS = {
  support: "#26a69a",
  resistance: "#ef5350",
  fib: "#787b86",
} as const;

/** 图上最多画多少个枢轴点，避免密集窗口糊成一片。 */
export const PIVOT_MARKER_LIMIT = 8;

/** 现价上下各最多画几条支撑/阻力，避免密集窗口糊成一片。 */
export const MAX_LEVELS_PER_SIDE = 3;

/** 图上可渲染的机械层：价位线、说明文字、标记。 */
export interface ChartPresentation {
  levels: ChartLevel[];
  notes: string[];
  markers: ChartMarker[];
}

/** 把机械候选/规则信号转成图上可渲染的价位线、说明与标记。 */
export function buildChartPresentation(
  candidates: ChartCandidates,
  ruleSignals: RuleSignal[],
): ChartPresentation {
  // 支撑取最近的（价格最高的）几条，阻力取最近的（价格最低的）几条；斐波那契全画。
  const nearest = (
    kind: "support" | "resistance",
    compare: (a: number, b: number) => number,
  ): ChartCandidates["levels"] =>
    candidates.levels
      .filter((level) => level.kind === kind)
      .sort((a, b) => compare(a.price, b.price))
      .slice(0, MAX_LEVELS_PER_SIDE);
  const shown = [
    ...nearest("support", (a, b) => b - a),
    ...nearest("resistance", (a, b) => a - b),
    ...candidates.levels.filter((level) => level.kind === "fib"),
  ];
  const levels: ChartLevel[] = shown.map((level) => ({
    price: level.price,
    label: level.label,
    kind: level.kind,
    color: LEVEL_COLORS[level.kind],
  }));
  const pivotMarkers: ChartMarker[] = candidates.pivots.slice(-PIVOT_MARKER_LIMIT).map((pivot) => ({
    time: pivot.time,
    position: "atPriceMiddle",
    shape: "circle",
    color: pivot.kind === "high" ? LEVEL_COLORS.resistance : LEVEL_COLORS.support,
    price: pivot.price,
  }));
  const markers = [...pivotMarkers, ...signalsToMarkers(ruleSignals)].sort((a, b) => a.time - b.time);
  const notes = candidates.maAlignment === undefined ? [] : [candidates.maAlignment.label];
  return { levels, notes, markers };
}
