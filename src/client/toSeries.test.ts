import { describe, it, expect } from "vitest";
import { toLightweightPanes } from "./toSeries";
import type { ChartSpec } from "../shared/chartSpec";

describe("chartSpec → Lightweight Charts 映射", () => {
  const spec: ChartSpec = {
    symbol: "BTCUSDT",
    interval: "1h",
    timeframes: ["15m", "1h", "4h", "1d"],
    panes: [
      { id: "price", title: "价格" },
      { id: "rsi", title: "RSI" },
    ],
    series: [
      { id: "candles", type: "candlestick", pane: "price", data: [{ time: 1, open: 1, high: 2, low: 0, close: 1.5 }] },
      { id: "ma20", type: "line", pane: "price", data: [{ time: 1, value: 1.2 }], options: { color: "#888" } },
      { id: "rsi14", type: "line", pane: "rsi", data: [{ time: 1, value: 55 }] },
    ],
  };

  it("按窗格分组，并保留窗格顺序", () => {
    expect(toLightweightPanes(spec).map((p) => p.id)).toEqual(["price", "rsi"]);
  });

  it("把领域类型映射为 Lightweight Charts 的 series 定义名", () => {
    const panes = toLightweightPanes(spec);
    expect(panes[0]!.series.map((s) => s.type)).toEqual(["Candlestick", "Line"]);
    expect(panes[1]!.series.map((s) => s.type)).toEqual(["Line"]);
  });

  it("原样保留数据与 options", () => {
    const panes = toLightweightPanes(spec);
    expect(panes[0]!.series[1]!.options).toEqual({ color: "#888" });
    expect(panes[0]!.series[1]!.data).toEqual([{ time: 1, value: 1.2 }]);
  });

  it("未知窗格归入第一个窗格，而不是丢弃", () => {
    const stray: ChartSpec = { ...spec, series: [{ id: "x", type: "line", pane: "nope", data: [] }] };
    expect(toLightweightPanes(stray)[0]!.series.map((s) => s.id)).toEqual(["x"]);
  });

  it("formingBars 让尾部 K 线带上弱化色，指标线不受影响", () => {
    const forming: ChartSpec = {
      ...spec,
      formingBars: 1,
      series: [
        {
          id: "candles",
          type: "candlestick",
          pane: "price",
          data: [
            { time: 1, open: 1, high: 2, low: 0, close: 1.5 },
            { time: 2, open: 2, high: 3, low: 1, close: 1.6 },
          ],
        },
        { id: "ma20", type: "line", pane: "price", data: [{ time: 2, value: 1.2 }] },
      ],
    };
    const panes = toLightweightPanes(forming);
    const candles = panes[0]!.series.find((s) => s.id === "candles")!.data as Array<{ time: number; color?: string }>;
    expect(candles[0]!.color).toBeUndefined();
    expect(candles[1]!.color).toBeDefined();
    expect(panes[0]!.series.find((s) => s.id === "ma20")!.data).toEqual([{ time: 2, value: 1.2 }]);
  });
});
