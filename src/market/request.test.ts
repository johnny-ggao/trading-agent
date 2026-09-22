import { describe, it, expect } from "vitest";
import { buildMarketView, chartRequestFromQuery, loadChart, type MarketView } from "./request";
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
  it("产出 swing 枢轴与斐波那契位（都只给模型、不上图）", async () => {
    const loaded = await loadChart(fakeProvider(trendCandles), { symbol: "BTC", timeframe: "1h" });
    expect(loaded.candidates.pivots).toEqual([
      { time: 3, price: 13, kind: "high" },
      { time: 8, price: 7, kind: "low" },
    ]);
    expect(loaded.candidates.levels.filter((level) => level.kind === "fib")).toHaveLength(5);
    expect(loaded.spec.levels?.some((level) => level.kind === "support")).toBe(true);
    expect(loaded.spec.levels?.some((level) => level.kind === "fib")).toBe(false);
    // 枢轴点也不画在图上：主图只留 K 线、均线与支撑阻力位。
    expect(loaded.spec.markers).toBeUndefined();
  });

  it("突破信号仍在 ruleSignals 里，但不上图", async () => {
    const loaded = await loadChart(fakeProvider(breakoutCandles), { symbol: "BTC", timeframe: "1h" });
    const breakout = loaded.ruleSignals.find((signal) => signal.kind === "breakout-high");
    expect(breakout?.direction).toBe("bullish");
    expect(loaded.spec.markers).toBeUndefined();
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

describe("buildMarketView（工具用：加市场状态；共振改为按需取）", () => {
  it("出图带上当前周期的市场状态", async () => {
    const view = await buildMarketView(perIntervalProvider({ "1h": rising, "4h": rising }), { symbol: "BTC", timeframe: "1h" });
    expect(view.spec.interval).toBe("1h");
    expect(view.context.trend.state).toBe("trending");
  });

  it("不再为共振多取一次高周期 K 线（按需，见 trading_chart/confidence 的 compareTo）", async () => {
    const asked: string[] = [];
    const provider = {
      fetchCandles: async (_s: string, interval: string) => { asked.push(interval); return rising; },
      fetchDerivatives: async (symbol: string) => ({ symbol }),
    };
    const view = await buildMarketView(provider, { symbol: "BTC", timeframe: "1h" });
    expect(asked).toEqual(["1h"]);          // 只取了当前周期
    expect(view.resonance).toBeUndefined(); // 出图不夹带共振
  });
});

// ── 只用已收盘 K 线判定（工单 07 剩余项）────────────────────────────────────

const HOUR = 3_600;

/** 第 i 小时的 K 线时间（秒）。 */
const hourTime = (i: number): number => i * HOUR;

/** 末根形成中的那 4 根：前 3 根平淡，第 4 根（形成中）是「突破」。 */
const formingTail: Candle[] = [
  { time: hourTime(0), open: 10, high: 10, low: 10, close: 10, volume: 1 },
  { time: hourTime(1), open: 10, high: 10, low: 10, close: 10, volume: 1 },
  { time: hourTime(2), open: 10, high: 10, low: 10, close: 10, volume: 1 },
  { time: hourTime(3), open: 30, high: 30, low: 30, close: 30, volume: 9 },
];

/**
 * 先跌后回升、末根（形成中）继续上冲：已收盘数据里 RSI(14) 在 28h 只是 30.3（未超买），
 * 一旦末根收盘就同时给出 RSI 超买与向上突破——正好用来分辨「谁在触发信号」。
 */
const formingReversal: Candle[] = Array.from({ length: 30 }, (_, i) => {
  const close = i < 20 ? 100 - i : i === 29 ? 100 : 81 + (i - 20) * 0.5;
  return { time: hourTime(i), open: close, high: close, low: close, close, volume: 1 };
});

/** now 取末根覆盖区间 [3h, 4h) 的正中间，保证末根被判定为形成中。 */
const tailNow = 3.5 * HOUR * 1000;

function viewOf(candles: Candle[], timeframe = "1h", now = tailNow): Promise<MarketView> {
  return buildMarketView(
    perIntervalProvider({ "1h": candles, "4h": candles }),
    { symbol: "BTC", timeframe, rsi: 14 },
    { now },
  );
}

describe("机械判断只用已收盘 K 线", () => {
  it("形成中的末根不触发突破，已收盘的同一形态才触发", async () => {
    const forming = await viewOf(formingTail, "1h", 3.5 * HOUR * 1000);
    expect(forming.ruleSignals).toEqual([]);
    expect(forming.candidates.lastPrice).toBe(10);

    // 同样 4 根，但把 now 推到末根收盘之后：突破成立。
    const closed = await viewOf(formingTail, "1h", 4 * HOUR * 1000);
    expect(closed.ruleSignals.map((signal) => signal.kind)).toEqual(["breakout-high"]);
    expect(closed.candidates.lastPrice).toBe(30);
  });

  it("形成中的末根不参与 RSI 极值判定", async () => {
    const forming = await viewOf(formingReversal, "1h", 29.5 * HOUR * 1000);
    const formingKinds = forming.ruleSignals.map((signal) => signal.kind);
    expect(formingKinds).toContain("rsi-oversold");
    expect(formingKinds).not.toContain("rsi-overbought");

    // 把 now 推过末根收盘：同一根 K 线收盘后才给出超买。
    const closed = await viewOf(formingReversal, "1h", 30 * HOUR * 1000);
    expect(closed.ruleSignals.map((signal) => signal.kind)).toContain("rsi-overbought");
  });

  it("形成中的末根仍画在图上，但它的指标点被截掉", async () => {
    const view = await viewOf(formingReversal, "1h", 29.5 * HOUR * 1000);
    expect(view.formingBars).toBe(1);
    expect(view.spec.formingBars).toBe(1);

    const candlesSeries = view.spec.series.find((series) => series.id === "candles")!;
    expect(candlesSeries.data.map((point) => point.time)).toEqual(formingReversal.map((candle) => candle.time));

    const rsiTimes = view.spec.series.find((series) => series.id === "rsi14")!.data.map((point) => point.time);
    expect(rsiTimes.length).toBeGreaterThan(0);
    expect(Math.max(...rsiTimes)).toBe(hourTime(28));

    const volumeSeries = view.spec.series.find((series) => series.id === "volume")!;
    expect(volumeSeries.data.at(-1)!.time).toBe(hourTime(28));
  });

  it("末根已收盘时没有形成中根，指标点保留到末根", async () => {
    const view = await viewOf(formingReversal, "1h", 30 * HOUR * 1000);
    expect(view.formingBars).toBe(0);
    expect(view.spec.formingBars).toBe(0);
    const volumeSeries = view.spec.series.find((series) => series.id === "volume")!;
    expect(volumeSeries.data.at(-1)!.time).toBe(hourTime(29));
  });

  it("市场状态与共振都只用已收盘 K 线", async () => {
    const bars: Candle[] = Array.from({ length: 400 }, (_, i) => {
      const close = 100 + i;
      return { time: hourTime(i), open: close - 1, high: close + 1, low: close - 1, close, volume: 10 };
    });
    const view = await buildMarketView(
      perIntervalProvider({ "1h": bars, "4h": bars }),
      { symbol: "BTC", timeframe: "1h" },
      { now: (399.5 * HOUR) * 1000 }, // 末根（399h）形成中
    );
    expect(view.formingBars).toBe(1);
    // 已收盘数据到 398h 为止；形成中的 399h 那根高点 499 不应进入判断。
    const highs = view.candidates.pivots.filter((pivot) => pivot.kind === "high").map((pivot) => pivot.price);
    expect(highs).not.toContain(499);
  });
});


