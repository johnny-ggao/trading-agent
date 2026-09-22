import { describe, it, expect } from "vitest";
import { paneStretchFactors, PRICE_PANE_STRETCH, SUB_PANE_STRETCH } from "./paneLayout";

describe("窗格比例：K 线主图要明显更大", () => {
  it("主图拿到最大比例，副图统一", () => {
    expect(paneStretchFactors(3)).toEqual([PRICE_PANE_STRETCH, SUB_PANE_STRETCH, SUB_PANE_STRETCH]);
  });

  it("主图占比随副图数量下降，但仍显著大于单个副图", () => {
    const factors = paneStretchFactors(5);
    const total = factors.reduce((sum, f) => sum + f, 0);
    expect(factors[0]! / total).toBeGreaterThan(0.3);      // 5 个窗格时主图仍 >30%
    expect(factors[0]).toBeGreaterThan(factors[1]! * 2);   // 至少是副图的两倍
  });

  it("只有主图时全给它", () => {
    expect(paneStretchFactors(1)).toEqual([PRICE_PANE_STRETCH]);
  });

  it("窗格数异常（0 或负数）也不出错", () => {
    expect(paneStretchFactors(0)).toEqual([PRICE_PANE_STRETCH]);
    expect(paneStretchFactors(-2)).toEqual([PRICE_PANE_STRETCH]);
  });
});
