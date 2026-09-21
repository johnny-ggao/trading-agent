export const SUPPORTED_INTERVALS = ["15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof SUPPORTED_INTERVALS)[number];

/** 未指定时使用的主周期（15m 只作为显式短线选择）。 */
export const DEFAULT_INTERVAL: Interval = "1h";

export function isInterval(value: string): value is Interval {
  return (SUPPORTED_INTERVALS as readonly string[]).includes(value);
}

/** 时间词 -> 主周期。顺序即优先级。 */
const TIME_WORD_RULES: ReadonlyArray<{ pattern: RegExp; interval: Interval }> = [
  { pattern: /(短线|超短|15m|15分|15分钟)/i, interval: "15m" },
  { pattern: /(这周|本周|一周|周内|week)/i, interval: "4h" },
  { pattern: /(这(个)?月|本月|一个月|月内|长线|长期|month|long[\s-]?term)/i, interval: "1d" },
  { pattern: /(今天|今日|当天|日内|盘中|today)/i, interval: "1h" },
];

/**
 * 把用户给的时间表达解析为主周期：
 * 显式周期（15m/1h/4h/1d）原样返回，时间词按规则映射，其余回落默认。
 */
export function resolveInterval(raw?: string): Interval {
  if (raw === undefined) return DEFAULT_INTERVAL;
  const text = raw.trim().toLowerCase();
  if (isInterval(text)) return text;
  for (const rule of TIME_WORD_RULES) {
    if (rule.pattern.test(text)) return rule.interval;
  }
  return DEFAULT_INTERVAL;
}
