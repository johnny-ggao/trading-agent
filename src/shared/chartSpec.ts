export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LinePoint {
  time: number;
  value: number;
  /** 直方图可选的逐点颜色。 */
  color?: string;
}

export type SeriesType = "candlestick" | "line" | "histogram";

export interface SeriesSpec {
  id: string;
  type: SeriesType;
  pane: string;
  data: Array<Candle | LinePoint>;
  options?: Record<string, unknown>;
  /** 图例显示名（如 MA20 / DIF / RSI(14)）。 */
  label?: string;
}

export interface PaneSpec {
  id: string;
  title?: string;
}

/** 图卡控件回传目标状态时需要的当前指标开关。 */
export interface ChartControls {
  /** 当前均线周期。 */
  ma: number[];
  /** RSI 周期；null 表示关闭。 */
  rsi: number | null;
  bollinger: boolean;
  kdj: boolean;
  atr: boolean;
}

/** 图上标记（可序列化；客户端映射到 lightweight-charts 的 series markers）。 */
export interface ChartMarker {
  time: number;
  position: "aboveBar" | "belowBar" | "inBar" | "atPriceTop" | "atPriceBottom" | "atPriceMiddle";
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  color: string;
  text?: string;
  /** atPrice* 定位时必填：标记的精确价格。 */
  price?: number;
}

/** 水平价位线：支撑、阻力或斐波那契位。 */
export interface ChartLevel {
  price: number;
  label: string;
  kind: "support" | "resistance" | "fib";
  color: string;
}

/** 宿主 ↔ 客户端唯一契约：宿主产出它，客户端把它渲染出来。 */
export interface ChartSpec {
  symbol: string;
  interval: string;
  timeframes: string[];
  panes: PaneSpec[];
  series: SeriesSpec[];
  formingBar?: boolean;
  /** 图卡控件的当前状态；缺省表示不渲染控件。 */
  controls?: ChartControls;
  /** 规则信号等机械事件在价格图上的标记。 */
  markers?: ChartMarker[];
  /** 支撑/阻力/斐波那契等水平价位线。 */
  levels?: ChartLevel[];
  /** 图上说明文字（如均线排列）。 */
  notes?: string[];
}
