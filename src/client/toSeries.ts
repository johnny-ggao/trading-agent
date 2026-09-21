import type { Candle, ChartSpec, LinePoint, SeriesSpec, SeriesType } from "../shared/chartSpec";

export type LightweightSeriesType = "Candlestick" | "Line" | "Histogram";

export interface LightweightSeries {
  id: string;
  type: LightweightSeriesType;
  data: Array<Candle | LinePoint>;
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
  for (const series of spec.series) {
    const target = byId.get(series.pane) ?? panes[0]!;
    target.series.push({
      id: series.id,
      type: TYPE_MAP[series.type],
      data: series.data,
      options: series.options ?? {},
    });
  }

  return panes;
}
