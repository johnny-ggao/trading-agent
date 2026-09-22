import { describe, it, expect } from "vitest";
import { buildAnchor } from "./anchor";
import type { ChartCandidates, MarketContext, RuleSignal, TimeframeResonance } from "../shared/analysis";
import type { ChartSpec } from "../shared/chartSpec";
import type { MarketView } from "./request";

const spec: ChartSpec = {
  symbol: "BTCUSDT",
  interval: "1h",
  timeframes: ["15m", "1h", "4h", "1d"],
  panes: [{ id: "price" }],
  series: [],
  formingBars: 1,
};

const context: MarketContext = {
  trend: { adx: 53.6, pdi: 29.2, mdi: 15.5, state: "trending", direction: "up" },
  volatility: { atr: 608, atrPct: 0.0071, state: "high" },
  volume: { ratio: 0.46, state: "low" },
  summary: "走势：趋势（ADX 53.6）；波动：偏高；量能：缩量",
};

const resonance: TimeframeResonance = {
  higherInterval: "4h",
  higher: context,
  aligned: true,
  summary: "高周期 4h 方向向上：共振向上。",
};

function viewOf(overrides: Partial<MarketView> = {}): MarketView {
  const candidates: ChartCandidates = { pivots: [], levels: [], lastPrice: 85_692.83 };
  const ruleSignals: RuleSignal[] = [];
  return {
    spec,
    resolved: { symbol: "BTCUSDT", interval: "1h", indicators: { ma: [20, 50, 200], macd: { fast: 12, slow: 26, signal: 9 }, volume: true }, levelOptions: {}, levelControls: {} },
    bars: 720,
    candidates,
    ruleSignals,
    context,
    resonance,
    formingBars: 1,
    lastClosedBar: 1_789_000_000,
    fetchedAt: 1_789_003_600_000,
    ...overrides,
  };
}

describe("trading_chart 的最小锚点", () => {
  it("只给定位与最新价，不夹带机械候选/规则信号/共振", () => {
    const anchor = buildAnchor(viewOf());
    expect(anchor).toMatchObject({
      symbol: "BTCUSDT",
      interval: "1h",
      bars: 720,
      formingBars: 1,
      lastClose: 85_692.83,
    });
    expect(anchor).not.toHaveProperty("candidates");
    expect(anchor).not.toHaveProperty("ruleSignals");
    expect(anchor).not.toHaveProperty("resonance");
  });

  it("带上最后一根已收盘 K 线的时间（引数必带时间）", () => {
    expect(buildAnchor(viewOf()).lastClosedBar).toBe(1_789_000_000);
  });

  it("市场状态只留机械事实，不留长摘要文本", () => {
    expect(buildAnchor(viewOf()).context).toEqual({
      trend: { state: "trending", direction: "up", adx: 53.6 },
      volatility: { state: "high", atrPct: 0.0071 },
      volume: { state: "low", ratio: 0.46 },
    });
  });

  it("hint 指路到按需工具，并说明可以再发一轮", () => {
    const anchor = buildAnchor(viewOf());
    expect(anchor.hint).toContain("trading_indicator");
    expect(anchor.hint).toContain("trading_levels");
  });
});
