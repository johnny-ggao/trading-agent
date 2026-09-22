import { describe, it, expect } from "vitest";
import { INDICATOR_OUTPUT_SCHEMA, indicatorBlocks, indicatorPayload } from "./indicator";
import { payloadCoversSchema } from "./contract";
import type { IndicatorFactsResponse } from "../market/facts";

const success: IndicatorFactsResponse = {
  ok: true,
  symbol: "BTCUSDT",
  interval: "1h",
  grounding: { lastClosedBar: 1_789_000_000, formingBars: 1, barsUsed: 719, closedOnly: true },
  indicators: [
    { id: "rsi", params: { period: 14 }, warmupBars: 14, latest: { time: 1_789_000_000, value: 58.2 } },
  ],
};

const failure: IndicatorFactsResponse = {
  ok: false,
  reason: "insufficient_closed_bars",
  required: 900,
  available: 719,
  hint: "换更大的周期",
};

describe("trading_indicator 的契约", () => {
  it("成功 payload 的键都在 schema 里", () => {
    expect(() => payloadCoversSchema(INDICATOR_OUTPUT_SCHEMA, indicatorPayload(success))).not.toThrow();
  });

  it("失败 payload 的键也都在 schema 里", () => {
    expect(() => payloadCoversSchema(INDICATOR_OUTPUT_SCHEMA, indicatorPayload(failure))).not.toThrow();
  });

  it("成功时渲染出已收盘 bar 与指标 JSON", () => {
    const blocks = indicatorBlocks(indicatorPayload(success));
    expect(blocks[0]!.text).toContain("1789000000");
    expect(blocks[0]!.text).toContain("719");
    expect(blocks[1]!.text).toContain("rsi");
  });

  it("失败时渲染出原因、缺多少根与建议", () => {
    const blocks = indicatorBlocks(indicatorPayload(failure));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toContain("insufficient_closed_bars");
    expect(blocks[0]!.text).toContain("900");
    expect(blocks[0]!.text).toContain("换更大的周期");
  });

  it("空请求失败也走同一形状", () => {
    const empty: IndicatorFactsResponse = { ok: false, reason: "empty_request", required: 1, available: 0, hint: "至少点名一个指标" };
    expect(() => payloadCoversSchema(INDICATOR_OUTPUT_SCHEMA, indicatorPayload(empty))).not.toThrow();
    expect(indicatorBlocks(indicatorPayload(empty))[0]!.text).toContain("empty_request");
  });
});
