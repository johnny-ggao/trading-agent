import { describe, it, expect } from "vitest";
import { indicatorVocabularyNote } from "./indicator";
import { INDICATOR_CATALOG, type IndicatorId } from "../market/indicatorCatalog";
import { buildAnchor } from "../market/anchor";
import { tradingChartSkill } from "../skill/tradingChart";
import {
  CONFIDENCE_TOOL_NAME,
  DERIVATIVES_TOOL_NAME,
  INDICATOR_TOOL_NAME,
  LEVELS_TOOL_NAME,
} from "../shared/tool";
import type { MarketView } from "../market/request";
import { DEFAULT_BAR_POLICY, describeBarsSpan } from "../market/chart";

const ids = Object.keys(INDICATOR_CATALOG) as IndicatorId[];

describe("散文契约不许与实现漂移", () => {
  it("工具描述里的 id 清单覆盖清单中的每一个指标", () => {
    const note = indicatorVocabularyNote();
    for (const id of ids) {
      expect(note, `工具描述漏了 ${id}`).toContain(id);
    }
  });

  it("引导词（skill 正文）也覆盖每一个指标", () => {
    const body = tradingChartSkill.content;
    for (const id of ids) {
      expect(body, `skill 漏了 ${id}`).toContain(id);
    }
  });

  it("锚点的指路提到全部取数/校准工具", () => {
    const anchor = buildAnchor({
      spec: { symbol: "BTCUSDT", interval: "1h", timeframes: ["1h"], panes: [{ id: "price" }], series: [] },
      resolved: { symbol: "BTCUSDT", interval: "1h", indicators: { ma: [20], macd: { fast: 12, slow: 26, signal: 9 }, volume: true }, levelOptions: {}, levelControls: {} },
      bars: 100,
      candidates: { pivots: [], levels: [], lastPrice: 1 },
      ruleSignals: [],
      context: {
        trend: { adx: 30, pdi: 25, mdi: 10, state: "trending", direction: "up" },
        volatility: { atr: 1, atrPct: 0.01, state: "normal" },
        volume: { ratio: 1, state: "normal" },
        summary: "s",
      },
      formingBars: 0,
      fetchedAt: 0,
    } satisfies MarketView);
    for (const tool of [INDICATOR_TOOL_NAME, LEVELS_TOOL_NAME, DERIVATIVES_TOOL_NAME, CONFIDENCE_TOOL_NAME]) {
      expect(anchor.hint, `指路漏了 ${tool}`).toContain(tool);
    }
  });
});

describe("引导词里的取数上限与策略常量一致", () => {
  it("每个周期的覆盖跨度都与 barsForInterval 的策略一致", () => {
    const body = tradingChartSkill.content;
    for (const interval of ["15m", "1h", "4h", "1d", "1w"]) {
      const span = describeBarsSpan(DEFAULT_BAR_POLICY.maxBars, interval);
      expect(body, `skill 的上限表漏了 ${interval} 的 ${span}`).toContain(span);
    }
  });
});
