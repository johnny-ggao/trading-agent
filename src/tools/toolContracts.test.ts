import { describe, it, expect } from "vitest";
import { payloadCoversSchema } from "./contract";
import { LEVELS_OUTPUT_SCHEMA, levelsBlocks, type LevelsToolValue } from "./levels";
import { DERIVATIVES_OUTPUT_SCHEMA, derivativesBlocks, type DerivativesToolValue } from "./derivatives";
import { CONFIDENCE_OUTPUT_SCHEMA, confidenceBlocks, type ConfidenceToolValue } from "./confidence";

describe("trading_levels 的契约", () => {
  const ok: LevelsToolValue = {
    ok: true, symbol: "BTCUSDT", interval: "1h",
    grounding: { lastClosedBar: 1_789_000_000, barsUsed: 719, closedOnly: true },
    pivots: [], levels: [{ kind: "support", price: 85_000 }], counts: { support: 1 }, truncated: 0,
  };
  const fail: LevelsToolValue = { ok: false, reason: "invalid_args", required: 0, available: 0, hint: "kinds 拼错" };

  it("两种 payload 的键都在 schema 里", () => {
    expect(() => payloadCoversSchema(LEVELS_OUTPUT_SCHEMA, ok)).not.toThrow();
    expect(() => payloadCoversSchema(LEVELS_OUTPUT_SCHEMA, fail)).not.toThrow();
  });

  it("渲染要说清「返回了多少 / 总共多少」，否则模型会以为这就是全部", () => {
    const withTotals = levelsBlocks({
      ...ok,
      counts: { support: 22, resistance: 2, fib: 5, pivots: 233 },
      pivots: [{ time: 1, price: 1, kind: "high" }],
    })[0]!.text;
    expect(withTotals).toContain("共 29 条");
    expect(withTotals).toContain("支撑 22/阻力 2/斐波 5");
    expect(withTotals).toContain("共 233 个");
    expect(withTotals).toContain("需要更多就调大 maxLevels");
  });

  it("截断时渲染出截掉的条数", () => {
    expect(levelsBlocks({ ...ok, truncated: 3 })[0]!.text).toContain("截掉 3 条");
    expect(levelsBlocks(ok)[0]!.text).not.toContain("截掉");
  });
});

describe("trading_derivatives 的契约", () => {
  const ok: DerivativesToolValue = { ok: true, symbol: "BTC", source: "hyperliquid", snapshot: { funding: 0.0000125 } };
  const fail: DerivativesToolValue = { ok: false, reason: "derivatives_unavailable", hint: "未上市" };

  it("两种 payload 的键都在 schema 里", () => {
    expect(() => payloadCoversSchema(DERIVATIVES_OUTPUT_SCHEMA, ok)).not.toThrow();
    expect(() => payloadCoversSchema(DERIVATIVES_OUTPUT_SCHEMA, fail)).not.toThrow();
  });

  it("点名的独有项才渲染对应行", () => {
    expect(derivativesBlocks(ok)).toHaveLength(1);
    const withExtras = derivativesBlocks({ ...ok, predictedFunding: [{ venue: "BinPerp" }], openInterestCap: ["CANTO"] });
    expect(withExtras.some((b) => b.text.includes("跨场所预测资金费"))).toBe(true);
    expect(withExtras.some((b) => b.text.includes("OI 已达上限"))).toBe(true);
  });
});

describe("trading_confidence 的契约", () => {
  const ok: ConfidenceToolValue = {
    ok: true, symbol: "BTCUSDT", interval: "1h", direction: "bullish",
    support: { score: 3, label: "中", probabilities: { "0": 0.1 } },
    confidence: { value: 0.62, level: "中" }, sufficiency: { score: 2 }, model: "jev-1",
  };
  const fail: ConfidenceToolValue = { ok: false, symbol: "BTCUSDT", interval: "1h", reason: "credentials_missing", hint: "填 key" };

  it("两种 payload 的键都在 schema 里", () => {
    expect(() => payloadCoversSchema(CONFIDENCE_OUTPUT_SCHEMA, ok)).not.toThrow();
    expect(() => payloadCoversSchema(CONFIDENCE_OUTPUT_SCHEMA, fail)).not.toThrow();
  });

  it("渲染支持度、置信度、充分度与概率分布", () => {
    const text = confidenceBlocks(ok)[0]!.text;
    expect(text).toContain("3/4");
    expect(text).toContain("0.62");
    expect(text).toContain("证据充分度");
    expect(confidenceBlocks(ok).some((b) => b.text.includes("概率分布"))).toBe(true);
  });

  it("未校准时只渲染原因与提示", () => {
    const blocks = confidenceBlocks(fail);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toContain("credentials_missing");
  });
});
