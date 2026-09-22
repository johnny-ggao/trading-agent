import { describe, it, expect } from "vitest";
import { FORMING_DOWN_COLOR, FORMING_UP_COLOR, muteFormingBars } from "./formColors";
import type { Candle } from "../shared/chartSpec";

const candle = (time: number, close: number): Candle => ({ time, open: 10, high: 12, low: 9, close });

/** 取 rgba 的 alpha 分量，用来断言"弱化"确实是透明度降低而不是换了色相。 */
const alphaOf = (color: string): number => Number(color.slice(color.lastIndexOf(",") + 1, -1));

describe("形成中 K 线的弱化样式", () => {
  it("只给尾部 formingBars 根上弱化色，其余不动", () => {
    const data = [candle(0, 11), candle(1, 9), candle(2, 11)];
    const muted = muteFormingBars(data, 1);
    expect(muted[0]).toEqual(data[0]);
    expect(muted[1]).toEqual(data[1]);
    expect(muted[2]).toEqual({
      time: 2, open: 10, high: 12, low: 9, close: 11,
      color: FORMING_UP_COLOR, borderColor: FORMING_UP_COLOR, wickColor: FORMING_UP_COLOR,
    });
  });

  it("按涨跌选色：跌的那根用弱化红", () => {
    const muted = muteFormingBars([candle(0, 11), candle(1, 9)], 1);
    expect(muted[1]!.color).toBe(FORMING_DOWN_COLOR);
  });

  it("formingBars 为 0 时不改动任何一根", () => {
    const data = [candle(0, 11)];
    expect(muteFormingBars(data, 0)).toEqual(data);
  });

  it("formingBars 超过数据长度时全部弱化", () => {
    const muted = muteFormingBars([candle(0, 11), candle(1, 9)], 5);
    expect(muted.every((item) => item.color !== undefined)).toBe(true);
  });

  it("不修改原始数组（宿主契约不被就地改写）", () => {
    const data = [candle(0, 11)];
    muteFormingBars(data, 1);
    expect("color" in data[0]!).toBe(false);
  });

  it("弱化色与实色同色相、只是更透明", () => {
    const teal = "rgba(38, 166, 154, 1)";
    const red = "rgba(239, 83, 80, 1)";
    expect(FORMING_UP_COLOR.startsWith("rgba(38, 166, 154")).toBe(true);
    expect(FORMING_DOWN_COLOR.startsWith("rgba(239, 83, 80")).toBe(true);
    expect(alphaOf(FORMING_UP_COLOR)).toBeLessThan(alphaOf(teal));
    expect(alphaOf(FORMING_DOWN_COLOR)).toBeLessThan(alphaOf(red));
  });
});
