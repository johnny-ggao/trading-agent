import { describe, it, expect } from "vitest";
import { computeLevelFacts } from "./levelFacts";
import type { Candle } from "../shared/chartSpec";

const bar = (i: number, high: number, low: number): Candle => ({
  time: i * 3_600,
  open: (high + low) / 2,
  high,
  low,
  close: (high + low) / 2,
  volume: 1,
});

/**
 * 在平盘底上放三个高点（100 / 101 / 102）与两个低点（90 / 80），
 * 它们都能在左右各 2 根的窗口里成立为枢轴。
 */
const skyline: Candle[] = [
  bar(0, 95, 93), bar(1, 96, 94), bar(2, 100, 95), bar(3, 96, 94), bar(4, 95, 93),
  bar(5, 96, 94), bar(6, 101, 95), bar(7, 96, 94), bar(8, 95, 93),
  bar(9, 96, 88), bar(10, 95, 90), bar(11, 96, 89), bar(12, 96, 88), bar(13, 95, 87),
  bar(14, 96, 94), bar(15, 96, 94), bar(16, 96, 94), bar(17, 96, 94), bar(18, 96, 94),
];

describe("按需价位计算", () => {
  it("kinds 过滤：只给 support 就不出现 resistance / fib / pivots", () => {
    const facts = computeLevelFacts(skyline, { kinds: ["support"] });
    expect(facts.levels.every((level) => level.kind === "support")).toBe(true);
    expect(facts.pivots).toEqual([]);
    expect(facts.counts).toEqual({ support: facts.levels.length, resistance: 0, fib: 0, pivots: 0 });
  });

  it("不传 kinds 时四类都给", () => {
    const facts = computeLevelFacts(skyline, {});
    expect(facts.levels.some((level) => level.kind === "support")).toBe(true);
    expect(facts.levels.some((level) => level.kind === "resistance")).toBe(true);
    expect(facts.levels.some((level) => level.kind === "fib")).toBe(true);
    expect(facts.pivots.length).toBeGreaterThan(0);
  });

  it("每条价位带距现价的百分比与触碰次数", () => {
    const facts = computeLevelFacts(skyline, { kinds: ["support", "resistance"] });
    const support = facts.levels.find((level) => level.kind === "support")!;
    expect(support.touches).toBeGreaterThanOrEqual(1);
    expect(support.distancePct).toBeLessThan(0);
    const resistance = facts.levels.find((level) => level.kind === "resistance")!;
    expect(resistance.distancePct).toBeGreaterThan(0);
  });

  it("让模型能引用具体日期：每条价位带上形成它的枢轴时间", () => {
    const facts = computeLevelFacts(skyline, { kinds: ["resistance"] });
    const level = facts.levels[0]!;
    expect(level.pivotTimes.length).toBeGreaterThan(0);
    expect(level.pivotTimes.every((time) => Number.isInteger(time) && time > 0)).toBe(true);
  });

  it("maxLevels 按触碰次数降序裁剪，并回传被裁掉的条数", () => {
    const all = computeLevelFacts(skyline, { kinds: ["support", "resistance"] });
    const capped = computeLevelFacts(skyline, { kinds: ["support", "resistance"], maxLevels: 1 });
    expect(capped.levels.length).toBe(1);
    expect(capped.truncated).toBe(all.levels.length - 1);
    const maxTouches = Math.max(...all.levels.map((level) => level.touches));
    expect(capped.levels[0]!.touches).toBe(maxTouches);
  });

  it("容差决定聚簇粒度：0.5% 把 100/101 分开，2% 合成一条", () => {
    const tight = computeLevelFacts(skyline, { kinds: ["resistance"], tolerancePct: 0.5 });
    const loose = computeLevelFacts(skyline, { kinds: ["resistance"], tolerancePct: 2 });
    expect(tight.counts.resistance).toBeGreaterThan(loose.counts.resistance);
    expect(tight.levels.every((level) => level.kind === "resistance")).toBe(true);
  });

  it("pivotOptions 改变枢轴敏感度", () => {
    const sensitive = computeLevelFacts(skyline, { kinds: ["pivots"], pivotOptions: { left: 1, right: 1 } });
    const strict = computeLevelFacts(skyline, { kinds: ["pivots"], pivotOptions: { left: 3, right: 3 } });
    expect(sensitive.pivots.length).toBeGreaterThan(strict.pivots.length);
  });
});
