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
}

export interface PaneSpec {
  id: string;
  title?: string;
}

/** 宿主 ↔ 客户端唯一契约：宿主产出它，客户端把它渲染出来。 */
export interface ChartSpec {
  symbol: string;
  interval: string;
  timeframes: string[];
  panes: PaneSpec[];
  series: SeriesSpec[];
  formingBar?: boolean;
}
