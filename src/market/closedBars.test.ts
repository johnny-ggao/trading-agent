import { describe, it, expect } from "vitest";
import { closedBars } from "./facts";
import type { Candle, CandleBatch } from "./types";
import type { MarketDataProvider } from "./types";

const HOUR = 3_600;

/** 提供 N 根已收盘 K 线；**尊重 limit**，像真实 provider 一样。 */
function limitedProvider(total: number, options: { batch?: boolean } = {}): { provider: MarketDataProvider; asked: number[] } {
  const asked: number[] = [];
  const candles: Candle[] = Array.from({ length: total }, (_, i) => ({
    time: i * HOUR, open: i, high: i + 1, low: i - 1, close: i, volume: 1,
  }));
  const provider: MarketDataProvider = {
    fetchCandles: async (_s, _i, opts) => {
      const limit = opts?.limit ?? 500;
      asked.push(limit);
      return candles.slice(-limit);
    },
    fetchDerivatives: async (symbol) => ({ symbol }),
  };
  if (options.batch === true) {
    provider.fetchCandleBatch = async (_s, _i, opts): Promise<CandleBatch> => {
      const limit = opts?.limit ?? 500;
      asked.push(limit);
      return { source: "test", candles: candles.slice(-limit), truncated: false };
    };
  }
  return { provider, asked };
}

const NOW = 20_000 * HOUR * 1000;

describe("closedBars：取数与判定同一个 needs", () => {
  it("按 needs 取足，而不是按默认篮子", async () => {
    const { provider, asked } = limitedProvider(1_500);
    const result = await closedBars(provider, { symbol: "BTC", interval: "1h", needs: 900 }, { now: NOW });
    // 默认篮子 1h 只要 720；要 900 根的请求必须真的去取 ≥900。
    expect(asked[0]).toBeGreaterThanOrEqual(900);
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.value.candles.length).toBeGreaterThanOrEqual(900);
  });

  it("请求远小于默认篮子时，不缩小现有上下文", async () => {
    const { provider, asked } = limitedProvider(1_500);
    await closedBars(provider, { symbol: "BTC", interval: "1h", needs: 14 }, { now: NOW });
    expect(asked[0]).toBe(720);
  });

  it("真的不够时明确报缺，而不是取到默认上限就下结论", async () => {
    const { provider } = limitedProvider(300);
    const result = await closedBars(provider, { symbol: "BTC", interval: "1h", needs: 900 }, { now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.error.required).toBe(900);
    expect(result.error.available).toBeLessThan(900);
  });

  it("优先用 fetchCandleBatch，并把截断说明带出来", async () => {
    const { provider } = limitedProvider(400, { batch: true });
    const result = await closedBars(provider, { symbol: "BTC", interval: "1h", needs: 100 }, { now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.value.grounding.source).toBe("test");
    expect(result.value.grounding.truncated).toBe(false);
  });

  it("grounding 说明用了多少根、只取已收盘", async () => {
    const { provider } = limitedProvider(800);
    const result = await closedBars(provider, { symbol: "BTC", interval: "1h", needs: 100 }, { now: NOW });
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.value.grounding.closedOnly).toBe(true);
    expect(result.value.grounding.barsUsed).toBe(result.value.candles.length);
    expect(result.value.grounding.lastClosedBar).toBe(result.value.candles.at(-1)!.time);
  });
});

describe("撞上取数上限时的说法要能纠正", () => {
  it("超过单次上限时：说清是上限，并给出更大周期能覆盖的跨度", async () => {
    const { provider } = limitedProvider(5_000);
    const result = await closedBars(provider, { symbol: "BTC", interval: "1h", needs: 1_500 }, { now: NOW });
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.error.hint).toContain("1000");     // 单次上限
    expect(result.error.hint).toContain("1h");
    expect(result.error.hint).toContain("4h");       // 更大的周期能覆盖更长的历史
    expect(result.error.hint).toContain("42 天");    // 1000×1h 的跨度
  });

  it("已收盘根数本身不足时：给实际数量，不谎称是上限问题", async () => {
    const { provider } = limitedProvider(50);
    const result = await closedBars(provider, { symbol: "BTC", interval: "1h", needs: 900 }, { now: NOW });
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.error.hint).not.toContain("单次最多");
    expect(result.error.hint).toContain("50");
    expect(result.error.hint).toContain("900");
  });

  it("1w 之上没有更大周期，就不提换周期", async () => {
    const { provider } = limitedProvider(100);
    const result = await closedBars(provider, { symbol: "BTC", interval: "1w", needs: 900 }, { now: NOW });
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.error.hint).not.toContain("＞");
  });
});
