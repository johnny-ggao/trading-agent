import { describe, it, expect } from "vitest";
import { requestIndicatorFacts, requestLevelFacts } from "./facts";
import type { Candle } from "../shared/chartSpec";
import type { MarketDataProvider } from "./types";

const HOUR = 3_600;

/** 40 根已收盘（time 0..39h），now 取 40h 之后，所以没有形成中的 K 线。 */
function provider(data: Candle[]): MarketDataProvider {
  return { fetchCandles: async () => data, fetchDerivatives: async (symbol) => ({ symbol }) };
}

const ramp: Candle[] = Array.from({ length: 40 }, (_, i) => ({
  time: i * HOUR,
  open: i,
  high: i + 0.5,
  low: i - 0.5,
  close: i,
  volume: 10,
}));

const NOW = 41 * HOUR * 1000;

describe("requestIndicatorFacts：工具层的成功与失败形状", () => {
  it("成功时回 ok=true 并带 grounding", async () => {
    const result = await requestIndicatorFacts(provider(ramp), {
      symbol: "BTC", interval: "1h", indicators: [{ id: "ma", period: 3 }],
    }, { now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.grounding).toEqual({
      lastClosedBar: 39 * HOUR,
      formingBars: 0,
      barsUsed: 40,
      closedOnly: true,
    });
    expect(result.indicators.map((fact) => fact.id)).toEqual(["ma"]);
  });

  it("窗口不足以支撑预热期时明确报数据不足，而不是给一个垃圾数", async () => {
    const result = await requestIndicatorFacts(provider(ramp), {
      symbol: "BTC", interval: "1h", indicators: [{ id: "ma", period: 200 }],
    }, { now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.reason).toBe("insufficient_closed_bars");
    expect(result.required).toBe(200);
    expect(result.available).toBe(40);
    expect(result.hint).toBeTruthy();
  });

  it("请求为空时明确报错", async () => {
    const result = await requestIndicatorFacts(provider(ramp), {
      symbol: "BTC", interval: "1h", indicators: [],
    }, { now: NOW });
    expect(result.ok).toBe(false);
  });
});

describe("requestLevelFacts：工具层形状", () => {
  it("回 ok=true 并带 grounding 与 counts", async () => {
    const result = await requestLevelFacts(provider(ramp), {
      symbol: "BTC", interval: "1h", kinds: ["support"],
    }, { now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.grounding.barsUsed).toBe(40);
    expect(result.counts).toHaveProperty("support");
  });

  it("K 线太少时不报错，而是明确说这一档数据撑不起价位判断", async () => {
    const result = await requestLevelFacts(provider(ramp.slice(0, 3)), {
      symbol: "BTC", interval: "1h", kinds: ["support", "resistance"],
    }, { now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.required).toBeGreaterThan(3);
    expect(result.available).toBe(3);
  });
});
