import { describe, it, expect } from "vitest";
import { resolveInterval, isInterval, DEFAULT_INTERVAL } from "./timeframe";

describe("周期解析（显式周期或时间词）", () => {
  it("显式周期直接通过", () => {
    expect(resolveInterval("15m")).toBe("15m");
    expect(resolveInterval("1h")).toBe("1h");
    expect(resolveInterval("4h")).toBe("4h");
    expect(resolveInterval("1d")).toBe("1d");
  });
  it("时间词映射到主周期", () => {
    expect(resolveInterval("今天BTC走势如何")).toBe("1h");
    expect(resolveInterval("这周BTC怎么样")).toBe("4h");
    expect(resolveInterval("这个月走势")).toBe("1d");
    expect(resolveInterval("短线看一眼")).toBe("15m");
    expect(resolveInterval("long term view")).toBe("1d");
  });
  it("无法识别时回落默认", () => {
    expect(resolveInterval("随便看看")).toBe(DEFAULT_INTERVAL);
    expect(resolveInterval()).toBe(DEFAULT_INTERVAL);
  });
  it("isInterval 只认支持的集合", () => {
    expect(isInterval("1h")).toBe(true);
    expect(isInterval("2h")).toBe(false);
  });
});
