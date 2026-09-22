import { describe, it, expect } from "vitest";
import {
  INDICATOR_CATALOG,
  canonicalSpec,
  defaultsOf,
  type IndicatorId,
} from "./indicatorCatalog";
import { parseIndicatorSelectors } from "./indicatorSpec";
import { warmupBarsFor } from "./indicatorFacts";

const ids = Object.keys(INDICATOR_CATALOG) as IndicatorId[];

describe("指标清单是唯一来源", () => {
  it("清单非空且每个 id 都有参数规格、预热期与取值实现", () => {
    expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const id of ids) {
      const def = INDICATOR_CATALOG[id];
      expect(def.params, `${id} 缺 params`).toBeDefined();
      expect(typeof def.warmup, `${id} 缺 warmup`).toBe("function");
      expect(typeof def.compute, `${id} 缺 compute`).toBe("function");
    }
  });

  it("解析器接受的 id 集合与清单完全一致（不多不少）", () => {
    for (const id of ids) {
      const spec = canonicalSpec(id);
      expect(parseIndicatorSelectors([spec])[0]!.id, `${id} 无法被解析为自身（${spec}）`).toBe(id);
    }
    expect(() => parseIndicatorSelectors(["bogus:3"])).toThrow(/bogus/);
  });

  it("预热期由清单推导（解析→预热不再各写一遍）", () => {
    for (const id of ids) {
      const [selector] = parseIndicatorSelectors([canonicalSpec(id)]);
      expect(warmupBarsFor(selector!), `${id} 的预热期应等于清单声明`).toBe(
        INDICATOR_CATALOG[id].warmup(defaultsOf(id)),
      );
    }
  });

  it("每个 id 都能算出值（用足够的 K 线）", () => {
    const bars = Array.from({ length: 400 }, (_, i) => {
      const close = 100 + Math.sin(i / 7) * 5 + i * 0.1;
      return { time: i * 3_600, open: close - 0.2, high: close + 0.8, low: close - 0.8, close, volume: 10 + (i % 5) };
    });
    for (const id of ids) {
      const series = INDICATOR_CATALOG[id].compute(bars, defaultsOf(id));
      const finite = series.filter((value) => value !== null && Number.isFinite(value));
      expect(finite.length, `${id} 没有产出任何值`).toBeGreaterThan(0);
    }
  });

  it("常用档位可用于生成示例写法（也供引导词引用）", () => {
    expect(canonicalSpec("ma")).toMatch(/^ma:\d+$/);
    expect(canonicalSpec("obv")).toBe("obv");
    expect(canonicalSpec("macd")).toMatch(/^macd:\d+\/\d+\/\d+$/);
  });
});
