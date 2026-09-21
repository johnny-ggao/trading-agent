import { describe, it, expect } from "vitest";
import { computeMarketContext } from "./context";
import { DEFAULT_INDICATORS } from "./indicators";
import type { Candle } from "../shared/chartSpec";

function candlesFromCloses(closes: number[], volumes: number[] = closes.map(() => 10)): Candle[] {
  return closes.map((close, index) => ({
    time: index,
    open: index === 0 ? close : closes[index - 1]!,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: volumes[index]!,
  }));
}

const rising = candlesFromCloses(Array.from({ length: 40 }, (_, i) => 100 + i));
const oscillating = candlesFromCloses(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 100 : 101)));
const config = { ...DEFAULT_INDICATORS, ma: [3, 5] };

describe("computeMarketContext", () => {
  it("单边上行 → 趋势、方向向上、多头排列", () => {
    const context = computeMarketContext(rising, config);
    expect(context.trend.state).toBe("trending");
    expect(context.trend.direction).toBe("up");
    expect(context.maAlignment?.order).toBe("bullish");
    expect(context.trend.adx).toBeGreaterThan(25);
  });

  it("来回震荡 → 区间", () => {
    expect(computeMarketContext(oscillating, config).trend.state).toBe("ranging");
  });

  it("最后一根放量 → 量能偏高", () => {
    const volumes = [...rising.map(() => 10)];
    volumes[volumes.length - 1] = 40;
    expect(computeMarketContext(candlesFromCloses(rising.map((c) => c.close), volumes), config).volume.state).toBe("high");
  });

  it("最后一根振幅骤增 → 波动偏高", () => {
    const spiked = rising.map((candle) => ({ ...candle }));
    spiked[spiked.length - 1] = { ...spiked[spiked.length - 1]!, high: 200, low: 100 };
    expect(computeMarketContext(spiked, config).volatility.state).toBe("high");
  });

  it("摘要包含机械读数", () => {
    const summary = computeMarketContext(rising, config).summary;
    expect(summary).toContain("ADX");
    expect(summary).toContain("均线");
  });
});
