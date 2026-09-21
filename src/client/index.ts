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
    declaration: { name: string; id?: string; key?: string; order?: number },
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

// ── 图表组件 ───────────────────────────────────────────────────────────────

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

  return React.createElement("div", {
    ref: containerRef,
    style: { width: "100%", height: "360px" },
  });
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
      { name: "conversation.chat.turnTail", id: "trading-chart", order: 0 },
      TradingChartTail,
    ),
  );
}
