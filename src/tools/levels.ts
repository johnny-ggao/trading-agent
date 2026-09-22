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
  const counts = (value.counts ?? {}) as Record<string, number>;
  const grounding = value.grounding as { lastClosedBar?: number } | undefined;
  const returnedLevels = (value.levels as unknown[] | undefined)?.length ?? 0;
  const returnedPivots = (value.pivots as unknown[] | undefined)?.length ?? 0;
  const totalLevels = (counts.support ?? 0) + (counts.resistance ?? 0) + (counts.fib ?? 0);
  const totalPivots = counts.pivots ?? 0;
  // 上限是缺省行为，所以要说清"返回了多少 / 总共多少"，否则模型会以为这就是全部。
  const detail = `支撑 ${counts.support ?? 0}/阻力 ${counts.resistance ?? 0}/斐波 ${counts.fib ?? 0}`;
  return [
    {
      type: "text",
      text: `已收盘到 bar ${String(grounding?.lastClosedBar ?? "?")}；`
        + `本次返回 ${returnedLevels} 条价位（共 ${totalLevels} 条：${detail}）、`
        + `${returnedPivots} 个枢轴（共 ${totalPivots} 个）`
        + `${value.truncated === undefined || value.truncated === 0 ? "" : `；价位截掉 ${value.truncated} 条`}。`
        + `需要更多就调大 maxLevels。`,
    },
    { type: "text", text: JSON.stringify({ pivots: value.pivots, levels: value.levels }) },
  ];
}
