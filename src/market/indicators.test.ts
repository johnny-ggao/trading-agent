import { describe, it, expect } from "vitest";
import type { Candle, LinePoint } from "../shared/chartSpec";
import { computeIndicators } from "./indicators";
import { buildChartSpec } from "./chart";

function makeCandles(n: number, start = 1_700_000_000): Candle[] {
  const out: Candle[] = [];
  let price = 30_000;
  for (let i = 0; i < n; i += 1) {
    const open = price;
    const close = open * (1 + Math.sin(i / 7) * 0.004 + 0.0007);
    out.push({
      time: start + i * 3600,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
      volume: 100 + (i % 10),
    });
    price = close;
  }
  return out;
}

describe("computeIndicators", () => {
  it("SMA 取自收盘价并跳过预热期（手算基准）", () => {
    const candles = [1, 2, 3, 4, 5].map((c, i) => ({
      time: 1000 + i * 3600, open: c, high: c, low: c, close: c,
    }));
    const series = computeIndicators(candles, { ma: [3], macd: { fast: 12, slow: 26, signal: 9 }, rsi: 14, volume: false });
    const ma3 = series.find((s) => s.id === "ma3");
    expect(ma3?.data).toEqual([
      { time: 1000 + 2 * 3600, value: 2 },
      { time: 1000 + 3 * 3600, value: 3 },
      { time: 1000 + 4 * 3600, value: 4 },
    ]);
  });

  it("默认指标：主图 MA20/50/200 + 副图 MACD/RSI/量", () => {
    const spec = buildChartSpec("BTCUSDT", "1h", makeCandles(300));
    expect(spec.panes.map((p) => p.id)).toEqual(["price", "volume", "macd", "rsi"]);
    const ids = spec.series.map((s) => s.id);
    for (const id of ["candles", "ma20", "ma50", "ma200", "macd", "macdSignal", "macdHist", "rsi14", "volume"]) {
      expect(ids).toContain(id);
    }
  });

  it("RSI 值落在 0..100", () => {
    const spec = buildChartSpec("BTCUSDT", "1h", makeCandles(300));
    const rsi = spec.series.find((s) => s.id === "rsi14");
    const points = rsi?.data as LinePoint[];
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it("MACD 直方图逐点带颜色", () => {
    const spec = buildChartSpec("BTCUSDT", "1h", makeCandles(300));
    const hist = spec.series.find((s) => s.id === "macdHist");
    const points = hist?.data as LinePoint[];
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(typeof p.color).toBe("string");
  });
});
