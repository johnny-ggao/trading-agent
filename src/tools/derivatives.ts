/**
 * `trading_derivatives` 的响应契约：schema 与渲染同住一处（架构候选 1）。
 */
import type { JsonSchema, SchemaValue, TextBlock } from "./contract";

export const DERIVATIVES_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    symbol: { type: "string" },
    source: { type: "string" },
    snapshot: { type: "json" },
    predictedFunding: { type: "json" },
    openInterestCap: { type: "json" },
    reason: { type: "string" },
    hint: { type: "string" },
  },
} satisfies JsonSchema;

export type DerivativesToolValue = SchemaValue<typeof DERIVATIVES_OUTPUT_SCHEMA>;

/** payload → 文本块。 */
export function derivativesBlocks(value: DerivativesToolValue): TextBlock[] {
  if (value.ok !== true) {
    return [{
      type: "text",
      text: `未取到衍生品数据（${String(value.reason ?? "unknown")}）。${String(value.hint ?? "")}`,
    }];
  }
  const blocks: TextBlock[] = [{
    type: "text",
    text: `${String(value.symbol)} 的${String(value.source ?? "")}永续数据（机械事实）：${JSON.stringify(value.snapshot)}`,
  }];
  if (value.predictedFunding !== undefined) {
    blocks.push({ type: "text", text: `跨场所预测资金费：${JSON.stringify(value.predictedFunding)}` });
  }
  if (value.openInterestCap !== undefined) {
    blocks.push({ type: "text", text: `OI 已达上限的资产：${JSON.stringify(value.openInterestCap)}` });
  }
  return blocks;
}
