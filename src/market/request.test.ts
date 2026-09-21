import { describe, it, expect } from "vitest";
import { chartRequestFromQuery, loadChart } from "./request";
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
