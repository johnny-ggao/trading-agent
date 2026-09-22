import { describe, it, expect } from "vitest";
import { allClosed, partitionCandles } from "./closedCandles";
import type { Candle } from "../shared/chartSpec";

const candle = (time: number, close = time): Candle => ({ time, open: close, high: close, low: close, close });

describe("K 线收盘边界", () => {
  it("空数组：没有已收盘 K 线", () => {
    const closure = partitionCandles([], "1h", 0);
    expect(closure.closed).toEqual([]);
    expect(closure.formingBars).toBe(0);
    expect(closure.lastClosed).toBeUndefined();
  });

  it("末根已收盘：全部可用", () => {
    const candles = [candle(0), candle(3600)];
    // 末根覆盖 [3600, 7200)，now 已过 7200。
    const closure = partitionCandles(candles, "1h", 7_200_000);
    expect(closure.formingBars).toBe(0);
    expect(closure.closed).toBe(candles);
    expect(closure.lastClosed).toBe(candles[1]);
  });

  it("末根形成中：整根剔除出判断，但仍留在展示数据里", () => {
    const candles = [candle(0), candle(3600)];
    // now 落在末根区间内。
    const closure = partitionCandles(candles, "1h", 5_000_000);
    expect(closure.all).toBe(candles);
    expect(closure.formingBars).toBe(1);
    expect(closure.closed).toEqual([candles[0]]);
    expect(closure.lastClosed).toBe(candles[0]);
  });

  it("收盘时刻恰好等于 now：已收盘", () => {
    const closure = partitionCandles([candle(0), candle(3600)], "1h", 7_200_000);
    expect(closure.formingBars).toBe(0);
  });

  it("周期参与计算：同样时长下 15m 的末根已收盘而 1h 的还没有", () => {
    const candles = [candle(0), candle(900)];
    const now = 1_800_000 + 1; // 900s + 900s 之后一点点
    expect(partitionCandles(candles, "15m", now).formingBars).toBe(0);
    expect(partitionCandles([candle(0), candle(3600)], "1h", now).formingBars).toBe(1);
  });

  it("allClosed：不切分、不丢数据", () => {
    const candles = [candle(0), candle(3600)];
    const closure = allClosed(candles);
    expect(closure.closed).toBe(candles);
    expect(closure.formingBars).toBe(0);
    expect(closure.lastClosed).toBe(candles[1]);
  });
});
