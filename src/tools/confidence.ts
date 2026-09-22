/**
 * `trading_confidence` 的响应契约：schema 与渲染同住一处（架构候选 1）。
 */
import type { JsonSchema, SchemaValue, TextBlock } from "./contract";

export const CONFIDENCE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    symbol: { type: "string" },
    interval: { type: "string" },
    direction: { type: "string" },
    support: { type: "json" },
    confidence: { type: "json" },
    sufficiency: { type: "json" },
    agreement: { type: "json" },
    model: { type: "string" },
    reason: { type: "string" },
    hint: { type: "string" },
  },
} satisfies JsonSchema;

export type ConfidenceToolValue = SchemaValue<typeof CONFIDENCE_OUTPUT_SCHEMA>;

/** payload → 文本块。 */
export function confidenceBlocks(value: ConfidenceToolValue): TextBlock[] {
  if (value.ok !== true) {
    return [{
      type: "text",
      text: `未完成置信度校准（${String(value.reason ?? "unknown")}）。${String(value.hint ?? "")}`,
    }];
  }
  const support = value.support as { score?: number; label?: string; probabilities?: unknown } | undefined;
  const confidence = value.confidence as { value?: number; level?: string } | undefined;
  const sufficiency = value.sufficiency as { score?: number } | null | undefined;
  const text = `Jev 校准：支持度 ${support?.score ?? "?"}/4（${support?.label ?? "?"}）；`
    + `置信度 ${confidence?.value ?? "?"}（${confidence?.level ?? "?"}）`
    + `${sufficiency === undefined || sufficiency === null ? "" : `；证据充分度 ${sufficiency.score ?? "?"}`}。`
    + `模型 ${String(value.model ?? "?")}。`;
  const blocks: TextBlock[] = [{ type: "text", text }];
  if (support?.probabilities !== undefined) {
    blocks.push({ type: "text", text: `支持度概率分布：${JSON.stringify(support.probabilities)}` });
  }
  return blocks;
}
