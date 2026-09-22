/**
 * `trading_levels` 的响应契约：schema 与渲染同住一处（架构候选 1）。
 */
import type { JsonSchema, SchemaValue, TextBlock } from "./contract";

export const LEVELS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    symbol: { type: "string" },
    interval: { type: "string" },
    grounding: { type: "json" },
    pivots: { type: "json" },
    levels: { type: "json" },
    counts: { type: "json" },
    truncated: { type: "number" },
    reason: { type: "string" },
    required: { type: "number" },
    available: { type: "number" },
    hint: { type: "string" },
  },
} satisfies JsonSchema;

export type LevelsToolValue = SchemaValue<typeof LEVELS_OUTPUT_SCHEMA>;

/** payload → 文本块。 */
export function levelsBlocks(value: LevelsToolValue): TextBlock[] {
  if (value.ok !== true) {
    return [{
      type: "text",
      text: `未能给出价位（${String(value.reason ?? "unknown")}）：需要至少 ${String(value.required ?? "?")} 根，`
        + `当前只有 ${String(value.available ?? "?")} 根已收盘 K 线。${String(value.hint ?? "")}`,
    }];
  }
  const counts = value.counts as Record<string, number> | undefined;
  const grounding = value.grounding as { lastClosedBar?: number } | undefined;
  return [
    {
      type: "text",
      text: `已收盘到 bar ${String(grounding?.lastClosedBar ?? "?")}；`
        + `各类条数 ${JSON.stringify(counts)}，本次返回 ${String((value.levels as unknown[] | undefined)?.length ?? 0)} 条`
        + `${value.truncated === undefined || value.truncated === 0 ? "" : `（截掉 ${value.truncated} 条）`}。`,
    },
    { type: "text", text: JSON.stringify({ pivots: value.pivots, levels: value.levels }) },
  ];
}
