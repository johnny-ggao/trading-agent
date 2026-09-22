import { describe, it, expect } from "vitest";
import { HyperliquidProvider, HL_RETENTION_LIMIT, hlInterval } from "./hyperliquid";
import type { Candle, FetchLike, HttpResponseLike } from "./types";

const HOUR_MS = 3_600_000;

/** 复刻 HL `candleSnapshot` 的真实响应形状：价格是**字符串**，time 是毫秒。 */
function klines(count: number, startMs: number, stepMs = HOUR_MS): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    t: startMs + i * stepMs,
    T: startMs + i * stepMs + stepMs - 1,
    s: "BTC",
    i: "1h",
    o: "100.5",
    c: "101.25",
    h: "102",
    l: "99.5",
    v: "12.5",
    n: 42,
  }));
}

/** 假 fetch：同时记录 URL 与请求体，便于断言"发了什么"。 */
function fakeFetch(payload: unknown, status = 200): { fetch: FetchLike; bodies: string[]; urls: string[] } {
  const bodies: string[] = [];
  const urls: string[] = [];
  const fetchImpl = (async (url: string, init?: { body?: string }) => {
    urls.push(url);
    bodies.push(init?.body ?? "");
    return {
      status,
      headers: { get: () => null },
      json: async () => payload,
    } as HttpResponseLike;
  }) as unknown as FetchLike;
  return { fetch: fetchImpl, bodies, urls };
}

describe("Hyperliquid 周期映射", () => {
  it("原样保留 HL 支持的周期", () => {
    expect(hlInterval("15m")).toBe("15m");
    expect(hlInterval("1h")).toBe("1h");
    expect(hlInterval("4h")).toBe("4h");
    expect(hlInterval("1d")).toBe("1d");
    expect(hlInterval("1w")).toBe("1w");
  });

  it("HL 不支持的周期抛错，而不是悄悄换一个", () => {
    // 1s / 2d 都不在 HL 的周期表里（Binance 现货有 1s，容易误传）。
    expect(() => hlInterval("1s")).toThrow(/1s/);
    expect(() => hlInterval("2d")).toThrow(/2d/);
  });
});

describe("HyperliquidProvider.fetchCandles", () => {
  const start = 1_700_000_000_000;

  it("解析 K 线：毫秒时间转秒、字符串价格转数字", async () => {
    const { fetch } = fakeFetch(klines(3, start));
    const provider = new HyperliquidProvider({ fetch });
    const candles: Candle[] = await provider.fetchCandles("BTC", "1h");
    expect(candles).toHaveLength(3);
    expect(candles[0]).toEqual({
      time: start / 1000,
      open: 100.5,
      high: 102,
      low: 99.5,
      close: 101.25,
      volume: 12.5,
    });
  });

  it("把请求体作为 candleSnapshot 发出去（含币种与周期）", async () => {
    const { fetch, bodies, urls } = fakeFetch(klines(1, start));
    const provider = new HyperliquidProvider({ fetch });
    await provider.fetchCandles("BTC", "1h", { limit: 10 });
    expect(urls[0]).toContain("/info");
    const body = JSON.parse(bodies[0]!) as { type: string; req: Record<string, unknown> };
    expect(body.type).toBe("candleSnapshot");
    expect(body.req.coin).toBe("BTC");
    expect(body.req.interval).toBe("1h");
  });

  it("HTTP 错误时抛出带状态码的错误", async () => {
    const { fetch } = fakeFetch({}, 500);
    const provider = new HyperliquidProvider({ fetch });
    await expect(provider.fetchCandles("BTC", "1h")).rejects.toThrow(/500/);
  });
});

