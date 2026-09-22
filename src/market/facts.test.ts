import { describe, it, expect } from "vitest";
import { requestDerivatives, requestIndicatorFacts, requestLevelFacts, requestResonance } from "./facts";
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

describe("requestResonance：周期对由调用方指定", () => {
  /** 两个周期各自的 K 线：1d 陡升、1w 平盘，用来区分方向。 */
  const dailyUp: Candle[] = Array.from({ length: 60 }, (_, i) => ({
    time: i * 86_400, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1,
  }));
  const weeklyFlat: Candle[] = Array.from({ length: 60 }, (_, i) => ({
    time: i * 604_800, open: 100 + (i % 2), high: 101 + (i % 2), low: 99, close: 100 + (i % 2), volume: 1,
  }));
  const byInterval: MarketDataProvider = {
    fetchCandles: async (_symbol, interval) => (interval === "1d" ? dailyUp : weeklyFlat),
    fetchDerivatives: async (symbol: string) => ({ symbol }),
  };

  it("按指定周期对比较，并回 grounding", async () => {
    const result = await requestResonance(byInterval, { symbol: "BTC", interval: "1d", compareTo: "1w" }, { now: 70 * 86_400 * 1000 });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.higherInterval).toBe("1w");
    expect(result.currentInterval).toBe("1d");
    expect(result.grounding.closedOnly).toBe(true);
    expect(typeof result.summary).toBe("string");
  });

  it("不指定 compareTo 时按默认高一级周期（1d → 1w）", async () => {
    const result = await requestResonance(byInterval, { symbol: "BTC", interval: "1d" }, { now: 70 * 86_400 * 1000 });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.higherInterval).toBe("1w");
  });

  it("周期对拉得很远（15m 对 1w）也不报错", async () => {
    const result = await requestResonance(byInterval, { symbol: "BTC", interval: "15m", compareTo: "1w" }, { now: 70 * 604_800 * 1000 });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.currentInterval).toBe("15m");
    expect(result.higherInterval).toBe("1w");
  });

  it("高周期数据不足时明确报缺", async () => {
    const thin: MarketDataProvider = {
      fetchCandles: async (_symbol, interval) => (interval === "1w" ? dailyUp.slice(0, 2) : dailyUp),
      fetchDerivatives: async (symbol: string) => ({ symbol }),
    };
    const result = await requestResonance(thin, { symbol: "BTC", interval: "1d", compareTo: "1w" }, { now: 70 * 86_400 * 1000 });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.required).toBeGreaterThan(2);
    expect(result.available).toBe(2);
  });
});

