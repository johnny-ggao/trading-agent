import type { Candle } from "../shared/chartSpec";
import { intervalToMs } from "./chart";

/**
 * K 线的收盘边界：形成中（未收盘）的 K 线只展示，永不参与机械判断。
 *
 * 判断只看一根 K 线的收盘时刻（其开盘时间 + 周期）是否已过，不依赖交易所时钟，
 * 也不做「是否与周期网格对齐」的推断——所以测试注入固定的 `now` 即可复现。
 */
export interface CandleClosure {
  /** 全部 K 线（含形成中的那根），用于展示。 */
  all: Candle[];
  /** 截至最后一根已收盘 K 线（含）的切片，用于一切机械判断。 */
  closed: Candle[];
  /** 尾部形成中的根数：0 或 1。 */
  formingBars: number;
  /** 最后一根已收盘 K 线；没有则为 undefined。 */
  lastClosed: Candle | undefined;
}

/** 全部 K 线都已收盘。 */
export function allClosed(all: Candle[]): CandleClosure {
  return {
    all,
    closed: all,
    formingBars: 0,
    lastClosed: all.at(-1),
  };
}

/**
 * 按 `now`（毫秒）切出已收盘 K 线。末根 K 线的收盘时刻晚于 `now` 时它是形成中的：
 * 它仍在 `all` 里供展示，但会从 `closed` 里剔除。
 */
export function partitionCandles(all: Candle[], interval: string, now: number): CandleClosure {
  const last = all.at(-1);
  if (last === undefined) return { all, closed: [], formingBars: 0, lastClosed: undefined };
  const closeTimeMs = last.time * 1000 + intervalToMs(interval);
  if (closeTimeMs <= now) return allClosed(all);
  return { all, closed: all.slice(0, -1), formingBars: 1, lastClosed: all.at(-2) };
}
