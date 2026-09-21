import { describe, it, expect } from "vitest";
import { barsForInterval, DEFAULT_BARS, MIN_BARS } from "./chart";

describe("按周期决定取多少根 K 线", () => {
  it("不同周期取不同根数", () => {
    expect(barsForInterval("15m")).toBe(800);
    expect(barsForInterval("1h")).toBe(600);
    expect(barsForInterval("4h")).toBe(500);
    expect(barsForInterval("1d")).toBe(400);
  });
  it("未知周期回落到默认值", () => {
    expect(barsForInterval("2h")).toBe(DEFAULT_BARS);
  });
  it("不低于下限（覆盖 MA200 等预热期）", () => {
    expect(barsForInterval("1d", 500)).toBe(500);
    expect(MIN_BARS).toBeGreaterThanOrEqual(200);
  });
});
