/**
 * 指标请求文本 → 选择器（ADR-0008 的入参转译）。
 *
 * 让模型填一个紧凑字符串比让它构造嵌套 JSON 更不容易出错：
 *   "ma:50"、"ema:20"、"rsi:14"、"atr:14"、"macd:12/26/9"、"macd"
 * 解析失败一律**抛错并指出是哪一项**——不认识的指标被静默丢弃会让模型以为它算了。
 *
 * **校验规则全部从指标清单推导**（参数名、个数、是否整数），本模块不再手写 id 白名单与
 * arity 分支：加一个指标只改 `indicatorCatalog.ts`。
 */
import type { IndicatorSelector } from "./indicatorFacts";
import { paramNamesOf, paramSpecsOf, resolveIndicatorId, type IndicatorId } from "./indicatorCatalog";

/** 解析单条请求文本。 */
function parseOne(raw: string): IndicatorSelector {
  const [name, ...rest] = raw.split(":").map((part) => part.trim());
  const id = resolveIndicatorId(name ?? "");
  if (id === undefined) {
    throw new Error(`不认识的指标 ${JSON.stringify((name ?? "").trim())}（原文 "${raw}"）；请只用清单里列出的 id`);
  }

  const names = paramNamesOf(id);
  const specs = paramSpecsOf(id);
  const args = rest.join(":").split("/").map((part) => part.trim()).filter((part) => part !== "");
  const allOptional = names.every((param) => specs[param]!.default !== undefined);

  if (args.length === 0) {
    if (names.length > 0 && !allOptional) {
      throw new Error(`指标 "${raw}" 需要 ${names.length} 个参数（${names.join("/")}），例如 "${exampleFor(id)}"`);
    }
    return { id } as IndicatorSelector;
  }

  if (args.length !== names.length) {
    throw new Error(
      `指标 "${raw}" 需要 ${names.length} 个参数（${names.join("/")}），收到 ${args.length} 个；例如 "${exampleFor(id)}"`,
    );
  }

  const params: Record<string, number> = {};
  names.forEach((param, index) => {
    const spec = specs[param]!;
    const value = Number(args[index]);
    const ok = Number.isFinite(value) && value > 0 && (spec.integer !== true || Number.isInteger(value));
    if (!ok) {
      throw new Error(
        `指标 "${raw}" 的参数 ${param} 必须是正${spec.integer === true ? "整数" : "数"}，收到 ${JSON.stringify(args[index])}`,
      );
    }
    params[param] = value;
  });
  return { id, ...params } as IndicatorSelector;
}

/** 构造示例写法（用于报错里给出正确形态）。 */
function exampleFor(id: IndicatorId): string {
  const names = paramNamesOf(id);
  if (names.length === 0) return id;
  const values = names.map((param) => paramSpecsOf(id)[param]!.default ?? 10);
  return `${id}:${values.join("/")}`;
}

/** 解析一组请求文本，顺序原样保留。 */
export function parseIndicatorSelectors(specs: string[]): IndicatorSelector[] {
  return specs.map((spec) => parseOne(spec));
}
