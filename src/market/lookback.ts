/**
 * 时间跨度（lookback）：**agent 用它表达"要看多长时间的历史"**。
 *
 * 为什么需要它：指标参数（`ma:200`）间接决定了要取多少根，但 agent 的真实意图往往是
 * "我要看这三个月"——而它没有参数能直接说这句话。上限也以时间为单位表述，这里让**请求**
 * 与**上限**使用同一种语义单位。
 *
 * 写法：`90d`（天）、`2w`（周）、`3M` 或 `3mo`（月）、`1y`（年）、`36h`（小时）、`90m`（分钟），
 * 或直接给根数 `500`。`M`/`mo` 是月、`m` 是分钟——不混。
 */
import { intervalToMs } from "./chart";

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  M: 2_592_000_000, // 30 天
  y: 31_536_000_000, // 365 天
};

export type Lookback = { ms: number } | { bars: number };

const USAGE = "lookback 写法：时长（如 90d / 2w / 3M / 36h / 90m / 1y）或根数（如 500）";

/** 解析时间跨度；不合法直接抛错，绝不静默回退到默认窗口。 */
export function parseLookback(raw: string): Lookback {
  const text = raw.trim();
  if (text === "") throw new Error(`${USAGE}；收到空字符串`);
  // 纯数字 = 根数
  if (/^\d+$/.test(text)) {
    const bars = Number(text);
    if (bars <= 0) throw new Error(`${USAGE}；根数必须为正`);
    return { bars };
  }
  // 时长：数字 + 单位。先把 "M"/"mo"/"MO" 归一成月，其余单位统一小写后再识别。
  const match = /^(\d+)\s*([A-Za-z]+)$/.exec(text);
  if (match === null) throw new Error(`${USAGE}；收到 ${JSON.stringify(raw)}`);
  const value = Number(match[1]);
  if (value <= 0) throw new Error(`${USAGE}；时长必须为正`);
  const rawUnit = match[2]!;
  const unit = /^(mo|M)$/.test(rawUnit) ? "M" : rawUnit.toLowerCase();
  const unitMs = UNIT_MS[unit];
  if (unitMs === undefined) throw new Error(`${USAGE}；不认识的单位 ${JSON.stringify(rawUnit)}`);
  return { ms: value * unitMs };
}

/** 把时间跨度换算成该周期上的根数（向上取整，保证覆盖不缩水）。 */
export function lookbackBars(raw: string, interval: string): number {
  const lookback = parseLookback(raw);
  if ("bars" in lookback) return lookback.bars;
  return Math.ceil(lookback.ms / intervalToMs(interval));
}