describe("requestDerivatives：资金费/OI/预言机价与 HL 独有项", () => {
  const metaCtx = [
    { universe: [{ name: "BTC" }] },
    [{
      funding: "0.0000125", openInterest: "688.11", markPx: "14.3161", oraclePx: "14.32",
      midPx: "14.314", premium: "0.00031774", impactPxs: ["14.3161", "14.3205"],
      dayNtlVlm: "1169046.29", dayBaseVlm: "80000.5", prevDayPx: "15.322",
    }],
  ];
  const predicted = [["BTC", [["BinPerp", { fundingRate: "0.00008", nextFundingTime: 1 }],
                             ["HlPerp", { fundingRate: "-0.000002", nextFundingTime: 2 }]]]];

  /** 按请求体 type 分派的假 HL 服务。 */
  function hlProvider(oiCap: unknown = ["BADGER"]): MarketDataProvider {
    return {
      fetchCandles: async () => [],
      fetchDerivatives: async (symbol: string) => ({ symbol }),
      fetchCandleBatch: async () => ({ source: "hyperliquid", candles: [], truncated: false }),
    } as unknown as MarketDataProvider;
  }

  it("从 Hyperliquid 取快照，并带上跨场所预测资金费与 OI 上限", async () => {
    const { HyperliquidProvider } = await import("./hyperliquid");
    const calls: string[] = [];
    const provider = new HyperliquidProvider({
      fetch: (async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? "{}") as { type: string };
        calls.push(body.type);
        const payload = body.type === "metaAndAssetCtxs" ? metaCtx
          : body.type === "predictedFundings" ? predicted
            : body.type === "perpsAtOpenInterestCap" ? ["BADGER"] : null;
        return { status: 200, headers: { get: () => null }, json: async () => payload };
      }) as never,
    });
    const result = await requestDerivatives({
      symbol: "BTC",
      fields: ["funding", "openInterest", "oraclePrice", "impactPrices", "predictedFunding", "openInterestCap"],
    }, { hyperliquid: () => provider });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.source).toBe("hyperliquid");
    expect(result.snapshot.funding).toBe(0.0000125);
    expect(result.snapshot.fundingIntervalHours).toBe(1);
    expect(result.snapshot.oraclePrice).toBe(14.32);
    expect(result.snapshot.impactPrices).toEqual([14.3161, 14.3205]);
    expect(result.predictedFunding?.map((row) => row.venue)).toEqual(["BinPerp", "HlPerp"]);
    expect(result.openInterestCap).toEqual(["BADGER"]);
    // 没点名的字段不该出现（例如 midPrice / 24h 量价）。
    expect(result.snapshot.midPrice).toBeUndefined();
    expect(result.snapshot.dayNotionalVolume).toBeUndefined();
    expect(calls).toContain("metaAndAssetCtxs");
  });

  it("没点名 predictedFunding / openInterestCap 时不做那两次请求", async () => {
    const { HyperliquidProvider } = await import("./hyperliquid");
    const calls: string[] = [];
    const provider = new HyperliquidProvider({
      fetch: (async (_url: string, init?: { body?: string }) => {
        calls.push((JSON.parse(init?.body ?? "{}") as { type: string }).type);
        return { status: 200, headers: { get: () => null }, json: async () => metaCtx };
      }) as never,
    });
    await requestDerivatives({ symbol: "BTC", fields: ["funding"] }, { hyperliquid: () => provider });
    expect(calls).toEqual(["metaAndAssetCtxs"]);
  });

  it("字段过滤：只要 funding 时结果里不夹带别的字段", async () => {
    const { HyperliquidProvider } = await import("./hyperliquid");
    const provider = new HyperliquidProvider({
      fetch: (async () => ({ status: 200, headers: { get: () => null }, json: async () => metaCtx })) as never,
    });
    const result = await requestDerivatives({ symbol: "BTC", fields: ["funding"] }, { hyperliquid: () => provider });
    if (result.ok !== true) throw new Error("expected ok");
    expect(Object.keys(result.snapshot).sort()).toEqual(["funding", "fundingIntervalHours", "source", "symbol"]);
  });

  it("响应里的 symbol 是币种名（与查询口径一致）", async () => {
    const { HyperliquidProvider } = await import("./hyperliquid");
    const provider = new HyperliquidProvider({
      fetch: (async () => ({ status: 200, headers: { get: () => null }, json: async () => metaCtx })) as never,
    });
    const result = await requestDerivatives({ symbol: "btcusdt", fields: ["funding"] }, { hyperliquid: () => provider });
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.symbol).toBe("BTC");
  });

  it("未上市的币种明确报错，不静默", async () => {
    const { HyperliquidProvider } = await import("./hyperliquid");
    const provider = new HyperliquidProvider({
      fetch: (async () => ({ status: 200, headers: { get: () => null }, json: async () => metaCtx })) as never,
    });
    const result = await requestDerivatives({ symbol: "DOGE" }, { hyperliquid: () => provider });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.reason).toBe("derivatives_unavailable");
    expect(result.hint).toContain("DOGE");
  });

  void hlProvider;
});

