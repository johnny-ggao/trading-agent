/**
 * 指标请求文本 → 选择器（ADR-0008 的入参转译）。
 *
 * 让模型填一个紧凑字符串比让它构造嵌套 JSON 更不容易出错：
 *   "ma:50"、"ema:20"、"rsi:14"、"atr:14"、"macd:12/26/9"、"macd"
 * 解析失败一律**抛错并指出是哪一项**——不认识的指标被静默丢弃会让模型以为它算了。
 */
import type { IndicatorSelector } from "./indicatorFacts";

/** 只有周期一个参数的指标。 */
const PERIOD_ONLY = new Set(["ma", "ema", "rsi", "atr", "vwma", "mfi", "adx"]);

/** 解析单条请求文本。 */
function parseOne(raw: string): IndicatorSelector {
  const [name, ...rest] = raw.split(":").map((part) => part.trim());
  const id = (name ?? "").toLowerCase();
  const args = rest.join(":").split("/").map((part) => part.trim()).filter((part) => part !== "");

  if (PERIOD_ONLY.has(id)) {
    if (args.length !== 1) {
      throw new Error(`指标 "${raw}" 需要且只需要一个周期参数，例如 "${id}:14"`);
    }
    const period = Number(args[0]);
    if (!Number.isInteger(period) || period <= 0) {
      throw new Error(`指标 "${raw}" 的周期必须是正整数，收到 "${args[0]}"`);
    }
    return { id: id as "ma" | "ema" | "rsi" | "atr" | "vwma" | "mfi" | "adx", period };
  }

  if (id === "obv") {
    if (args.length !== 0) throw new Error(`指标 "${raw}" 不接受参数，直接写 "obv"`);
    return { id: "obv" };
  }

  if (id === "bollinger" || id === "bollingerupper" || id === "bollingerlower") {
    const normalised = id === "bollinger" ? "bollinger" : id === "bollingerupper" ? "bollingerUpper" : "bollingerLower";
    if (args.length === 0) return { id: normalised } as IndicatorSelector;
    if (args.length !== 2) throw new Error(`指标 "${raw}" 需要 0 或 2 个参数（period/deviation），例如 "bollinger:20/2"`);
    const [period, deviation] = args.map(Number);
    if (period === undefined || deviation === undefined || !Number.isInteger(period) || period <= 0 || !Number.isFinite(deviation) || deviation <= 0) {
      throw new Error(`指标 "${raw}" 的参数不合法（period 正整数、deviation 正数）`);
    }
    return { id: normalised, period, deviation } as IndicatorSelector;
  }

  if (id === "supertrend") {
    if (args.length === 0) return { id: "supertrend" };
    if (args.length !== 2) throw new Error(`指标 "${raw}" 需要 0 或 2 个参数（period/multiplier），例如 "supertrend:10/3"`);
    const [period, multiplier] = args.map(Number);
    if (period === undefined || multiplier === undefined || !Number.isInteger(period) || period <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error(`指标 "${raw}" 的参数不合法（period 正整数、multiplier 正数）`);
    }
    return { id: "supertrend", period, multiplier };
  }

  if (id === "macd") {
    if (args.length === 0) return { id: "macd" };
    if (args.length !== 3) {
      throw new Error(`指标 "${raw}" 需要 0 或 3 个参数（fast/slow/signal），例如 "macd:12/26/9"`);
    }
    const [fast, slow, signal] = args.map(Number);
    for (const value of [fast, slow, signal]) {
      if (value === undefined || !Number.isInteger(value) || value <= 0) {
        throw new Error(`指标 "${raw}" 的参数必须是正整数，收到 "${args.join("/")}"`);
      }
    }
    return { id: "macd", fast: fast!, slow: slow!, signal: signal! };
  }

  throw new Error(`不认识的指标 "${id}"（原文 "${raw}"）；请只用清单里列出的 id`);
}

/** 解析一组请求文本，顺序原样保留。 */
export function parseIndicatorSelectors(specs: string[]): IndicatorSelector[] {
  return specs.map((spec) => parseOne(spec));
}
