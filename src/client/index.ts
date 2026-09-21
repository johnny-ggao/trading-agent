import * as React from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { TOOL_NAME } from "../shared/tool";
import type { ChartSpec } from "../shared/chartSpec";
import { toLightweightPanes } from "./toSeries";

/** 所需服务：槽位注册表。 */
export const inject = ["slots"];

interface SlotsService {
  inject(name: string, callback: () => unknown): void;
  register(declaration: { name: string; key: string }, component: unknown): unknown;
}

interface ClientContext {
  slots: SlotsService;
}

const SERIES_DEFS = {
  Candlestick: CandlestickSeries,
  Line: LineSeries,
  Histogram: HistogramSeries,
} as const;

interface ToolCardProps {
  block?: { meta?: unknown };
}

function isChartSpec(value: unknown): value is ChartSpec {
  return typeof value === "object" && value !== null && Array.isArray((value as ChartSpec).series);
}

function TradingChart(props: { spec: ChartSpec }): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { color: "transparent" }, attributionLogo: true },
      height: 360,
    });
    chartRef.current = chart;

    const panes = toLightweightPanes(props.spec);
    panes.forEach((pane, paneIndex) => {
      for (const series of pane.series) {
        const api = chart.addSeries(
          SERIES_DEFS[series.type],
          series.options as never,
          paneIndex,
        ) as ISeriesApi<keyof typeof SERIES_DEFS>;
        api.setData(series.data as never);
      }
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [props.spec]);

  return React.createElement("div", { ref: containerRef, style: { width: "100%", height: "360px" } });
}

/** 工具卡：从 block.meta 取出 chartSpec 并渲染。 */
function TradingChartCard(props: ToolCardProps): React.ReactElement {
  const spec = props.block?.meta;
  if (!isChartSpec(spec)) {
    return React.createElement("div", null, "图表数据不可用");
  }
  return React.createElement(TradingChart, { spec });
}

/** 注册 trading_chart 的工具卡视图。 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject("tool.call.toolview", () =>
    ctx.slots.register({ name: "tool.call.toolview", key: TOOL_NAME }, TradingChartCard),
  );
}
