import type { Candle, ChartSpec, LinePoint, SeriesSpec, SeriesType } from "../shared/chartSpec";
import { muteFormingBars, type StyledCandle } from "./formColors";

export type LightweightSeriesType = "Candlestick" | "Line" | "Histogram";

export interface LightweightSeries {
  id: string;
  type: LightweightSeriesType;
  /** K 线序列可带逐根样式覆盖（`StyledCandle`），其余为原样的点。 */
  data: Array<Candle | LinePoint | StyledCandle>;
  options: Record<string, unknown>;
}

export interface LightweightPane {
  id: string;
  title?: string;
  series: LightweightSeries[];
}

const TYPE_MAP: Record<SeriesType, LightweightSeriesType> = {
  candlestick: "Candlestick",
  line: "Line",
  histogram: "Histogram",
};

/**
 * 把宿主产出的 chartSpec 映射为 Lightweight Charts 可消费的窗格结构。
 * 这是宿主↔客户端契约到具体图表库的唯一边界，纯函数、无副作用。
 */
export function toLightweightPanes(spec: ChartSpec): LightweightPane[] {
  const panes: LightweightPane[] = spec.panes.map((pane) => ({
    id: pane.id,
    ...(pane.title === undefined ? {} : { title: pane.title }),
    series: [],
  }));

  if (panes.length === 0) {
    panes.push({ id: "price", series: [] });
  }

  const byId = new Map(panes.map((pane) => [pane.id, pane]));
  const formingBars = spec.formingBars ?? 0;
  for (const series of spec.series) {
    const target = byId.get(series.pane) ?? panes[0]!;
    // 形成中的 K 线只换样式：它仍在图上，但不参与任何机械判断（由宿主保证）。
    const data = series.type === "candlestick"
      ? muteFormingBars(series.data as Candle[], formingBars)
      : series.data;
    target.series.push({
      id: series.id,
      type: TYPE_MAP[series.type],
      data,
      options: series.options ?? {},
    });
  }

  return panes;
}
