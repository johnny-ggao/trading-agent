import { describe, it, expect } from "vitest";
import { BinanceProvider, parseKlines } from "./binance";
import type { FetchLike, HttpResponseLike } from "./types";

const kline = (openTime: number, close: number) => [
  openTime, "1", "2", "0.5", String(close), "10", openTime + 3_599_999, "0", 0, "0", "0", "0",
];

function res(body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponseLike {
  return { status, headers: { get: (n) => headers[n.toLowerCase()] ?? null }, json: async () => body };
}

describe("parseKlines", () => {
  it("把 Binance 数组解析为领域 Candle（time 用秒）", () => {
    expect(parseKlines([kline(1_700_000_000_000, 101)])).toEqual([
      { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 101, volume: 10 },
    ]);
  });
});

describe("BinanceProvider.fetchCandles", () => {
  it("请求正确的 symbol/interval/limit 并解析", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      return res([kline(1_700_000_000_000, 101)]);
    };
    const provider = new BinanceProvider({ fetch: fetchImpl, cacheTtlMs: 0 });
    const candles = await provider.fetchCandles("btc", "1h", { limit: 1 });
    expect(candles).toHaveLength(1);
    expect(urls[0]).toContain("symbol=BTCUSDT");
    expect(urls[0]).toContain("interval=1h");
    expect(urls[0]).toContain("limit=1");
  });

  it("429 时按 Retry-After 退避后重试", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls === 1) return res({}, 429, { "retry-after": "2" });
      return res([kline(1_700_000_000_000, 101)]);
    };
    const provider = new BinanceProvider({
      fetch: fetchImpl,
      sleep: async (ms) => { sleeps.push(ms); },
      cacheTtlMs: 0,
    });
    const candles = await provider.fetchCandles("BTC", "1h", { limit: 1 });
    expect(candles).toHaveLength(1);
    expect(calls).toBe(2);
    expect(sleeps[0]).toBe(2000);
  });

  it("TTL 内命中缓存，不再发请求", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return res([kline(1_700_000_000_000, 101)]);
    };
    const provider = new BinanceProvider({ fetch: fetchImpl, cacheTtlMs: 60_000, now: () => 1000 });
    await provider.fetchCandles("BTC", "1h", { limit: 1 });
    await provider.fetchCandles("BTC", "1h", { limit: 1 });
    expect(calls).toBe(1);
  });
});
