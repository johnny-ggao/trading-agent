/**
 * `trading_indicator` 的响应契约：schema 与 payload/blocks **同住一处**。
 *
 * 见 `contract.ts` 的说明：这三样以前分散在 `src/index.ts` 的注册块里，漏改不会有编译错误。
 */
import type { IndicatorFactsResponse } from "../market/facts";
import { failurePayload, type JsonSchema, type SchemaValue, type TextBlock } from "./contract";

export const INDICATOR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    symbol: { type: "string" },
    interval: { type: "string" },
    grounding: { type: "json" },
    indicators: { type: "json" },
    reason: { type: "string" },
    required: { type: "number" },
    available: { type: "number" },
    hint: { type: "string" },
  },
} satisfies JsonSchema;

/** 由 schema 推断出的 payload 类型——类型与契约同源。 */
export type IndicatorToolValue = SchemaValue<typeof INDICATOR_OUTPUT_SCHEMA>;

/** 领域结果 → 给模型的 payload（成功与失败同一形状）。 */
export function indicatorPayload(result: IndicatorFactsResponse): IndicatorToolValue {
  if (result.ok !== true) {
    return failurePayload(result.reason, result.hint, result.required, result.available) as IndicatorToolValue;
  }
  return {
    ok: true,
    symbol: result.symbol,
    interval: result.interval,
    grounding: result.grounding as unknown as IndicatorToolValue["grounding"],
    indicators: result.indicators as unknown as IndicatorToolValue["indicators"],
  };
}

/** payload → 文本块。 */
export function indicatorBlocks(payload: IndicatorToolValue): TextBlock[] {
  const value = payload as {
    ok?: boolean;
    reason?: string;
    required?: number;
    available?: number;
    hint?: string;
    grounding?: { lastClosedBar?: number; barsUsed?: number };
    indicators?: unknown;
  };
  if (value.ok !== true) {
    return [{
      type: "text",
      text: `未能给出指标值（${String(value.reason ?? "unknown")}）：需要 ${String(value.required ?? "?")} 根，`
        + `当前只有 ${String(value.available ?? "?")} 根已收盘 K 线。${String(value.hint ?? "")}`,
    }];
  }
  return [
    {
      type: "text",
      text: `已收盘到 bar ${String(value.grounding?.lastClosedBar ?? "?")}`
        + `（共 ${String(value.grounding?.barsUsed ?? "?")} 根，仅已收盘）：`,
    },
    { type: "text", text: JSON.stringify(value.indicators) },
  ];
}