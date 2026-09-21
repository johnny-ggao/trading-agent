import { describe, it, expect } from "vitest";
import { buildMarketView, chartRequestFromQuery, loadChart } from "./request";
import type { Candle } from "../shared/chartSpec";
import type { MarketDataProvider } from "./types";

const candles: Candle[] = [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }];

function fakeProvider(data: Candle[] = candles): MarketDataProvider {
  return {
    fetchCandles: async () => data,
    fetchDerivatives: async (symbol) => ({ symbol }),
  };
}

describe("图卡控件查询串 → 图表请求", () => {
  it("解析 symbol / 周期 / 指标开关", () => {
    const request = chartRequestFromQuery(new URLSearchParams(
      "symbol=eth&interval=4h&ma=50,200&rsi=14&bollinger=true&kdj=true&atr=true",
    ));
    expect(request).toEqual({
      symbol: "eth", timeframe: "4h", ma: [50, 200], rsi: 14,
      bollinger: true, kdj: true, atr: true,
    });
  });

  it("缺省字段留空，开关默认关闭", () => {
    const request = chartRequestFromQuery(new URLSearchParams(""));
    expect(request.symbol).toBeUndefined();
    expect(request.timeframe).toBeUndefined();
    expect(request.ma).toBeUndefined();
    expect(request.bollinger).toBe(false);
  });
});

describe("loadChart（工具与 HTTP 端点共用）", () => {
  it("解析请求、取数并产出 chartSpec 与渲染所需信息", async () => {
    const loaded = await loadChart(fakeProvider(), { symbol: "eth", timeframe: "4h" });
    expect(loaded.spec.symbol).toBe("ETHUSDT");
    expect(loaded.resolved.interval).toBe("4h");
    expect(loaded.bars).toBe(1);
    expect(loaded.spec.controls?.bollinger).toBe(false);
    expect(loaded.spec.series.some((series) => series.id === "candles")).toBe(true);
  });
});

/** 11 根：第 3 根高点 13、第 8 根低点 7。 */
const trendCandles: Candle[] = [
  { time: 0, open: 10, high: 10, low: 9, close: 10 },
  { time: 1, open: 10, high: 11, low: 10, close: 11 },
  { time: 2, open: 11, high: 12, low: 11, close: 12 },
  { time: 3, open: 12, high: 13, low: 12, close: 13 },
  { time: 4, open: 13, high: 12, low: 11, close: 12 },
  { time: 5, open: 12, high: 11, low: 10, close: 11 },
  { time: 6, open: 11, high: 10, low: 9, close: 10 },
  { time: 7, open: 10, high: 9, low: 8, close: 9 },
  { time: 8, open: 9, high: 8, low: 7, close: 8 },
  { time: 9, open: 8, high: 9, low: 8, close: 9 },
  { time: 10, open: 9, high: 10, low: 9, close: 10 },
];

/** 5 根：最后一根收 12.5，突破前 3 根的高点 12。 */
const breakoutCandles: Candle[] = [
  { time: 0, open: 9, high: 10, low: 8, close: 9 },
  { time: 1, open: 10, high: 11, low: 9, close: 10 },
  { time: 2, open: 11, high: 12, low: 10, close: 11 },
  { time: 3, open: 10, high: 11, low: 9, close: 10 },
  { time: 4, open: 12, high: 13, low: 11, close: 12.5 },
];

describe("loadChart 的机械层", () => {
  it("产出 swing 枢轴与斐波那契位", async () => {
    const loaded = await loadChart(fakeProvider(trendCandles), { symbol: "BTC", timeframe: "1h" });
    expect(loaded.candidates.pivots).toEqual([
      { time: 3, price: 13, kind: "high" },
      { time: 8, price: 7, kind: "low" },
    ]);
    expect(loaded.candidates.levels.filter((level) => level.kind === "fib")).toHaveLength(5);
    expect(loaded.spec.levels?.some((level) => level.kind === "support")).toBe(true);
    expect(loaded.spec.levels?.some((level) => level.kind === "fib")).toBe(true);
    expect(loaded.spec.markers).toEqual([
      { time: 3, position: "atPriceMiddle", shape: "circle", color: "#ef5350", price: 13 },
      { time: 8, position: "atPriceMiddle", shape: "circle", color: "#26a69a", price: 7 },
    ]);
  });

  it("把突破信号写进 ruleSignals 与 chartSpec.markers", async () => {
    const loaded = await loadChart(fakeProvider(breakoutCandles), { symbol: "BTC", timeframe: "1h" });
    const breakout = loaded.ruleSignals.find((signal) => signal.kind === "breakout-high");
    expect(breakout?.direction).toBe("bullish");
    expect(loaded.spec.markers).toEqual([
      { time: 4, position: "belowBar", shape: "arrowUp", color: "#26a69a", text: "突破前高" },
    ]);
  });
});

const rising = Array.from({ length: 40 }, (_, i): Candle => {
  const close = 100 + i;
  return { time: i, open: i === 0 ? close : 100 + i - 1, high: close + 0.5, low: close - 0.5, close, volume: 10 };
});

function perIntervalProvider(map: Record<string, Candle[]>): MarketDataProvider {
  return {
    fetchCandles: async (_symbol, interval) => map[interval] ?? [],
    fetchDerivatives: async (symbol) => ({ symbol }),
  };
}

describe("buildMarketView（工具用：加市场状态与共振）", () => {
  it("当前周期图表 + 市场状态 + 高一级周期共振", async () => {
    const view = await buildMarketView(perIntervalProvider({ "1h": rising, "4h": rising }), { symbol: "BTC", timeframe: "1h" });
    expect(view.spec.interval).toBe("1h");
    expect(view.context.trend.state).toBe("trending");
    expect(view.resonance.higherInterval).toBe("4h");
    expect(view.resonance.aligned).toBe(true);
    expect(view.resonance.summary).toContain("共振向上");
  });
});


