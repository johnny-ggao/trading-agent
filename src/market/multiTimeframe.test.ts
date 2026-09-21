import { describe, it, expect } from "vitest";
import { computeResonance, higherInterval } from "./multiTimeframe";
import type { MarketContext } from "../shared/analysis";

function context(direction: "up" | "down" | "flat"): MarketContext {
  return {
    trend: { adx: 30, pdi: 30, mdi: 10, state: "trending", direction },
    volatility: { atr: 1, atrPct: 0.02, state: "normal" },
    volume: { ratio: 1, state: "normal" },
    summary: "机械摘要",
  };
}

describe("higherInterval", () => {
  it("按 ×4 取高一级周期（1d 之上为 1w）", () => {
    expect(higherInterval("15m")).toBe("1h");
    expect(higherInterval("1h")).toBe("4h");
    expect(higherInterval("4h")).toBe("1d");
    expect(higherInterval("1d")).toBe("1w");
  });
});

describe("computeResonance", () => {
  it("同向为共振", () => {
    const resonance = computeResonance("4h", context("up"), context("up"));
    expect(resonance.aligned).toBe(true);
    expect(resonance.summary).toContain("共振向上");
  });

  it("反向为背离", () => {
    const resonance = computeResonance("4h", context("up"), context("down"));
    expect(resonance.aligned).toBe(false);
    expect(resonance.summary).toContain("背离");
  });

  it("任一侧走平则方向不明确", () => {
    const resonance = computeResonance("4h", context("up"), context("flat"));
    expect(resonance.aligned).toBe(false);
    expect(resonance.summary).toContain("方向不明确");
  });
});
