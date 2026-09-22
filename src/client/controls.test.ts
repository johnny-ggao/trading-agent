import { describe, it, expect } from "vitest";
import {
  applyChange,
  chartQuery,
  currentTarget,
  fetchChartSpec,
  DEFAULT_RSI_PERIOD,
  type ChartFetch,
} from "./controls";
import type { ChartSpec } from "../shared/chartSpec";

const spec: ChartSpec = {
  symbol: "BTCUSDT",
  interval: "1h",
  timeframes: ["15m", "1h", "4h", "1d"],
  panes: [],
  series: [],
  controls: { ma: [20, 50, 200], rsi: null, bollinger: false, kdj: false, atr: false },
};

describe("图卡控件：目标状态推导", () => {
  it("从 chartSpec 取当前状态", () => {
    expect(currentTarget(spec)).toEqual({
      symbol: "BTCUSDT", interval: "1h", ma: [20, 50, 200],
      rsi: null, bollinger: false, kdj: false, atr: false,
    });
  });

  it("缺省 controls 时回落到主流默认", () => {
    const bare: ChartSpec = { ...spec, controls: undefined };
    expect(currentTarget(bare).ma).toEqual([20, 50, 200]);
    expect(currentTarget(bare).rsi).toBeNull();
  });

  it("切换周期只改周期", () => {
    const next = applyChange(currentTarget(spec), { kind: "interval", interval: "4h" });
    expect(next.interval).toBe("4h");
    expect(next.symbol).toBe("BTCUSDT");
    expect(next.ma).toEqual([20, 50, 200]);
  });

  it("打开 RSI 补默认周期，关闭置空", () => {
    const on = applyChange(currentTarget(spec), { kind: "toggle", id: "rsi", on: true });
    expect(on.rsi).toBe(DEFAULT_RSI_PERIOD);
    expect(applyChange(on, { kind: "toggle", id: "rsi", on: false }).rsi).toBeNull();
  });

  it("逐个开关布林/KDJ/ATR", () => {
    let target = currentTarget(spec);
    target = applyChange(target, { kind: "toggle", id: "bollinger", on: true });
    target = applyChange(target, { kind: "toggle", id: "kdj", on: true });
    expect(target.bollinger).toBe(true);
    expect(target.kdj).toBe(true);
    expect(target.atr).toBe(false);
  });
});

describe("图卡控件：请求宿主端点的 URL", () => {
  it("带上完整目标状态；关闭的 RSI 不出现", () => {
    const params = new URLSearchParams(chartQuery(currentTarget(spec)));
    expect(params.get("symbol")).toBe("BTCUSDT");
    expect(params.get("interval")).toBe("1h");
    expect(params.get("ma")).toBe("20,50,200");
    expect(params.get("bollinger")).toBe("false");
    expect(params.get("rsi")).toBeNull();
  });

  it("打开后的状态写进 URL", () => {
    const target = applyChange(currentTarget(spec), { kind: "toggle", id: "atr", on: true });
    expect(new URLSearchParams(chartQuery(target)).get("atr")).toBe("true");
  });
});

describe("图卡控件：向宿主端点取新 chartSpec", () => {
  it("成功时返回 chartSpec", async () => {
    const calls: string[] = [];
    const fetchImpl: ChartFetch = async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({ ok: true, chartSpec: spec }) };
    };
    const target = applyChange(currentTarget(spec), { kind: "interval", interval: "4h" });
    await expect(fetchChartSpec(target, fetchImpl)).resolves.toEqual(spec);
    expect(calls[0]).toContain("/trading-agent/chart?");
    expect(calls[0]).toContain("interval=4h");
  });

  it("HTTP 失败时抛错", async () => {
    const fetchImpl: ChartFetch = async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: "boom" }) });
    await expect(fetchChartSpec(currentTarget(spec), fetchImpl)).rejects.toThrow("boom");
  });

  it("响应体不合法时抛错", async () => {
    const fetchImpl: ChartFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) });
    await expect(fetchChartSpec(currentTarget(spec), fetchImpl)).rejects.toThrow();
  });
});

describe("图面价位设置随控件保真（点开关不丢模型画的线）", () => {
  it("从 spec.controls 读进目标状态", () => {
    const spec = {
      symbol: "BTCUSDT", interval: "1h", timeframes: ["1h"], panes: [], series: [],
      controls: {
        ma: [20], rsi: null, bollinger: false, kdj: false, atr: false,
        levelsPerSide: 5, levelKinds: ["resistance", "fib"], levels: ["85237.96:support", "84843:invalidation"],
      },
    } as unknown as Parameters<typeof currentTarget>[0];
    const target = currentTarget(spec);
    expect(target.levelsPerSide).toBe(5);
    expect(target.levels).toEqual(["85237.96:support", "84843:invalidation"]);
  });

  it("编码进查询串（显式价位用 | 分隔）", () => {
    const query = chartQuery({
      symbol: "BTCUSDT", interval: "1h", ma: [20], rsi: null, bollinger: false, kdj: false, atr: false,
      levels: ["85237.96:support", "84843:invalidation"], levelKinds: ["support", "invalidation"],
    });
    expect(query).toContain("levels=85237.96%3Asupport%7C84843%3Ainvalidation");
    expect(query).toContain("levelKinds=support%2Cinvalidation");
  });

  it("改开关不影响价位设置", () => {
    const before = {
      symbol: "BTCUSDT", interval: "1h", ma: [20], rsi: null, bollinger: false, kdj: false, atr: false,
      levels: ["84843:invalidation"],
    };
    const after = applyChange(before, { kind: "toggle", id: "rsi", on: true });
    expect(after.levels).toEqual(["84843:invalidation"]);
  });
});
