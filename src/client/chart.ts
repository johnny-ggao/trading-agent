import * as React from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { ChartSpec } from "../shared/chartSpec";
import { toLightweightPanes } from "./toSeries";
import {
  applyChange,
  currentTarget,
  fetchChartSpec,
  type ControlChange,
  type ControlTarget,
  type ToggleId,
} from "./controls";

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

function LegendOverlay(props: { legend: LegendPane[]; notes: string[] }): React.ReactElement | null {
  if (props.legend.length === 0 && props.notes.length === 0) return null;
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
    [
      ...props.notes.map((note, index) =>
        React.createElement("div", { key: `note-${index}`, "data-trading-note": "1", style: { opacity: 0.7 } }, note)),
      ...props.legend.map((pane) =>
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
    ],
  );
}

// ── 图卡控件：周期切换 + 指标开关 ──────────────────────────────────────────

const TOGGLE_LABELS: Array<{ id: ToggleId; label: string }> = [
  { id: "bollinger", label: "BOLL" },
  { id: "kdj", label: "KDJ" },
  { id: "atr", label: "ATR" },
  { id: "rsi", label: "RSI" },
];

function toggleOn(target: ControlTarget, id: ToggleId): boolean {
  return id === "rsi" ? target.rsi !== null : target[id];
}

const CONTROL_BUTTON_STYLE: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: "4px",
  border: "1px solid rgba(128, 128, 128, 0.35)",
  background: "transparent",
  color: "inherit",
  font: "11px/1.6 ui-sans-serif, system-ui, sans-serif",
  lineHeight: "1.4",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const CONTROL_BUTTON_ACTIVE_STYLE: React.CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  background: "rgba(128, 128, 128, 0.28)",
  borderColor: "rgba(128, 128, 128, 0.75)",
};

/** 工具栏整体做成独立的一条，与下方 TradingView 图表明显分开。 */
const CONTROL_BAR_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "4px",
  alignItems: "center",
  width: "fit-content",
  padding: "4px 6px",
  margin: "6px 0",
  borderRadius: "6px",
  background: "rgba(128, 128, 128, 0.08)",
  border: "1px solid rgba(128, 128, 128, 0.18)",
};

const CONTROL_DIVIDER_STYLE: React.CSSProperties = {
  width: "1px",
  height: "14px",
  margin: "0 2px",
  background: "rgba(128, 128, 128, 0.3)",
};

const STATUS_STYLE = {
  margin: "4px 0",
  font: "11px/1.6 ui-sans-serif, system-ui, sans-serif",
  opacity: 0.7,
};

/**
 * 周期按钮 + 指标开关。点击直接向宿主端点取一份新 chartSpec 换图，
 * 即时生效，不产生对话消息、不占模型回合。
 */
function ControlBar(props: { spec: ChartSpec; onControlChange?: (target: ControlTarget) => void }): React.ReactElement | null {
  const { spec, onControlChange } = props;
  if (onControlChange === undefined || spec.controls === undefined) return null;
  const target = currentTarget(spec);
  const send = (change: ControlChange): void => onControlChange(applyChange(target, change));
  const button = (key: string, label: string, active: boolean, onClick: () => void): React.ReactElement =>
    React.createElement(
      "button",
      {
        key,
        type: "button",
        "data-trading-control": key,
        "data-active": active ? "1" : "0",
        onClick,
        style: active ? CONTROL_BUTTON_ACTIVE_STYLE : CONTROL_BUTTON_STYLE,
      },
      label,
    );
  return React.createElement(
    "div",
    { "data-trading-controls": "1", style: CONTROL_BAR_STYLE },
    [
      ...spec.timeframes.map((interval) =>
        button(`interval-${interval}`, interval, interval === target.interval,
          () => send({ kind: "interval", interval }))),
      React.createElement("span", { key: "sep", style: CONTROL_DIVIDER_STYLE }),
      ...TOGGLE_LABELS.map((toggle) =>
        button(`toggle-${toggle.id}`, toggle.label, toggleOn(target, toggle.id),
          () => send({ kind: "toggle", id: toggle.id, on: !toggleOn(target, toggle.id) }))),
    ],
  );
}

// ── 图表 ───────────────────────────────────────────────────────────────────

function TradingChart(props: { spec: ChartSpec; onControlChange?: (target: ControlTarget) => void }): React.ReactElement {
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
        // 机械层挂在 K 线序列上：价位线 + 规则信号/枢轴标记。
        if (series.type === "Candlestick") {
          const candlesApi = api as ISeriesApi<"Candlestick">;
          for (const level of props.spec.levels ?? []) {
            candlesApi.createPriceLine({
              price: level.price,
              color: level.color,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: level.label,
            });
          }
          if (props.spec.markers !== undefined && props.spec.markers.length > 0) {
            createSeriesMarkers(candlesApi, props.spec.markers as never);
          }
        }
      }
    });
    chart.panes().forEach((pane, index) => pane.setStretchFactor(index === 0 ? 2 : 1));

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [props.spec, height]);

  // 工具栏在图外；图例只相对图表区域定位，避免压到工具栏。
  return React.createElement(
    "div",
    { style: { width: "100%" } },
    React.createElement(ControlBar, { spec: props.spec, onControlChange: props.onControlChange }),
    React.createElement(
      "div",
      { style: { position: "relative", width: "100%" } },
      React.createElement("div", {
        ref: containerRef,
        "data-trading-chart": "1",
        style: { width: "100%", height: `${height}px` },
      }),
      React.createElement(LegendOverlay, { legend, notes: props.spec.notes ?? [] }),
    ),
  );
}

/**
 * 图卡：工具栏 + 图表 + 图例，作为可复用模块供侧栏正文渲染。
 *
 * 控件点击直接向宿主端点取一份新 chartSpec；取回的那版只覆盖它基于的 props.spec，
 * 一旦外部（新的模型回合）送来新 spec，自动回到新版。
 */
export function ChartCard(props: { spec: ChartSpec }): React.ReactElement {
  const [local, setLocal] = React.useState<{ base: ChartSpec; spec: ChartSpec } | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);
  const spec = local !== null && local.base === props.spec ? local.spec : props.spec;

  const applyControl = React.useCallback((target: ControlTarget): void => {
    const base = props.spec;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setPending(true);
    setError(null);
    void fetchChartSpec(target).then(
      (next) => {
        if (requestRef.current !== requestId) return;
        setPending(false);
        setLocal({ base, spec: next });
      },
      (reason: unknown) => {
        if (requestRef.current !== requestId) return;
        setPending(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
  }, [props.spec]);

  return React.createElement(
    "div",
    { "data-trading-card": "1", style: { width: "100%", margin: "8px 0" } },
    React.createElement(TradingChart, { spec, onControlChange: applyControl }),
    pending ? React.createElement("div", { "data-trading-pending": "1", style: STATUS_STYLE }, "载入中…") : null,
    error !== null ? React.createElement("div", { "data-trading-error": "1", style: STATUS_STYLE }, error) : null,
  );
}
