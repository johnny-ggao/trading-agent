import { describe, it, expect } from "vitest";
import { CHART_OUTPUT_SCHEMA, chartBlocks, chartPresentationMeta, type ChartToolValue } from "./chart";
import { payloadCoversSchema } from "./contract";

const success: ChartToolValue = {
  symbol: "BTCUSDT",
  interval: "1h",
  bars: 720,
  formingBars: 1,
  lastClose: 85_692.83,
  lastClosedBar: 1_789_000_000,
  context: { trend: { state: "trending", direction: "up", adx: 53.6 } },
  hint: "需要指标值时用 trading_indicator。",
  chartSpec: { symbol: "BTCUSDT" },
};

const failure: ChartToolValue = { ok: false, reason: "invalid_args", hint: "ma 必须是正整数" };

describe("trading_chart 的契约", () => {
  it("成功与失败 payload 的键都在 schema 里", () => {
    expect(() => payloadCoversSchema(CHART_OUTPUT_SCHEMA, success)).not.toThrow();
    expect(() => payloadCoversSchema(CHART_OUTPUT_SCHEMA, failure)).not.toThrow();
  });

  it("成功时渲染定位、市场状态与提示", () => {
    const blocks = chartBlocks(success);
    expect(blocks[0]!.text).toContain("BTCUSDT");
    expect(blocks[0]!.text).toContain("1789000000");
    expect(blocks.some((block) => block.text.includes("市场状态"))).toBe(true);
    expect(blocks.at(-1)!.text).toContain("trading_indicator");
  });

  it("有 compareTo 共振时多渲染一行周期比较", () => {
    const withResonance = { ...success, resonance: { higherInterval: "4h", aligned: true } };
    expect(chartBlocks(withResonance).some((block) => block.text.includes("周期比较"))).toBe(true);
    expect(chartBlocks(success).some((block) => block.text.includes("周期比较"))).toBe(false);
  });

  it("失败时只渲染一行，且不带图", () => {
    const blocks = chartBlocks(failure);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toContain("invalid_args");
    expect(chartPresentationMeta(failure)).toEqual({});
  });
});