describe("入参校验：不合法就报错，不再静默空成功", () => {
  const provider: MarketDataProvider = {
    fetchCandles: async () => ramp,
    fetchDerivatives: async (symbol) => ({ symbol }),
  };

  it("kinds 拼错：报错并指出是哪个值、合法值是什么", async () => {
    const result = await requestLevelFacts(provider, { symbol: "BTC", interval: "1h", kinds: ["suport"] }, { now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.reason).toBe("invalid_args");
    expect(result.hint).toContain("suport");
    expect(result.hint).toContain("support");
  });

  it("kinds 空数组：报错而不是静默给 0 条", async () => {
    const result = await requestLevelFacts(provider, { symbol: "BTC", interval: "1h", kinds: [] }, { now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.reason).toBe("invalid_args");
    expect(result.hint).toContain("空数组");
  });

  it("maxLevels 非正整数：报错（负 slice 会给出意外结果）", async () => {
    for (const maxLevels of [-1, 0, 1.5]) {
      const result = await requestLevelFacts(provider, { symbol: "BTC", interval: "1h", maxLevels }, { now: NOW });
      expect(result.ok).toBe(false);
    }
  });

  it("tolerancePct 非正：报错", async () => {
    const result = await requestLevelFacts(provider, { symbol: "BTC", interval: "1h", tolerancePct: 0 }, { now: NOW });
    expect(result.ok).toBe(false);
  });

  it("合法 kinds 照常工作", async () => {
    const result = await requestLevelFacts(provider, { symbol: "BTC", interval: "1h", kinds: ["support", "pivots"] }, { now: NOW });
    expect(result.ok).toBe(true);
  });
});

describe("lookback：agent 用时间跨度表达要看多长历史", () => {
  /** 每次请求都记录上限，便于断言"取了多少"。 */
  function recording(total: number): { provider: MarketDataProvider; asked: number[] } {
    const asked: number[] = [];
    const candles: Candle[] = Array.from({ length: total }, (_, i) => ({
      time: i * 3_600, open: i, high: i + 1, low: i - 1, close: i, volume: 1,
    }));
    return {
      asked,
      provider: {
        fetchCandles: async (_s, _i, opts) => { asked.push(opts?.limit ?? 0); return candles.slice(-(opts?.limit ?? 500)); },
        fetchDerivatives: async (symbol) => ({ symbol }),
      },
    };
  }
  const NOW = 20_000 * 3_600 * 1000;

  it("lookback 撑开窗口（即使指标只要很少的根数）", async () => {
    const { provider, asked } = recording(3_000);
    // 30d 于 1h = 720 根，远超 rsi(14) 的 14 根，且仍在单次上限（1000）之内。
    const result = await requestIndicatorFacts(provider, {
      symbol: "BTC", interval: "1h", indicators: [{ id: "rsi", period: 14 }], lookback: "30d",
    }, { now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(result.grounding.barsUsed).toBeGreaterThanOrEqual(720);
    expect(asked[0]).toBeGreaterThanOrEqual(720);
    expect(asked[0]).toBeGreaterThan(720 - 100); // 明显大于默认篮子（1h 默认 720，含余量后更小）
  });

  it("指标预热更长时以指标为准（两者取较大）", async () => {
    const { provider, asked } = recording(3_000);
    await requestIndicatorFacts(provider, {
      symbol: "BTC", interval: "1h", indicators: [{ id: "ma", period: 900 }], lookback: "1d",
    }, { now: NOW });
    // 1d = 24 根 << ma:900 的 900 根
    expect(asked[0]).toBeGreaterThanOrEqual(900);
  });

  it("lookback 超出该周期能覆盖的长度时，按上限失败并说明时间", async () => {
    const { provider } = recording(3_000);
    const result = await requestIndicatorFacts(provider, {
      symbol: "BTC", interval: "1h", indicators: [{ id: "rsi", period: 14 }], lookback: "365d",
    }, { now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.reason).toBe("insufficient_closed_bars");
    expect(result.hint).toContain("只能覆盖");
    expect(result.hint).toContain("4h");   // 1h 的高一级周期
    expect(result.hint).toContain("约 167 天");
  });

  it("lookback 写法不合法时明确报错", async () => {
    const { provider } = recording(100);
    const result = await requestIndicatorFacts(provider, {
      symbol: "BTC", interval: "1h", indicators: [{ id: "rsi", period: 14 }], lookback: "abc",
    }, { now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok !== false) throw new Error("expected failure");
    expect(result.reason).toBe("invalid_args");
    expect(result.hint).toContain("lookback");
  });
});

describe("价位也接受时间跨度", () => {
  it("lookback 决定用多长的历史结构定价位", async () => {
    const heard: number[] = [];
    const bars: Candle[] = Array.from({ length: 6_000 }, (_, i) => ({
      time: i * 3_600, open: i, high: i + 1, low: i - 1, close: i, volume: 1,
    }));
    const provider: MarketDataProvider = {
      fetchCandles: async (_s, _i, opts) => { heard.push(opts?.limit ?? 0); return bars.slice(-(opts?.limit ?? 500)); },
      fetchDerivatives: async (symbol) => ({ symbol }),
    };
    const result = await requestLevelFacts(provider, { symbol: "BTC", interval: "1h", lookback: "30d" }, { now: 10_000 * 3_600 * 1000 });
    expect(result.ok).toBe(true);
    if (result.ok !== true) throw new Error("expected ok");
    expect(heard[0]).toBeGreaterThanOrEqual(720);
    expect(result.grounding.barsUsed).toBeGreaterThanOrEqual(720);
  });
});