describe("HyperliquidProvider 的保留上限（必须诚实暴露）", () => {
  const start = 1_700_000_000_000;

  it("要求超过 5000 根时，最多给 5000 并明确标注截断", async () => {
    const { fetch } = fakeFetch(klines(HL_RETENTION_LIMIT, start));
    const provider = new HyperliquidProvider({ fetch });
    const batch = await provider.fetchCandleBatch("BTC", "1h", { limit: 6_000 });
    expect(batch.source).toBe("hyperliquid");
    expect(batch.retentionLimit).toBe(HL_RETENTION_LIMIT);
    expect(batch.candles.length).toBeLessThanOrEqual(HL_RETENTION_LIMIT);
    expect(batch.truncated).toBe(true);
    expect(batch.note).toContain("5000");
  });

  it("请求窗口完全在保留范围内时不报截断", async () => {
    const { fetch } = fakeFetch(klines(100, start));
    const provider = new HyperliquidProvider({ fetch });
    const batch = await provider.fetchCandleBatch("BTC", "1h", { limit: 100 });
    expect(batch.truncated).toBe(false);
    expect(batch.note).toBeUndefined();
    expect(batch.candles).toHaveLength(100);
  });

  it("返回空数组且请求了更早历史时，明确说明超出保留窗口（不静默）", async () => {
    const { fetch } = fakeFetch([]);
    const provider = new HyperliquidProvider({ fetch });
    const batch = await provider.fetchCandleBatch("BTC", "1h", {
      limit: 500,
      endTime: start - 10 * HL_RETENTION_LIMIT * HOUR_MS,
    });
    expect(batch.candles).toEqual([]);
    expect(batch.truncated).toBe(true);
    expect(batch.note).toBeTruthy();
  });

  it("fetchCandles 仍返回裸数组（接口兼容）", async () => {
    const { fetch } = fakeFetch(klines(2, start));
    const provider = new HyperliquidProvider({ fetch });
    expect(await provider.fetchCandles("BTC", "1h")).toHaveLength(2);
  });
});

/** 复刻官方文档里 `metaAndAssetCtxs` 的响应形状：universe 与 assetCtxs 按下标对齐。 */
function metaAndAssetCtxs(): unknown[] {
  return [
    { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 50 }, { name: "ETH", szDecimals: 4, maxLeverage: 50 }] },
    [
      {
        funding: "0.0000125",
        openInterest: "688.11",
        prevDayPx: "15.322",
        dayNtlVlm: "1169046.29406",
        premium: "0.00031774",
        oraclePx: "14.32",
        markPx: "14.3161",
        midPx: "14.314",
        impactPxs: ["14.3161", "14.3205"],
        dayBaseVlm: "80000.5",
      },
      { funding: "0.00002", openInterest: "1882.55", markPx: "6.0436", oraclePx: "6.05" },
    ],
  ];
}

describe("HyperliquidProvider.fetchDerivatives", () => {
  it("一次调用带回资金费/OI/标记价/预言机价/溢价/冲击价/24h 量价", async () => {
    const { fetch, bodies } = fakeFetch(metaAndAssetCtxs());
    const provider = new HyperliquidProvider({ fetch });
    const snapshot = await provider.fetchDerivatives("BTC");
    expect(JSON.parse(bodies[0]!).type).toBe("metaAndAssetCtxs");
    expect(snapshot).toEqual({
      symbol: "BTC",
      source: "hyperliquid",
      fundingIntervalHours: 1,
      funding: 0.0000125,
      premium: 0.00031774,
      openInterest: 688.11,
      markPrice: 14.3161,
      oraclePrice: 14.32,
      midPrice: 14.314,
      dayNotionalVolume: 1169046.29406,
      dayBaseVolume: 80000.5,
      prevDayPrice: 15.322,
      impactPrices: [14.3161, 14.3205],
    });
  });

  it("按币种取对应的上下文（下标对齐，不串味）", async () => {
    const { fetch } = fakeFetch(metaAndAssetCtxs());
    const provider = new HyperliquidProvider({ fetch });
    const eth = await provider.fetchDerivatives("ETH");
    expect(eth.markPrice).toBe(6.0436);
    expect(eth.openInterest).toBe(1882.55);
    expect(eth.impactPrices).toBeUndefined();
  });

  it("未上市的币种明确报错", async () => {
    const { fetch } = fakeFetch(metaAndAssetCtxs());
    const provider = new HyperliquidProvider({ fetch });
    await expect(provider.fetchDerivatives("DOGE")).rejects.toThrow(/DOGE/);
  });

  it("响应形状不对时报错，而不是静默给 undefined", async () => {
    const { fetch } = fakeFetch({ unexpected: true });
    const provider = new HyperliquidProvider({ fetch });
    await expect(provider.fetchDerivatives("BTC")).rejects.toThrow(/metaAndAssetCtxs/);
  });
});
