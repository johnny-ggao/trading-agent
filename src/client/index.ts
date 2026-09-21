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
  register(
    declaration: {
      name: string;
      id?: string;
      key?: string;
      order?: number;
      priority?: number;
      select?: (...args: unknown[]) => unknown;
    },
    component: unknown,
  ): unknown;
}

interface ClientContext {
  slots: SlotsService;
}

const SERIES_DEFS = {
  Candlestick: CandlestickSeries,
  Line: LineSeries,
  Histogram: HistogramSeries,
} as const;

// ── 图例 ───────────────────────────────────────────────────────────────────

interface LegendRow {
  label: string;
  color?: string;
  value?: number;
}

interface LegendPane {
  title: string;
  rows: LegendRow[];
}

function readValue(item: unknown): number | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const record = item as { value?: unknown; close?: unknown };
  if (typeof record.value === "number") return record.value;
  if (typeof record.close === "number") return record.close;
  return undefined;
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

/** 按窗格汇总各序列的名称与最后一个值。 */
function buildLegend(spec: ChartSpec): LegendPane[] {
  return spec.panes
    .map((pane) => ({
      title: pane.title ?? pane.id,
      rows: spec.series
        .filter((series) => series.pane === pane.id && series.type !== "candlestick")
        .map((series) => ({
          label: series.label ?? series.id,
          color: typeof series.options?.color === "string" ? series.options.color : undefined,
          value: readValue(series.data.at(-1)),
        })),
    }))
    .filter((pane) => pane.rows.length > 0);
}

function LegendOverlay(props: { legend: LegendPane[] }): React.ReactElement | null {
  if (props.legend.length === 0) return null;
  return React.createElement(
    "div",
    {
      "data-trading-legend": "1",
      style: {
        position: "absolute",
        top: "6px",
        left: "10px",
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        font: "11px/1.4 ui-sans-serif, system-ui, sans-serif",
        opacity: 0.95,
      },
    },
    props.legend.map((pane) =>
      React.createElement("div", { key: pane.title, style: { display: "flex", gap: "10px" } }, [
        ...(pane.rows.length > 1
          ? [React.createElement("span", { key: "__title", style: { opacity: 0.55 } }, pane.title)]
          : []),
        ...pane.rows.map((row) =>
          React.createElement("span", { key: row.label }, [
            React.createElement("span", { key: "label", style: { color: row.color } }, row.label),
            React.createElement(
              "span",
              { key: "value", style: { opacity: 0.85 } },
              row.value === undefined ? "" : ` ${formatValue(row.value)}`,
            ),
          ]),
        ),
      ]),
    ),
  );
}

// ── 图表 ───────────────────────────────────────────────────────────────────

function isChartSpec(value: unknown): value is ChartSpec {
  return (
    typeof value === "object"
    && value !== null
    && Array.isArray((value as ChartSpec).series)
    && typeof (value as ChartSpec).symbol === "string"
  );
}

function TradingChart(props: { spec: ChartSpec }): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const legend = React.useMemo(() => buildLegend(props.spec), [props.spec]);
  // 窗格越多整体越高，主图通过 stretchFactor 占更大比例。
  const paneCount = Math.max(1, props.spec.panes.length);
  const height = paneCount <= 1 ? 360 : 300 + paneCount * 80;

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    // 跟随当前主题：默认 textColor 近乎黑色，深色主题下坐标轴标签会"隐形"。
    const textColor = getComputedStyle(container).color || "#d1d4dc";
    const chart = createChart(container, {
      autoSize: true,
      height,
      layout: {
        background: { color: "transparent" },
        textColor,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(128, 128, 128, 0.15)" },
        horzLines: { color: "rgba(128, 128, 128, 0.15)" },
      },
      rightPriceScale: { borderColor: "rgba(128, 128, 128, 0.3)" },
      timeScale: {
        borderColor: "rgba(128, 128, 128, 0.3)",
        timeVisible: true,
        secondsVisible: false,
      },
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
    chart.panes().forEach((pane, index) => pane.setStretchFactor(index === 0 ? 2 : 1));

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [props.spec, height]);

  return React.createElement(
    "div",
    { style: { position: "relative", width: "100%" } },
    React.createElement("div", {
      ref: containerRef,
      "data-trading-chart": "1",
      style: { width: "100%", height: `${height}px` },
    }),
    React.createElement(LegendOverlay, { legend }),
  );
}

// ── 从本回合的工具结果里取回 chartSpec ──────────────────────────────────────

interface ToolBlockLike {
  name?: string;
  call?: { name?: string } | null;
  meta?: unknown;
}

interface ChatNodeLike {
  kind?: string;
  data?: { root?: ToolBlockLike };
}

interface ChatSnapshotLike {
  locations: { getTurn(turn: number): readonly string[] };
  nodes: { get(key: string): ChatNodeLike | undefined };
}

type UseChatLike = <T>(selector: (snapshot: ChatSnapshotLike) => T) => T;

interface ChartTailProps {
  turn?: { turn?: number } | number;
  useChat?: UseChatLike;
}

/** 在指定回合里从后往前找 trading_chart 的 tool-result，取它的 presentationMeta。 */
function findChartSpec(snapshot: ChatSnapshotLike, turn: number | undefined): ChartSpec | undefined {
  if (turn === undefined) return undefined;
  const keys = snapshot.locations.getTurn(turn);
  for (let i = keys.length - 1; i >= 0; i -= 1) {
    const node = snapshot.nodes.get(keys[i]!);
    if (node?.kind !== "tool-call") continue;
    const root = node.data?.root;
    const name = root?.call?.name ?? root?.name;
    if (name === TOOL_NAME && isChartSpec(root?.meta)) return root.meta;
  }
  return undefined;
}

/** 回合末尾的图表贡献：本回合没有 trading_chart 时不渲染。 */
function TradingChartTail(props: ChartTailProps): React.ReactElement | null {
  const turn = typeof props.turn === "number" ? props.turn : props.turn?.turn;
  const useChat = props.useChat;
  const spec = typeof useChat === "function"
    ? useChat((snapshot) => findChartSpec(snapshot, turn))
    : undefined;
  if (spec === undefined) return null;
  return React.createElement(
    "div",
    { style: { marginTop: "8px" } },
    React.createElement(TradingChart, { spec }),
  );
}

/** 注册回合末尾（turn tail）的图表。 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject("conversation.chat.turnTail", () =>
    ctx.slots.register(
      {
        name: "conversation.chat.turnTail",
        priority: 0,
        // alpha.1 把该槽声明为 chain：注册必须带 select。我们总是接受，
        // 由组件在本回合没有 trading_chart 时返回 null。
        select: () => true,
      },
      TradingChartTail,
    ),
  );
}
